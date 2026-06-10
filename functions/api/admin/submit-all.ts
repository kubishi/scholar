// Admin submit-all API endpoint - publishes all approved conferences

import type { Env, AuthContext, SubmittedConference } from '../../lib/types';
import { getUserById } from '../../lib/db';
import { publishSubmission } from '../../lib/publish';
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
        await publishSubmission(env, submission);
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
