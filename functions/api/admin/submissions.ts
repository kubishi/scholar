// Admin submissions list API endpoint

import type { Env, AuthContext } from '../../lib/types';
import { getUserById, getPendingSubmissions, deleteAllSubmissions } from '../../lib/db';
import { forbiddenResponse } from '../../lib/auth';

type PagesFunction<E = Env> = (
  context: EventContext<E, string, AuthContext>
) => Response | Promise<Response>;

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

    const now = new Date().toISOString();
    const result = await env.DB.prepare(
      "UPDATE submitted_conferences SET status = 'approved', approved_at = ? WHERE status = 'waiting'"
    ).bind(now).run();

    return Response.json({ ok: true, count: result.meta.changes });
  } catch (error) {
    console.error('Approve-all error:', error);
    return Response.json({ ok: false, error: 'Failed to approve all' }, { status: 500 });
  }
};

export const onRequestDelete: PagesFunction = async (context) => {
  const { env, data } = context;
  const user = data.user;

  if (!user) return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  const userRecord = await getUserById(env.DB, user.id);
  if (userRecord?.privilege !== 'admin') return forbiddenResponse('Admin access required');

  try {
    const count = await deleteAllSubmissions(env.DB);
    return Response.json({ ok: true, count });
  } catch (error) {
    console.error('Delete-all submissions error:', error);
    return Response.json({ ok: false, error: 'Failed to delete all submissions' }, { status: 500 });
  }
};

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
