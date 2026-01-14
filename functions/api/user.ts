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
    await upsertUser(env.DB, user.id, user.name, user.email);

    // Get full user record with privilege
    const userRecord = await getUserById(env.DB, user.id);

    // Get user's favorites
    const favorites = await getUserFavorites(env.DB, user.id);

    return Response.json({
      ok: true,
      user: {
        id: userRecord?.id ?? user.id,
        name: userRecord?.name ?? user.name,
        email: userRecord?.email ?? user.email,
        privilege: userRecord?.privilege ?? 'user',
      },
      favorites,
    });
  } catch (error) {
    console.error('User API error:', error);
    return Response.json(
      { ok: false, error: 'Failed to fetch user data' },
      { status: 500 }
    );
  }
};
