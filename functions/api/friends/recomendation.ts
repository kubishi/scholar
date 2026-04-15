import type { Env, AuthContext } from '../../lib/types';
import { vectorSearchPeople } from '../../lib/vectorize';

type PagesFunction<E = Env> = (
  context: EventContext<E, string, AuthContext>
) => Response | Promise<Response>;

export const onRequestGet: PagesFunction = async (context) => {
    const { env, data } = context;
    const user = data.user;

    if (!user) {
        return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const profileVectors = await env.FULL_PROFILE_VECTORIZE_INDEX.getByIds([user.id]);
    const queryVector = Array.from(profileVectors[0]?.values ?? []);
    if (queryVector.length === 0) {
        return Response.json({ ok: false, error: 'No profile vector found. Please complete your profile first.' }, { status: 404 });
    }

    const vecResults = await vectorSearchPeople(env, queryVector, 5);
    const similarUsers = vecResults
        .filter(r => r.id !== user.id)
        .map(r => ({
            id: r.id,
            name: r.metadata?.name,
            email: r.metadata?.email,
            slug: r.metadata?.slug,
            score: r.score,
        }));

    return Response.json({ ok: true, users: similarUsers });
}




