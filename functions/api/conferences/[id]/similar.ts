import type { Env, AuthContext } from '../../../lib/types';
import { getConferenceById, getConferencesByIds } from '../../../lib/db';
import { getEmbedding } from '../../../lib/openai';
import { vectorSearch } from '../../../lib/vectorize';

type PagesFunction<E = Env> = (
  context: EventContext<E, string, AuthContext>
) => Response | Promise<Response>;

export const onRequestGet: PagesFunction = async (context) => {
  const { env, params, request } = context;

  const rawId = params.id as string;
  const id = decodeURIComponent(Array.isArray(rawId) ? rawId[0] : rawId);
  if (!id) return Response.json({ ok: false, error: 'Missing conference ID' }, { status: 400 });

  const url = new URL(request.url);
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '5'), 20);

  try {
    const conference = await getConferenceById(env.DB, id);
    if (!conference) return Response.json({ ok: false, error: 'Conference not found' }, { status: 404 });

    const embedText = buildEmbedText(conference);
    const vector = await getEmbedding(embedText, env.OPENAI_API_KEY);

    const vecResults = await vectorSearch(env, vector, limit + 1);
    const similarIds = vecResults
      .map(r => r.id)
      .filter(rid => rid !== id)
      .slice(0, limit);

    const conferences = await getConferencesByIds(env.DB, similarIds);
    return Response.json({ ok: true, results: conferences });
  } catch (error) {
    console.error('Similar conferences error:', error);
    return Response.json({ ok: false, error: 'Failed to fetch similar conferences' }, { status: 500 });
  }
};

function buildEmbedText(conf: { title: string; acronym: string; topics?: string | null; paper_text?: string | null }): string {
  if (conf.paper_text?.trim()) return conf.paper_text.trim();
  if (conf.topics?.trim()) return conf.topics.trim();
  return `${conf.title} (${conf.acronym})`;
}
