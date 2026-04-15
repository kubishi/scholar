import type { Env, AuthContext } from '../lib/types';
import { getRecomendation } from '../lib/openai';
import { get_user_papers, get_user_profile, getConferencesByIds } from '../lib/db';
import { vectorSearch } from '../lib/vectorize';
import { buildUserBlob } from '../lib/buildUserVector';

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
        // const user_papers = await get_user_papers(env.DB, user.id);

        // const combinedText = user_papers
        // .map((p) => p.paper_summary)
        // .filter(Boolean)
        // .join(' ')
        // .slice(0, MAX_CONTEXT_CHARS);

        const profile = await get_user_profile(env.DB, user.id);
        const papers = await get_user_papers(env.DB, user.id);

        const profileVectors = await env.FULL_PROFILE_VECTORIZE_INDEX.getByIds([user.id]);
        const queryVector = Array.from(profileVectors[0]?.values ?? []);
        if (!queryVector) {
            return Response.json({ ok: false, error: 'No profile vector found. Please complete your profile first.' }, { status: 404 });
        }

        const vecResults = await vectorSearch(env, queryVector, 5);

        const conferences = await getConferencesByIds(env.DB, vecResults.map((r) => r.id));

        const userBlob = buildUserBlob(profile, papers, [], []);
        const recomendation = await getRecomendation(userBlob, JSON.stringify(conferences), env.OPENAI_API_KEY);

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








