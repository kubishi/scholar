// D1 Database utilities

import type { Env, Conference, User, SubmittedConference } from './types';

/**
 * Parse rankings string from GROUP_CONCAT into an object
 */
export function parseRankings(rankingsStr: string | null): Record<string, string> {
  if (!rankingsStr) return {};
  const core: Record<string, string> = {};
  for (const pair of rankingsStr.split(',')) {
    const [source, value] = pair.split(':');
    if (source && value) {
      core[source.trim()] = value.trim();
    }
  }
  return core;
}

/**
 * Get conference count
 */
export async function getConferenceCount(db: D1Database): Promise<number> {
  const result = await db.prepare('SELECT COUNT(*) as count FROM conferences').first<{ count: number }>();
  return result?.count ?? 0;
}

/**
 * Get conference by ID with rankings
 */
export async function getConferenceById(db: D1Database, id: string): Promise<Conference | null> {
  const result = await db.prepare(`
    SELECT c.*, GROUP_CONCAT(cr.ranking_source || ':' || cr.ranking_value) as rankings
    FROM conferences c
    LEFT JOIN conference_rankings cr ON c.id = cr.conference_id
    WHERE c.id = ?
    GROUP BY c.id
  `).bind(id).first<Conference & { rankings: string }>();

  if (!result) return null;

  return {
    ...result,
    core: parseRankings(result.rankings),
  };
}

/**
 * Get multiple conferences by IDs (preserves order)
 */
export async function getConferencesByIds(
  db: D1Database,
  ids: string[]
): Promise<Conference[]> {
  if (ids.length === 0) return [];

  const placeholders = ids.map(() => '?').join(',');
  const results = await db.prepare(`
    SELECT c.*, GROUP_CONCAT(cr.ranking_source || ':' || cr.ranking_value) as rankings
    FROM conferences c
    LEFT JOIN conference_rankings cr ON c.id = cr.conference_id
    WHERE c.id IN (${placeholders})
    GROUP BY c.id
  `).bind(...ids).all<Conference & { rankings: string }>();

  // Create map and preserve original order
  const confMap = new Map(
    results.results.map(c => [c.id, { ...c, core: parseRankings(c.rankings) }])
  );
  return ids.map(id => confMap.get(id)).filter((c): c is Conference => c !== undefined);
}

/**
 * Lexical search using FTS5
 */
export async function lexicalSearch(
  db: D1Database,
  query: string,
  topK: number = 50
): Promise<Array<{ id: string; score: number }>> {
  // Escape special FTS5 characters and create query
  const escapedQuery = query.replace(/['"]/g, '').trim();
  if (!escapedQuery) return [];

  // FTS5 MATCH with BM25 scoring (lower is better, negate for descending)
  const results = await db.prepare(`
    SELECT id, bm25(conferences_fts) as score
    FROM conferences_fts
    WHERE conferences_fts MATCH ?
    ORDER BY score
    LIMIT ?
  `).bind(escapedQuery, topK).all<{ id: string; score: number }>();

  // Convert BM25 scores (negative, lower is better) to positive scores for RRF
  return results.results.map(r => ({
    id: r.id,
    score: -r.score, // Negate so higher is better
  }));
}

/**
 * Upsert user record
 */
export async function upsertUser(
  db: D1Database,
  id: string,
  name?: string,
  email?: string
): Promise<void> {
  await db.prepare(`
    INSERT INTO users (id, name, email)
    VALUES (?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = COALESCE(?, name),
      email = COALESCE(?, email),
      updated_at = datetime('now')
  `).bind(id, name, email, name, email).run();
}

/**
 * Get user by ID
 */
export async function getUserById(db: D1Database, id: string): Promise<User | null> {
  return db.prepare('SELECT * FROM users WHERE id = ?').bind(id).first<User>();
}

/**
 * Get user's favorite conference IDs
 */
export async function getUserFavorites(db: D1Database, userId: string): Promise<string[]> {
  const results = await db.prepare(
    'SELECT conference_id FROM user_favorites WHERE user_id = ?'
  ).bind(userId).all<{ conference_id: string }>();
  return results.results.map(r => r.conference_id);
}

/**
 * Check if conference is favorited
 */
export async function isFavorited(
  db: D1Database,
  userId: string,
  conferenceId: string
): Promise<boolean> {
  const result = await db.prepare(
    'SELECT 1 FROM user_favorites WHERE user_id = ? AND conference_id = ?'
  ).bind(userId, conferenceId).first();
  return result !== null;
}

/**
 * Add favorite
 */
export async function addFavorite(
  db: D1Database,
  userId: string,
  conferenceId: string
): Promise<void> {
  await db.prepare(
    'INSERT OR IGNORE INTO user_favorites (user_id, conference_id) VALUES (?, ?)'
  ).bind(userId, conferenceId).run();
}

/**
 * Remove favorite
 */
export async function removeFavorite(
  db: D1Database,
  userId: string,
  conferenceId: string
): Promise<void> {
  await db.prepare(
    'DELETE FROM user_favorites WHERE user_id = ? AND conference_id = ?'
  ).bind(userId, conferenceId).run();
}

/**
 * Get all pending submissions
 */
export async function getPendingSubmissions(db: D1Database): Promise<SubmittedConference[]> {
  const results = await db.prepare(
    'SELECT * FROM submitted_conferences WHERE status IN (?, ?) ORDER BY submitted_at DESC'
  ).bind('waiting', 'approved').all<SubmittedConference>();
  return results.results;
}

/**
 * Get submission by ID
 */
export async function getSubmissionById(
  db: D1Database,
  id: string
): Promise<SubmittedConference | null> {
  return db.prepare(
    'SELECT * FROM submitted_conferences WHERE id = ?'
  ).bind(id).first<SubmittedConference>();
}

/**
 * Update submission status
 */
export async function updateSubmissionStatus(
  db: D1Database,
  id: string,
  status: string,
  approvedAt?: string
): Promise<void> {
  if (approvedAt) {
    await db.prepare(
      'UPDATE submitted_conferences SET status = ?, approved_at = ? WHERE id = ?'
    ).bind(status, approvedAt, id).run();
  } else {
    await db.prepare(
      'UPDATE submitted_conferences SET status = ? WHERE id = ?'
    ).bind(status, id).run();
  }
}

/**
 * Delete submission
 */
export async function deleteSubmission(db: D1Database, id: string): Promise<void> {
  await db.prepare('DELETE FROM submitted_conferences WHERE id = ?').bind(id).run();
}

/**
 * Insert or update conference
 */
export async function upsertConference(
  db: D1Database,
  conference: Partial<Conference> & { id: string }
): Promise<void> {
  await db.prepare(`
    INSERT INTO conferences (id, title, acronym, city, country, deadline, notification, start_date, end_date, topics, url, h5_index, h5_median)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      title = ?,
      acronym = ?,
      city = ?,
      country = ?,
      deadline = ?,
      notification = ?,
      start_date = ?,
      end_date = ?,
      topics = ?,
      url = ?,
      h5_index = ?,
      h5_median = ?,
      updated_at = datetime('now')
  `).bind(
    conference.id,
    conference.title ?? conference.id,
    conference.acronym ?? conference.id,
    conference.city ?? null,
    conference.country ?? null,
    conference.deadline ?? null,
    conference.notification ?? null,
    conference.start_date ?? null,
    conference.end_date ?? null,
    conference.topics ?? null,
    conference.url ?? null,
    conference.h5_index ?? null,
    conference.h5_median ?? null,
    // For update
    conference.title ?? conference.id,
    conference.acronym ?? conference.id,
    conference.city ?? null,
    conference.country ?? null,
    conference.deadline ?? null,
    conference.notification ?? null,
    conference.start_date ?? null,
    conference.end_date ?? null,
    conference.topics ?? null,
    conference.url ?? null,
    conference.h5_index ?? null,
    conference.h5_median ?? null
  ).run();
}

/**
 * Upsert conference ranking
 */
export async function upsertRanking(
  db: D1Database,
  conferenceId: string,
  source: string,
  value: string
): Promise<void> {
  await db.prepare(`
    INSERT INTO conference_rankings (conference_id, ranking_source, ranking_value)
    VALUES (?, ?, ?)
    ON CONFLICT(conference_id, ranking_source) DO UPDATE SET ranking_value = ?
  `).bind(conferenceId, source, value, value).run();
}
