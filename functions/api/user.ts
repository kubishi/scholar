// User API endpoint - get user profile and favorites

import type { Env, AuthContext } from '../lib/types';
import { upsertUser, getUserById, getUserFavorites } from '../lib/db';

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
    // Upsert user record (create or update last seen)
    await upsertUser(env.DB, user.id, user.name ?? null, user.email ?? null);

    // Get full user record with privilege
    const userRecord = await getUserById(env.DB, user.id);

    // Get user's favorites
    const favorites = await getUserFavorites(env.DB, user.id);

    return Response.json({
      ok: true,
      user: {
        id: userRecord?.id ?? user.id,
        name: userRecord?.name ?? user.name ?? null,
        email: userRecord?.email ?? user.email ?? null,
        privilege: userRecord?.privilege ?? 'user',
      },
      favorites,
    });
  } catch (error) {
    console.error('User API error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : '';
    return Response.json(
      { ok: false, error: `Failed to fetch user data: ${errorMessage}`, stack: errorStack },
      { status: 500 }
    );
  }
};
