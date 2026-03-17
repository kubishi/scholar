import type { Env, AuthContext, Conference, SearchParams } from '../lib/types';
import { getEmbedding, getRecomendation } from '../lib/openai';
import { get_user_papers, getConferencesByIds } from '../lib/db';
import { vectorSearch } from '../lib/vectorize';

type PagesFunction<E = Env> = (
  context: EventContext<E, string, AuthContext>
) => Response | Promise<Response>;

const MAX_CONTEXT_CHARS = 20000;

export const onRequestGet: PagesFunction = async (context) => {
    const { env, data } = context;
    const user = data.user;

    if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const user_papers = await get_user_papers(env.DB, user.id);

        console.log(user_papers, "<- user papers");
        const combinedText = user_papers
        .map((p) => p.paper_summary)
        .filter(Boolean)
        .join(' ')
        .slice(0, MAX_CONTEXT_CHARS);

        const queryVector = await getEmbedding(combinedText, env.OPENAI_API_KEY);

        const vecResults = await vectorSearch(env, queryVector, 5);

        const conferences = await getConferencesByIds(env.DB, vecResults.map((r) => r.id));

        const recomendation = await getRecomendation(combinedText, JSON.stringify(conferences), env.OPENAI_API_KEY);

        return Response.json({
            ok: true,
            results: conferences,
            recomendation,
            count: conferences.length,
          });
    } catch (error) {
        console.error('Recommendation error:', error);
        return Response.json(
            { ok: false, error: error instanceof Error ? error.message : 'Recommendation failed' },
            { status: 500 }
        );
    }
}








