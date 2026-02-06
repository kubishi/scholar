import type { Env, AuthContext, UserRatingOptions } from '../lib/types';
import { upsert_user_conf_rating, get_user_conf_rating, get_avg_user_overall_rating } from '../lib/db';

type PagesFunction<E = Env> = (
  context: EventContext<E, string, AuthContext>
) => Response | Promise<Response>;

export const onRequestPost: PagesFunction = async (context) => {
    const { request, env,  data } = context;
    const user = data.user;

    if (!user) {
        return Response.json(
        { ok: false, error: 'Unauthorized' },
        { status: 401 }
        );
    }


    const body = (await request.json()) as { conference_id: string } & UserRatingOptions;
    const conferenceId = body.conference_id;

    // Remove conference_id from the body
    const { conference_id, ...bodyWithoutConferenceId } = body;


    upsert_user_conf_rating(env.DB, user.id, conferenceId, bodyWithoutConferenceId);

    console.log(typeof(body), body);
    return Response.json({ ok: true });

}

export const onRequestGet: PagesFunction = async (context) => {
  const {request, env, data} = context;
  const user = data.user;

  if (!user) {
    return Response.json(
      { ok: false, error: 'Unauthorized' },
      { status: 401 }
    );
  }

  const url = new URL(request.url);
  const conferenceIdsParam = url.searchParams.get('conference_ids');

  if (!conferenceIdsParam) {
    return Response.json(
      { ok: false, error: 'Missing conference ID' },
      { status: 400 }
    );
  }
  const conferenceIds = conferenceIdsParam.split(',').map(id => id.trim()).filter(Boolean);

  const ratings = await get_user_conf_rating(env.DB, user.id, conferenceIds);
  const avg_scores = await get_avg_user_overall_rating(env.DB, conferenceIds)

  return Response.json({ ok: true, ratings, avg_scores });
}
