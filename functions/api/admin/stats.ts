// Admin database coverage/stats API endpoint

import type { Env, AuthContext } from '../../lib/types';
import { getUserById } from '../../lib/db';
import { forbiddenResponse } from '../../lib/auth';

type PagesFunction<E = Env> = (
  context: EventContext<E, string, AuthContext>
) => Response | Promise<Response>;

export const onRequestGet: PagesFunction = async (context) => {
  const { env, data } = context;
  const user = data.user;

  if (!user) {
    return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const userRecord = await getUserById(env.DB, user.id);
    if (userRecord?.privilege !== 'admin') {
      return forbiddenResponse('Admin access required');
    }

    const coverage = await env.DB.prepare(
      `SELECT
        COUNT(*) as total,
        SUM(CASE WHEN paper_text IS NOT NULL AND paper_text != '' THEN 1 ELSE 0 END) as has_paper_text,
        SUM(CASE WHEN topics IS NOT NULL AND topics != '' THEN 1 ELSE 0 END) as has_topics,
        SUM(CASE WHEN h5_index IS NOT NULL THEN 1 ELSE 0 END) as has_h5_index,
        SUM(CASE WHEN url IS NOT NULL AND url != '' THEN 1 ELSE 0 END) as has_url,
        SUM(CASE WHEN deadline IS NOT NULL THEN 1 ELSE 0 END) as has_deadline,
        SUM(CASE WHEN start_date IS NOT NULL THEN 1 ELSE 0 END) as has_start_date
      FROM conferences`
    ).first<{
      total: number;
      has_paper_text: number;
      has_topics: number;
      has_h5_index: number;
      has_url: number;
      has_deadline: number;
      has_start_date: number;
    }>();

    const submissionRows = await env.DB.prepare(
      `SELECT status, COUNT(*) as cnt FROM submitted_conferences GROUP BY status`
    ).all<{ status: string; cnt: number }>();

    const submissions: Record<string, number> = {};
    for (const row of submissionRows.results) {
      submissions[row.status] = row.cnt;
    }

    // Vectorize index sizes — best-effort, don't fail the whole request if one is unavailable.
    let conferenceVectors: number | null = null;
    let paperVectors: number | null = null;
    try {
      const info = await env.VECTORIZE_INDEX.describe();
      conferenceVectors = info.vectorsCount;
    } catch (err) {
      console.error('VECTORIZE_INDEX.describe() failed:', err);
    }
    try {
      const info = await env.CONFERENCE_PAPERS_VECTORIZE_INDEX.describe();
      paperVectors = info.vectorsCount;
    } catch (err) {
      console.error('CONFERENCE_PAPERS_VECTORIZE_INDEX.describe() failed:', err);
    }

    return Response.json({
      ok: true,
      coverage,
      submissions,
      vectors: {
        conferences: conferenceVectors,
        papers: paperVectors,
      },
    });
  } catch (error) {
    console.error('Admin stats API error:', error);
    return Response.json(
      { ok: false, error: 'Failed to fetch stats' },
      { status: 500 }
    );
  }
};
