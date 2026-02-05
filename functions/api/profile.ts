import type { Env, AuthContext, UserProfile } from '../lib/types';
import { upsert_user_profile, get_user_profile } from '../lib/db';

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


    upsert_user_profile(env.DB, user.id, body);
    console.log("upserted user page to db")
    return Response.json({ ok: true });
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