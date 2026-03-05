import type { Env, AuthContext } from '../../lib/types';
import { upsert_user_papers, get_user_papers } from '../../lib/db';
import { getEmbedding } from '../../lib/openai';
import { upsertUserPapersVector } from '../../lib/vectorize';



type PagesFunction<E = Env> = (
  context: EventContext<E, string, AuthContext>
) => Response | Promise<Response>;


export const onRequestPost: PagesFunction = async (context) => {
    const { env, data } = context;
    const user = data.user;
  
    if (!user) {
      return Response.json(
        { ok: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const paper_body = await context.request.json<{ body: string, title: string }>();
    console.log(context.request, "TESTING the request");
    const { body, title } = paper_body;

    const vector = await getEmbedding(body, env.OPENAI_API_KEY);

    await upsert_user_papers(env.DB, user.id, title, body);

    await upsertUserPapersVector(env, user.id, vector, title);

    return Response.json({ ok: true });

}

export const onRequestGet: PagesFunction = async (context) => {
    const { env, data } = context;
    const user = data.user;

    if (!user) {
        return Response.json(
            { ok: false, error: 'Unauthorized' },
            { status: 401 }
        );
    }

    const papers = await get_user_papers(env.DB, user.id);
    return Response.json({ ok: true, papers });
}