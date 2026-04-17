import type { Env, AuthContext, UserProfile } from '../lib/types';
import { upsert_user_profile, get_user_profile } from '../lib/db';
import { rebuildUserVector } from '../lib/buildUserVector';

type PagesFunction<E = Env> = (
    context: EventContext<E, string, AuthContext>
) => Response | Promise<Response>;

export const onRequestPost: PagesFunction = async (context) => {
    const { request, env, data } = context;
    const user = data.user;

    if (!user) {
        return Response.json(
            { ok: false, error: 'Unauthorized' },
            { status: 401 }
        );
    }

    const body = await request.json() as UserProfile;
    const { slug } = await upsert_user_profile(env.DB, user.id, body);
    await rebuildUserVector(user.id, env);
    return Response.json({ ok: true, slug });
}

export const onRequestGet: PagesFunction = async (context) => {
    const { env, data, request } = context;
    const user = data.user;

    if (!user) {
        return Response.json(
            { ok: false, error: 'Unauthorized' },
            { status: 401 }
        );
    }

    const profile = await get_user_profile(env.DB, user.id);
    return Response.json({ ok: true, profile });
}