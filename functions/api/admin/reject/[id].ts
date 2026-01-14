// Admin reject submission API endpoint

import type { Env, AuthContext } from '../../../lib/types';
import { getUserById, getSubmissionById, deleteSubmission } from '../../../lib/db';
import { forbiddenResponse } from '../../../lib/auth';

type PagesFunction<E = Env> = (
  context: EventContext<E, string, AuthContext>
) => Response | Promise<Response>;

export const onRequestDelete: PagesFunction = async (context) => {
  const { env, data, params } = context;
  const user = data.user;
  const submissionId = params.id as string;

  if (!user) {
    return Response.json(
      { ok: false, error: 'Unauthorized' },
      { status: 401 }
    );
  }

  if (!submissionId) {
    return Response.json(
      { ok: false, error: 'Missing submission ID' },
      { status: 400 }
    );
  }

  try {
    // Check admin privilege
    const userRecord = await getUserById(env.DB, user.id);
    if (userRecord?.privilege !== 'admin') {
      return forbiddenResponse('Admin access required');
    }

    // Check submission exists
    const submission = await getSubmissionById(env.DB, submissionId);
    if (!submission) {
      return Response.json(
        { ok: false, error: 'Submission not found' },
        { status: 404 }
      );
    }

    // Delete submission
    await deleteSubmission(env.DB, submissionId);

    return Response.json({
      ok: true,
      message: 'Submission rejected and deleted',
    });
  } catch (error) {
    console.error('Admin reject API error:', error);
    return Response.json(
      { ok: false, error: 'Failed to reject submission' },
      { status: 500 }
    );
  }
};
