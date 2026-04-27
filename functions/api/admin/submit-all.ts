// Admin submit-all API endpoint - publishes all approved conferences

import type { Env, AuthContext, SubmittedConference, ConferenceVectorMetadata } from '../../lib/types';
import { getUserById, upsertConference, updateSubmissionStatus } from '../../lib/db';
import { getEmbedding } from '../../lib/openai';
import { upsertVector } from '../../lib/vectorize';
import { forbiddenResponse } from '../../lib/auth';

type PagesFunction<E = Env> = (
  context: EventContext<E, string, AuthContext>
) => Response | Promise<Response>;



export const onRequestPost: PagesFunction = async (context) => {
  const { env, data } = context;
  const user = data.user;

  if (!user) {
    return Response.json(
      { ok: false, error: 'Unauthorized' },
      { status: 401 }
    );
  }

  try {
    // Check admin privilege
    const userRecord = await getUserById(env.DB, user.id);
    if (userRecord?.privilege !== 'admin') {
      return forbiddenResponse('Admin access required');
    }

    // Get all approved submissions
    const approved = await env.DB.prepare(
      "SELECT * FROM submitted_conferences WHERE status = 'approved'"
    ).all<SubmittedConference>();

    if (approved.results.length === 0) {
      return Response.json({
        ok: true,
        message: 'No approved submissions to publish',
        count: 0,
      });
    }

    let publishedCount = 0;
    const errors: string[] = [];

    for (const submission of approved.results) {
      try {
        const papers = await getSemanticScholarPapers(submission.id, submission.conference_name, env);
        const paperSnippets = papers
          .map(p => p.abstract ?? p.title)
          .filter(Boolean)
          .slice(0, 10)
          .join(' ');

        const embeddingText = [
          `${submission.conference_name} is a research conference.`,
          submission.topics ? `Key research areas include: ${submission.topics}.` : '',
          paperSnippets ? `Recent accepted work: ${paperSnippets}` : '',
          submission.city || submission.country
            ? `Location: ${[submission.city, submission.country].filter(Boolean).join(', ')}.`
            : '',
        ].filter(Boolean).join(' ');
        console.log(`[${submission.id}] ${papers.length} papers used:`, papers.map(p => p.title));
        console.log(`[${submission.id}] first 5 abstracts:`, papers.slice(0, 5).map(p => p.abstract));
        const vector = await getEmbedding(embeddingText, env.OPENAI_API_KEY);

        // Upsert to conferences table
        await upsertConference(env.DB, {
          id: submission.id,
          title: submission.conference_name,
          acronym: submission.id,
          city: submission.city ?? undefined,
          country: submission.country ?? undefined,
          deadline: submission.deadline ?? undefined,
          start_date: submission.start_date ?? undefined,
          end_date: submission.end_date ?? undefined,
          topics: submission.topics ?? undefined,
          url: submission.url ?? undefined,
        });

        // Upsert to Vectorize
        const metadata: ConferenceVectorMetadata = {
          id: submission.id,
          title: submission.conference_name,
          acronym: submission.id,
          city: submission.city ?? undefined,
          country: submission.country ?? undefined,
          deadline: submission.deadline ?? undefined,
          start_date: submission.start_date ?? undefined,
          end_date: submission.end_date ?? undefined,
          enriched_paper_count: papers.length,
        };
        await upsertVector(env, submission.id, vector, metadata);

        // Mark as submitted
        await updateSubmissionStatus(env.DB, submission.id, 'submitted');

        publishedCount++;
      } catch (error) {
        console.error(`Failed to publish ${submission.id}:`, error);
        errors.push(submission.id);
      }
    }

    return Response.json({
      ok: true,
      message: `Published ${publishedCount} conference(s)`,
      count: publishedCount,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error('Admin submit-all API error:', error);
    return Response.json(
      { ok: false, error: 'Failed to publish conferences' },
      { status: 500 }
    );
  }
};

// Fetch the pepers submitted to semantic scholar of this conference
export async function getSemanticScholarPapers(acronym: string, conferenceName: string, env: Env) {
  // Try: acronym + full name
  const queries = [acronym, conferenceName].filter(Boolean);
  const seen = new Set<string>();
  const allPapers: Array<{ title?: string; abstract?: string; venue?: string }> = [];

  for (const query of queries) {
    const url = `https://api.semanticscholar.org/graph/v1/paper/search/bulk?query=${encodeURIComponent(query)}&fields=title,abstract,venue&limit=30`;
    
    const res = await fetch(url, {
      headers: { 'x-api-key': env.SEMANTIC_SCHOLAR_API_KEY! }
    });

    if (!res.ok) {
      console.warn(`Semantic Scholar query failed for "${query}": ${res.status}`);
      continue;
    }

    const data = await res.json<{ data?: Array<{ paperId?: string; title?: string; abstract?: string; venue?: string }> }>();
    
    for (const p of data.data ?? []) {
      if (!p.paperId || seen.has(p.paperId)) continue;
      const venue = p.venue?.toLowerCase() ?? '';
      if (
        venue.includes(acronym.toLowerCase()) ||
        venue.includes(conferenceName.toLowerCase())
      ) {
        seen.add(p.paperId);
        allPapers.push(p);
      }
    }
  }

  console.log(`[${acronym}] Found ${allPapers.length} matching papers`);
  return allPapers;
}
