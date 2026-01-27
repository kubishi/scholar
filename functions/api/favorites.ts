// Favorites API endpoint - toggle conference favorites

import type { Env, AuthContext } from '../lib/types';
import { isFavorited, addFavorite, removeFavorite } from '../lib/db';

type PagesFunction<E = Env> = (
  context: EventContext<E, string, AuthContext>
) => Response | Promise<Response>;

interface FavoriteRequest {
  conference_id: string;
}

export const onRequestPost: PagesFunction = async (context) => {
  const { request, env, data } = context;
  const user = data.user;

  if (!user) {
    return Response.json(
      { ok: false, error: 'Unauthorized' },
      { status: 401 }
    );
  }

  try {
    // assume the JSON matches the FavoriteRequest shape
    const body = await request.json<FavoriteRequest>();
    const conferenceId = body.conference_id;

    if (!conferenceId) {
      return Response.json(
        { ok: false, error: 'Missing conference_id' },
        { status: 400 }
      );
    }

    // Check if already favorited
    const alreadyFavorited = await isFavorited(env.DB, user.id, conferenceId);

    if (alreadyFavorited) {
      // Remove favorite
      await removeFavorite(env.DB, user.id, conferenceId);
      return Response.json({ ok: true, status: 'removed' });
    } else {
      // Add favorite
      await addFavorite(env.DB, user.id, conferenceId);
      return Response.json({ ok: true, status: 'added' });
    }
  } catch (error) {
    console.error('Favorites API error:', error);
    return Response.json(
      { ok: false, error: 'Failed to update favorite' },
      { status: 500 }
    );
  }
};
