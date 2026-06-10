// Admin endpoint - approves and publishes all pending automation worker updates

import type { Env, AuthContext, SubmittedConference } from '../../lib/types';
import { getUserById, getConferenceById } from '../../lib/db';
import { publishSubmission } from '../../lib/publish';
import { forbiddenResponse } from '../../lib/auth';

type PagesFunction<E = Env> = (
  context: EventContext<E, string, AuthContext>
) => Response | Promise<Response>;

// Minimum word-overlap (Jaccard similarity) required between the existing
// conference title and the submission's title for it to be auto-published.
const NAME_SIMILARITY_THRESHOLD = 0.4;

function normalizeTitle(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b\d{4}\b/g, '') // strip years
    .replace(/[^a-z0-9\s]/g, ' ') // strip punctuation
    .replace(/\s+/g, ' ')
    .trim();
}

function nameSimilarity(a: string, b: string): number {
  const wordsA = new Set(normalizeTitle(a).split(' ').filter(Boolean));
  const wordsB = new Set(normalizeTitle(b).split(' ').filter(Boolean));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;

  const intersection = new Set([...wordsA].filter(w => wordsB.has(w)));
  const union = new Set([...wordsA, ...wordsB]);
  return intersection.size / union.size;
}

export const onRequestPost: PagesFunction = async (context) => {
  const { env, data } = context;
  const user = data.user;

  if (!user) {
    return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const userRecord = await getUserById(env.DB, user.id);
    if (userRecord?.privilege !== 'admin') {
      return forbiddenResponse('Admin access required');
    }

    const pending = await env.DB.prepare(
      "SELECT * FROM submitted_conferences WHERE status = 'waiting' AND edit_type = 'auto-update'"
    ).all<SubmittedConference>();

    if (pending.results.length === 0) {
      return Response.json({
        ok: true,
        message: 'No automation worker updates to publish',
        count: 0,
      });
    }

    let publishedCount = 0;
    const errors: string[] = [];
    const skipped: string[] = [];

    for (const submission of pending.results) {
      try {
        const existing = await getConferenceById(env.DB, submission.id);
        if (existing && nameSimilarity(existing.title, submission.conference_name) < NAME_SIMILARITY_THRESHOLD) {
          console.warn(`Skipping ${submission.id}: name mismatch ("${existing.title}" vs "${submission.conference_name}")`);
          skipped.push(submission.id);
          continue;
        }

        await publishSubmission(env, submission);
        publishedCount++;
      } catch (error) {
        console.error(`Failed to auto-publish ${submission.id}:`, error);
        errors.push(submission.id);
      }
    }

    return Response.json({
      ok: true,
      message: `Published ${publishedCount} conference update(s)`,
      count: publishedCount,
      errors: errors.length > 0 ? errors : undefined,
      skipped: skipped.length > 0 ? skipped : undefined,
    });
  } catch (error) {
    console.error('Approve auto-updates error:', error);
    return Response.json({ ok: false, error: 'Failed to approve auto-updates' }, { status: 500 });
  }
};
