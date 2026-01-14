// Single conference API endpoint

import type { Env, AuthContext } from '../../lib/types';
import { getConferenceById } from '../../lib/db';

type PagesFunction<E = Env> = (
  context: EventContext<E, string, AuthContext>
) => Response | Promise<Response>;

export const onRequestGet: PagesFunction = async (context) => {
  const { env, params } = context;
  const id = params.id as string;

  if (!id) {
    return Response.json(
      { ok: false, error: 'Missing conference ID' },
      { status: 400 }
    );
  }

  try {
    const conference = await getConferenceById(env.DB, id);

    if (!conference) {
      return Response.json(
        { ok: false, error: 'Conference not found' },
        { status: 404 }
      );
    }

    return Response.json({ ok: true, conference });
  } catch (error) {
    console.error('Conference API error:', error);
    return Response.json(
      { ok: false, error: 'Failed to fetch conference' },
      { status: 500 }
    );
  }
};
