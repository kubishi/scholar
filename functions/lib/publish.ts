// Shared logic for publishing an approved/auto-update submission to the live
// conferences table and Vectorize index.

import type { Env, SubmittedConference, ConferenceVectorMetadata } from './types';
import { upsertConference, updateSubmissionStatus } from './db';
import { getEmbedding } from './openai';
import { upsertVector } from './vectorize';

// Fetch the papers submitted to semantic scholar of this conference
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

// Publishes a submission to the conferences table + Vectorize, then marks it 'submitted'.
export async function publishSubmission(env: Env, submission: SubmittedConference): Promise<void> {
  // const papers = await getSemanticScholarPapers(submission.id, submission.conference_name, env);
  // const paperSnippets = papers
  //   .map(p => p.abstract ?? p.title)
  //   .filter(Boolean)
  //   .slice(0, 10)
  //   .join(' ');

  const embeddingText = [
    `${submission.conference_name} is a research conference.`,
    submission.topics ? `Key research areas include: ${submission.topics}.` : '',
    // paperSnippets ? `Recent accepted work: ${paperSnippets}` : '',
    submission.city || submission.country
      ? `Location: ${[submission.city, submission.country].filter(Boolean).join(', ')}.`
      : '',
  ].filter(Boolean).join(' ');
  // console.log(`[${submission.id}] ${papers.length} papers used:`, papers.map(p => p.title));

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
    // enriched_paper_count: papers.length,
  };
  await upsertVector(env, submission.id, vector, metadata);

  // Mark as submitted
  await updateSubmissionStatus(env.DB, submission.id, 'submitted');
}
