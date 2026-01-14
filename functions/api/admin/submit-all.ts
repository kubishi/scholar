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
        // Generate embedding text
        const embeddingText = [
          submission.conference_name,
          submission.topics,
          submission.city,
          submission.country,
        ]
          .filter(Boolean)
          .join(' | ');

        // Generate embedding
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
