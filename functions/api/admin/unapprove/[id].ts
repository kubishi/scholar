import type { Env, AuthContext } from '../../../lib/types';
import { getUserById, getSubmissionById, updateSubmissionStatus } from '../../../lib/db';
import { forbiddenResponse } from '../../../lib/auth';

type PagesFunction<E = Env> = (
  context: EventContext<E, string, AuthContext>
) => Response | Promise<Response>;

export const onRequestPost: PagesFunction = async (context) => {
  const { env, data, params } = context;
  const user = data.user;

  if (!user) return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  const rawId = params.id as string;
  const id = decodeURIComponent(Array.isArray(rawId) ? rawId[0] : rawId);

  const userRecord = await getUserById(env.DB, user.id);
  if (userRecord?.privilege !== 'admin') return forbiddenResponse('Admin access required');

  const submission = await getSubmissionById(env.DB, id);
  if (!submission) return Response.json({ ok: false, error: 'Submission not found' }, { status: 404 });

  try {
    await updateSubmissionStatus(env.DB, id, 'waiting');
    return Response.json({ ok: true, message: 'Submission reverted to waiting' });
  } catch (error) {
    console.error('Admin unapprove error:', error);
    return Response.json({ ok: false, error: 'Failed to unapprove submission' }, { status: 500 });
  }
};
