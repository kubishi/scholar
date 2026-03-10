// D1 Database utilities

import type { Env, Conference, User, SubmittedConference, UserRatingOptions, UserProfile, UserPaper} from './types';

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
  console.log(id, "FAAR OUT")
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
/** Return looks like this: [
  {
    id: '123',
    title: 'Conference 1',
    acronym: 'C1',
    city: 'New York',
    country: 'USA'
    deadline: '2026-01-01',
    notification: '2026-01-01T00:00:00Z',
    start_date: '2026-01-01',
    end_date: '2026-01-01',
    topics: 'Topic 1, Topic 2',
    url: 'https://example.com',
    h5_index: 1,
    h5_median: 1,
    updated_at: '2026-01-01',
  }
] */

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

// Use COALESCE because name and email are optionals
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

//User rating Functions------------------------------------------------------
export async function upsert_user_conf_rating(
  db: D1Database,
  user_id: string, 
  conference_id: string,
  ratings: UserRatingOptions,
): Promise<void> {

  const ratingJson = JSON.stringify(ratings);

  await db.prepare(`
      INSERT INTO user_conf_rating (user_id, conference_id, ratings, updated_at)
      VALUES(?, ?, ?, datetime('now'))
      ON CONFLICT(user_id, conference_id) DO UPDATE SET
        ratings = excluded.ratings,
        updated_at = datetime('now')
    `).bind(user_id, conference_id, ratingJson).run()
}

export async function get_user_conf_rating(
  db: D1Database,
  user_id: string,
  conference_ids: string[]
): Promise<UserRatingOptions | Record<string, UserRatingOptions>> {

  const ratingsByConfrence: Record<string, UserRatingOptions> = {};
  
  for (const conference_id of conference_ids) {
    const result = await db.prepare(`
      SELECT ratings FROM user_conf_rating WHERE user_id = ? AND conference_id = ?
    `).bind(user_id, conference_id).first<{ ratings: string }>();
    if (result?.ratings) {
      ratingsByConfrence[conference_id] = JSON.parse(result.ratings);
    }
  }
  return ratingsByConfrence;
}

//User profile Functions------------------------------------------------------
function slugify(name: string): string {
  if (!name || typeof name !== 'string') return '';
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || '';
}

export async function ensureUniqueSlug(
  db: D1Database,
  baseSlug: string,
  excludeUserId: string
): Promise<string> {
  if (!baseSlug) return '';
  let slug = baseSlug;
  let n = 1;
  while (true) {
    const row = await db.prepare(
      'SELECT user_id FROM user_profile WHERE slug = ? AND user_id != ?'
    ).bind(slug, excludeUserId).first<{ user_id: string }>();
    if (!row) return slug;
    slug = `${baseSlug}-${++n}`;
  }
}

export async function upsert_user_profile(
  db: D1Database,
  user_id: string,
  user_info: UserProfile
): Promise<{ slug: string }> {
  const name = user_info.name ?? user_info.given_name ?? '';
  const baseSlug = slugify(name) || `user-${user_id.slice(-8)}`;
  const slug = await ensureUniqueSlug(db, baseSlug, user_id);
  const profileJson = JSON.stringify({ ...user_info, slug });

  await db.prepare(`
    INSERT INTO user_profile (user_id, user_profile, slug, updated_at)
    VALUES(?, ?, ?, datetime('now'))
    ON CONFLICT(user_id) DO UPDATE SET
      user_profile = excluded.user_profile,
      slug = excluded.slug,
      updated_at = datetime('now')
  `).bind(user_id, profileJson, slug || null).run();

  return { slug };
}

export async function get_user_profile(
  db: D1Database,
  user_id: string
): Promise<UserProfile | null> {
  const result = await db.prepare(`
    SELECT user_profile, slug FROM user_profile WHERE user_id = ?
  `).bind(user_id).first<{ user_profile: string; slug: string | null }>();
  if (result?.user_profile) {
    const profile = JSON.parse(result.user_profile) as UserProfile;
    if (result.slug) profile.slug = result.slug;
    return profile;
  }
  return null;
}

export async function get_public_profile_by_slug(
  db: D1Database,
  slug: string
): Promise<{ profile: UserProfile; slug: string } | null> {
  const row = await db.prepare(`
    SELECT user_profile, slug FROM user_profile WHERE slug = ?
  `).bind(slug).first<{ user_profile: string; slug: string }>();
  if (!row?.user_profile) return null;
  const profile = JSON.parse(row.user_profile) as UserProfile;
  profile.slug = row.slug;
  return { profile, slug: row.slug };
}

/** Search users with a public profile (slug) by name, email, or slug. Uses profile JSON when available. Excludes current user. */
export async function search_user_profiles(
  db: D1Database,
  query: string,
  excludeUserId: string,
  limit: number = 20
): Promise<Array<{ name: string; email: string; slug: string }>> {
  if (!query || query.trim().length < 2) return [];
  const q = `%${query.trim()}%`;
  const rows = await db.prepare(`
    SELECT
      COALESCE(NULLIF(trim(json_extract(p.user_profile, '$.name')), ''), u.name) AS name,
      COALESCE(NULLIF(trim(json_extract(p.user_profile, '$.email')), ''), u.email) AS email,
      p.slug
    FROM users u
    INNER JOIN user_profile p ON u.id = p.user_id
    WHERE p.slug IS NOT NULL AND p.user_id != ?
      AND (
        u.name LIKE ? OR u.email LIKE ? OR p.slug LIKE ?
        OR json_extract(p.user_profile, '$.name') LIKE ?
        OR json_extract(p.user_profile, '$.email') LIKE ?
        OR json_extract(p.user_profile, '$.given_name') LIKE ?
      )
    LIMIT ?
  `).bind(excludeUserId, q, q, q, q, q, q, limit).all<{ name: string | null; email: string | null; slug: string }>();
  return (rows.results || []).map((r) => ({
    name: r.name || 'Unknown',
    email: r.email || '',
    slug: r.slug,
  }));
}

//Average user rating Functions------------------------------------------------------
export async function get_avg_user_overall_rating(
  db: D1Database,
  conference_ids: string[]
): Promise<Record<string, number>> {
  const avg_per_conf: Record<string, number> = {};
  for (const conference_id of conference_ids) {
    const row = await db.prepare(`
      SELECT AVG(json_extract(ratings, '$.overall')) AS average_overall
      FROM user_conf_rating
      WHERE conference_id = ?
    `).bind(conference_id).first<{ average_overall: number | null }>();
    avg_per_conf[conference_id] = row?.average_overall ?? 0;
  }
  return avg_per_conf;
}

export async function upsert_user_papers(
  db: D1Database,
  user_id: string,
  paper_id: string,
  paper_summary: string
): Promise<void> {
  await db.prepare(`
    INSERT INTO user_papers (user_id, paper_id, paper_summary, created_at)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(user_id, paper_id) DO UPDATE SET
      paper_summary = excluded.paper_summary,
      created_at = datetime('now')
  `).bind(user_id, paper_id, paper_summary).run()
}

export async function get_user_papers(
  db: D1Database,
  user_id: string
): Promise<UserPaper[]> {
  const result = await db.prepare(`
    SELECT * FROM user_papers WHERE user_id = ?
  `).bind(user_id).all<UserPaper>();
  return result.results;
}