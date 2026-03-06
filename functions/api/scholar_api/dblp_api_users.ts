import type { Env, AuthContext } from '../../lib/types';

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

  const dblpUrl = `https://dblp.org/search/author/api?q=${encodeURIComponent(name)}&format=json&h=10`;
  const res = await fetch(dblpUrl);
  const json = (await res.json()) as {
    result?: { hits?: { hit?: Array<{ '@id'?: string; id?: string; info?: { author?: string; url?: string } }> } };
  };

  const hits = json?.result?.hits?.hit ?? [];
  const authors = Array.isArray(hits) ? hits.map((hit) => ({
    id: hit['@id'] ?? hit.id ?? '',
    name: hit.info?.author ?? '',
    url: hit.info?.url ?? '',
  })).filter((a: { name: string }) => a.name) : [];

  return Response.json({ ok: true, authors });
};