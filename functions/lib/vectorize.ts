// Cloudflare Vectorize utilities

import type { Env, ConferenceVectorMetadata } from './types';

export interface VectorSearchResult {
  id: string;
  score: number;
  metadata?: ConferenceVectorMetadata;
}

export interface PeopleSearchResult {
  id: string;
  score: number;
  metadata?: { name?: string; email?: string; slug?: string };
}

// Vectorize has no local emulator and the binding errors outside of
// `--remote` mode, so all Vectorize calls are skipped in local dev.
function isVectorizeAvailable(env: Env): boolean {
  return env.ENVIRONMENT === 'production';
}

/**
 * Search for similar conferences using vector similarity
 */
export async function vectorSearch(
  env: Env,
  queryVector: number[],
  topK: number = 50
): Promise<VectorSearchResult[]> {
  if (!isVectorizeAvailable(env)) return [];

  const results = await env.VECTORIZE_INDEX.query(queryVector, {
    topK,
    returnMetadata: 'all',
  });

  return results.matches.map(match => ({
    id: match.id,
    score: match.score,
    metadata: match.metadata as ConferenceVectorMetadata | undefined,
  }));
}

/**
 * Search individual conference-accepted papers (kubishi-conference-papers)
 * and roll the matches up to conference-level results.
 *
 * Querying one averaged vector per conference dilutes broad, multi-track
 * conferences (a single vector blending many unrelated subtopics scores
 * worse against any specific query than a narrow sibling conference would).
 * Querying individual papers and rolling up to their conference avoids that
 * averaging step entirely. Measured ~1.6-2.5x Hit@1/5/10 improvement over
 * the conference-centroid approach on a held-out, leakage-free eval
 * (see scripts/compare-search-approaches.ts). Only covers conferences that
 * have at least one paper in the index — callers should fall back to
 * vectorSearch() for conferences this returns nothing for.
 */
export async function vectorSearchConferencesByPapers(
  env: Env,
  queryVector: number[],
  topK: number = 50
): Promise<VectorSearchResult[]> {
  const results = await env.CONFERENCE_PAPERS_VECTORIZE_INDEX.query(queryVector, {
    topK,
    returnMetadata: 'all',
  });

  const byConference = new Map<string, { maxScore: number; count: number }>();
  for (const match of results.matches) {
    const metadata = match.metadata as { conference_id?: string } | undefined;
    const conferenceId = metadata?.conference_id;
    if (!conferenceId) continue;

    const cur = byConference.get(conferenceId) ?? { maxScore: 0, count: 0 };
    cur.maxScore = Math.max(cur.maxScore, match.score);
    cur.count += 1;
    byConference.set(conferenceId, cur);
  }

  return [...byConference.entries()]
    .map(([id, { maxScore, count }]) => ({ id, score: maxScore + 0.1 * count }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

export async function vectorSearchPeople(
  env: Env,
  queryVector: number[],
  topK: number = 10
): Promise<PeopleSearchResult[]> {
  if (!isVectorizeAvailable(env)) return [];

  const results = await env.FULL_PROFILE_VECTORIZE_INDEX.query(queryVector, {
    topK,
    returnMetadata: 'all',
  });
  return results.matches.map(match => ({
    id: match.id,
    score: match.score,
    metadata: match.metadata as { name?: string; email?: string } | undefined,
  }));
}
/**
 * Upsert a single vector with metadata
 */
export async function upsertVector(
  env: Env,
  id: string,
  vector: number[],
  metadata: ConferenceVectorMetadata
): Promise<void> {
  if (!isVectorizeAvailable(env)) return;

  await env.VECTORIZE_INDEX.upsert([
    {
      id,
      values: vector,
      metadata,
    },
  ]);
}

/**
 * Upsert multiple vectors in batch
 */
export async function upsertVectors(
  env: Env,
  vectors: Array<{
    id: string;
    values: number[];
    metadata: ConferenceVectorMetadata;
  }>
): Promise<void> {
  if (!isVectorizeAvailable(env)) return;

  // Vectorize supports up to 1000 vectors per batch
  const batchSize = 1000;
  for (let i = 0; i < vectors.length; i += batchSize) {
    const batch = vectors.slice(i, i + batchSize);
    await env.VECTORIZE_INDEX.upsert(batch);
  }
}

/**
 * Delete vectors by IDs
 */
export async function deleteVectors(env: Env, ids: string[]): Promise<void> {
  if (!isVectorizeAvailable(env)) return;
  await env.VECTORIZE_INDEX.deleteByIds(ids);
}

export async function deletePaperVectors(env: Env, ids: string[]): Promise<void> {
  if (!isVectorizeAvailable(env)) return;
  await env.PAPERS_VECTORIZE_INDEX.deleteByIds(ids);
}

/**
 * Upsert a user's papers vector
 */
export async function upsertUserPapersVector(
  env: Env,
  userId: string,
  vector: number[],
  paper_title: string
): Promise<void> {
  if (!isVectorizeAvailable(env)) return;

  const paperId = `${userId}-${paper_title}`;

  await env.PAPERS_VECTORIZE_INDEX.upsert([{
    id: paperId,
    values: vector,
    metadata: {
      user_id: userId,
      title: paper_title,
    },
  }]);

}

export async function upsertFullUserProfile(
  env: Env,
  userId: string,
  vector: number[],
  name: string,
  email: string,
  slug: string
): Promise<void> {
  if (!isVectorizeAvailable(env)) return;

  await env.FULL_PROFILE_VECTORIZE_INDEX.upsert([{
    id: userId,
    values: vector,
    metadata: { name, email, slug },
  }]);
}


