// Single conference API endpoint

import type { Env, AuthContext } from '../../lib/types';
import { getConferenceById, deleteConference, getUserById } from '../../lib/db';
import { deleteVectors } from '../../lib/vectorize';
import { forbiddenResponse } from '../../lib/auth';

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

export const onRequestDelete: PagesFunction = async (context) => {
  const { env, data, params } = context;
  const user = data.user;

  if (!user) return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  const userRecord = await getUserById(env.DB, user.id);
  if (userRecord?.privilege !== 'admin') return forbiddenResponse('Admin access required');

  const id = decodeURIComponent(Array.isArray(params.id) ? params.id[0] : params.id as string);

  try {
    await deleteConference(env.DB, id);
    await deleteVectors(env, [id]);
    return Response.json({ ok: true, deleted: id });
  } catch (error) {
    console.error('Conference delete error:', error);
    return Response.json({ ok: false, error: 'Failed to delete conference' }, { status: 500 });
  }
};
