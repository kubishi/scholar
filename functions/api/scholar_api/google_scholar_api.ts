import type { Env, AuthContext } from '../../lib/types';

type PagesFunction<E = Env> = (
  context: EventContext<E, string, AuthContext>
) => Response | Promise<Response>;

export const onRequestGet: PagesFunction = async (context) => {
  const { env, data, request } = context;
  // console.log(env, "ENV", data, "DATA", request, "REQUEST")
  const user = data.user;

  if (!user) {
    return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const authorId = url.searchParams.get('author_id') || 'kukA0LcAAAAJ';
  const apiKey = env.GOOGLE_SCHOLAR_API_KEY;

  if (!apiKey) {
    return Response.json(
      { ok: false, error: 'Google Scholar API key not configured' },
      { status: 500 }
    );
  }

  const serpUrl = `https://serpapi.com/search.json?engine=google_scholar_author&author_id=${encodeURIComponent(authorId)}&api_key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(serpUrl);
  const json = await res.json();

  console.log(json.articles, "CRINGEEEEEEEEEEEEEEE")

  return Response.json({ ok: true, author: json.author ?? json });
};
