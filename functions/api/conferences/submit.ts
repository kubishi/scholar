// Conference submission API endpoint

import type { Env, AuthContext } from '../../lib/types';

type PagesFunction<E = Env> = (
  context: EventContext<E, string, AuthContext>
) => Response | Promise<Response>;

interface SubmitRequest {
  conference_id: string;
  conference_name: string;
  city?: string;
  country?: string;
  deadline?: string;
  start?: string;
  end?: string;
  topics?: string;
  url?: string;
  edit_type?: 'new' | 'edit';
}

export const onRequestPost: PagesFunction = async (context) => {
  const { request, env, data } = context;
  const user = data.user;

  if (!user) {
    return Response.json(
      { ok: false, error: 'Unauthorized' },
      { status: 401 }
    );
  }

  try {
    const body = await request.json<SubmitRequest>();

    const conferenceId = body.conference_id?.trim().toUpperCase();
    if (!conferenceId || !body.conference_name) {
      return Response.json(
        { ok: false, error: 'Missing required fields: conference_id and conference_name' },
        { status: 400 }
      );
    }

    // Insert or update submission
    await env.DB.prepare(`
      INSERT INTO submitted_conferences
      (id, conference_name, city, country, deadline, start_date, end_date, topics, url,
       submitter_id, submitter_name, submitter_email, edit_type, status, submitted_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'waiting', datetime('now'))
      ON CONFLICT(id) DO UPDATE SET
        conference_name = ?,
        city = ?,
        country = ?,
        deadline = ?,
        start_date = ?,
        end_date = ?,
        topics = ?,
        url = ?,
        submitter_id = ?,
        submitter_name = ?,
        submitter_email = ?,
        edit_type = ?,
        status = 'waiting',
        submitted_at = datetime('now')
    `).bind(
      conferenceId,
      body.conference_name,
      body.city ?? null,
      body.country ?? null,
      body.deadline ?? null,
      body.start ?? null,
      body.end ?? null,
      body.topics ?? null,
      body.url ?? null,
      user.id,
      user.name ?? null,
      user.email ?? null,
      body.edit_type ?? 'new',
      // For ON CONFLICT UPDATE
      body.conference_name,
      body.city ?? null,
      body.country ?? null,
      body.deadline ?? null,
      body.start ?? null,
      body.end ?? null,
      body.topics ?? null,
      body.url ?? null,
      user.id,
      user.name ?? null,
      user.email ?? null,
      body.edit_type ?? 'new'
    ).run();

    return Response.json({
      ok: true,
      message: 'Conference submission received. It will be reviewed by an admin.',
    });
  } catch (error) {
    console.error('Submit API error:', error);
    return Response.json(
      { ok: false, error: 'Failed to submit conference' },
      { status: 500 }
    );
  }
};
