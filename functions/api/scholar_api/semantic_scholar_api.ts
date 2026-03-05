import type { Env, AuthContext } from '../../lib/types';

type PagesFunction<E = Env> = (
  context: EventContext<E, string, AuthContext>
) => Response | Promise<Response>;

export const onRequestGet: PagesFunction = async (context) => {
  const { env, data, request } = context;
  const user = data.user;

  if (!user) {
    return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const authorId = url.searchParams.get('author_id') || '1751762';
  const apiKey = env.SEMANTIC_SCHOLAR_API_KEY;

  if (!apiKey) {
    return Response.json({ ok: false, error: 'Semantic Scholar API key not configured' }, { status: 500 });
  }

  const apiUrl = `https://api.semanticscholar.org/graph/v1/author/${encodeURIComponent(authorId)}?fields=name,url,papers,papers.abstract`;
  const res = await fetch(apiUrl, {
    headers: { 'x-api-key': apiKey },
  });
  const json = await res.json();
  console.log(json, "semantic scholar api response")
  return Response.json({ ok: true, author: json.author ?? json });
};