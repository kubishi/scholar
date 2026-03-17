import type { Env, AuthContext } from '../../lib/types';
import { update_dblp_id } from '../../lib/db';

type PagesFunction<E = Env> = (
  context: EventContext<E, string, AuthContext>
) => Response | Promise<Response>;

export const onRequestGet: PagesFunction = async (context) => {
  const { data, request } = context;
  const user = data.user;
  if (!user) {
    return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }
  const url = new URL(request.url);
  const name = url.searchParams.get('name') || '';
  if (!name) {
    return Response.json({ ok: false, error: 'Name is required' }, { status: 400 });
  }
  const dblpUrl = `https://dblp.org/search/publ/api?q=${encodeURIComponent(name)}&format=json`;
  const res = await fetch(dblpUrl);
  const json = await res.json();
  return Response.json({ ok: true, papers: json });
}

export const onRequestPost: PagesFunction = async (context) => {
      const { env, data } = context;
    const user = data.user;
  
    if (!user) {
      return Response.json(
        { ok: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await context.request.json<{ dblp_id: string }>();
    const { dblp_id } = body;

    await update_dblp_id(env.DB, user.id, dblp_id);

    return Response.json({ ok: true });
}