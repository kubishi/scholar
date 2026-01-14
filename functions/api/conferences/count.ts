// Conference count API endpoint

import type { Env, AuthContext } from '../../lib/types';
import { getConferenceCount } from '../../lib/db';

type PagesFunction<E = Env> = (
  context: EventContext<E, string, AuthContext>
) => Response | Promise<Response>;

export const onRequestGet: PagesFunction = async (context) => {
  const { env } = context;

  try {
    const count = await getConferenceCount(env.DB);
    return Response.json({ ok: true, count });
  } catch (error) {
    console.error('Count API error:', error);
    return Response.json(
      { ok: false, error: 'Failed to get count' },
      { status: 500 }
    );
  }
};
