// Cloudflare Vectorize utilities

import type { Env, ConferenceVectorMetadata } from './types';

export interface VectorSearchResult {
  id: string;
  score: number;
  metadata?: ConferenceVectorMetadata;
}

/**
 * Search for similar conferences using vector similarity
 */
export async function vectorSearch(
  env: Env,
  queryVector: number[],
  topK: number = 50
): Promise<VectorSearchResult[]> {
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
 * Upsert a single vector with metadata
 */
export async function upsertVector(
  env: Env,
  id: string,
  vector: number[],
  metadata: ConferenceVectorMetadata
): Promise<void> {
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
  await env.VECTORIZE_INDEX.deleteByIds(ids);
}
