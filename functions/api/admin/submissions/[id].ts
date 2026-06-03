import type { Env, AuthContext } from '../../../lib/types';
import { getUserById, getSubmissionById, updateSubmission } from '../../../lib/db';
import { forbiddenResponse } from '../../../lib/auth';

type PagesFunction<E = Env> = (
  context: EventContext<E, string, AuthContext>
) => Response | Promise<Response>;

export const onRequestPatch: PagesFunction = async (context) => {
  const { env, data, params, request } = context;
  const user = data.user;

  if (!user) return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  const rawId = params.id as string;
  const id = decodeURIComponent(Array.isArray(rawId) ? rawId[0] : rawId);

  const userRecord = await getUserById(env.DB, user.id);
  if (userRecord?.privilege !== 'admin') return forbiddenResponse('Admin access required');

  const submission = await getSubmissionById(env.DB, id);
  if (!submission) return Response.json({ ok: false, error: 'Submission not found' }, { status: 404 });

  try {
    const body = await request.json<{
      conference_name?: string;
      city?: string;
      country?: string;
      deadline?: string;
      start_date?: string;
      end_date?: string;
      url?: string;
      topics?: string;
    }>();

    await updateSubmission(env.DB, id, body);

    return Response.json({ ok: true, message: 'Submission updated' });
  } catch (error) {
    console.error('Admin update submission error:', error);
    return Response.json({ ok: false, error: 'Failed to update submission' }, { status: 500 });
  }
};
