import type { Env, AuthContext } from '../../lib/types';
import { search_user_profiles } from '../../lib/db';

type PagesFunction<E = Env> = (
  context: EventContext<E, string, AuthContext>
) => Response | Promise<Response>;

export const onRequestGet: PagesFunction = async (context) => {
  const { env, data } = context;
  const user = data.user;

  if (!user) {
    return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(context.request.url);
  const q = url.searchParams.get('q') ?? '';

  const users = await search_user_profiles(env.DB, q, user.id, 20);
  return Response.json({ ok: true, users });
};
