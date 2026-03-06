import type { Env, AuthContext } from '../../../lib/types';
import { get_public_profile_by_slug } from '../../../lib/db';

type PagesFunction<E = Env> = (
  context: EventContext<E, string, AuthContext>
) => Response | Promise<Response>;

export const onRequestGet: PagesFunction = async (context) => {
  const { env, params } = context;
  const slug = params.slug as string;
  if (!slug) {
    return Response.json({ ok: false, error: 'Slug required' }, { status: 400 });
  }
  const result = await get_public_profile_by_slug(env.DB, slug);
  if (!result) {
    return Response.json({ ok: false, error: 'Profile not found' }, { status: 404 });
  }
  return Response.json({ ok: true, profile: result.profile, slug: result.slug });
};
