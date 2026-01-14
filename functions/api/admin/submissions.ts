// Admin submissions list API endpoint

import type { Env, AuthContext } from '../../lib/types';
import { getUserById, getPendingSubmissions } from '../../lib/db';
import { forbiddenResponse } from '../../lib/auth';

type PagesFunction<E = Env> = (
  context: EventContext<E, string, AuthContext>
) => Response | Promise<Response>;

export const onRequestGet: PagesFunction = async (context) => {
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

    // Get pending submissions
    const submissions = await getPendingSubmissions(env.DB);

    return Response.json({ ok: true, submissions });
  } catch (error) {
    console.error('Admin submissions API error:', error);
    return Response.json(
      { ok: false, error: 'Failed to fetch submissions' },
      { status: 500 }
    );
  }
};
