// Single conference API endpoint

import type { Env, AuthContext } from '../../lib/types';
import { getConferenceById } from '../../lib/db';

type PagesFunction<E = Env> = (
  context: EventContext<E, string, AuthContext>
) => Response | Promise<Response>;
  
export const onRequestGet: PagesFunction = async (context) => {
  // env is for the database querying
  // params is for the id of the conference from user imput
  const { env, params} = context;
  const rawId = params.id as string;

  // Decode the encoded ID because search doesnt work on encoded ids
  // WHen people search they dont search with encoded ids
  const id = decodeURIComponent(Array.isArray(rawId) ? rawId[0]: rawId)

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
