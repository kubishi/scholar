// Search API endpoint - supports semantic, lexical, and hybrid search

import type { Env, AuthContext, Conference, SearchParams } from '../lib/types';
import { getEmbedding } from '../lib/openai';
import { vectorSearch } from '../lib/vectorize';
import { lexicalSearch, getConferencesByIds, parseRankings } from '../lib/db';

type PagesFunction<E = Env> = (
  context: EventContext<E, string, AuthContext>
) => Response | Promise<Response>;

/**
 * Reciprocal Rank Fusion algorithm
 * Combines multiple ranked lists into a single ranking
 */
function rrfFuse(
  rankings: Array<Array<{ id: string; score: number }>>,
  k: number = 50,
  c: number = 60.0,
  weights: number[] = [1.0, 1.0]
): string[] {
  const scores = new Map<string, number>();

  for (let listIdx = 0; listIdx < rankings.length; listIdx++) {
    const weight = weights[listIdx] ?? 1.0;
    for (let rank = 0; rank < rankings[listIdx].length; rank++) {
      const id = rankings[listIdx][rank].id;
      const current = scores.get(id) ?? 0;
      // RRF formula: weight / (c + rank + 1)
      scores.set(id, current + weight * (1.0 / (c + rank + 1)));
    }
  }

  // Sort by fused score descending and return top k
  return Array.from(scores.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, k)
    .map(([id]) => id);
}

/**
 * Apply client-side filters to results
 */
function applyFilters(results: Conference[], params: SearchParams): Conference[] {
  return results.filter((conf) => {
    // Location filter (fuzzy match on city or country)
    if (params.location) {
      const loc = params.location.toLowerCase();
      const city = (conf.city ?? '').toLowerCase();
      const country = (conf.country ?? '').toLowerCase();
      if (!city.includes(loc) && !country.includes(loc)) {
        return false;
      }
    }

    // Date range filter (conference start date)
    if (params.date_span_first || params.date_span_second) {
      if (!conf.start_date) return false;
      const start = new Date(conf.start_date);
      if (params.date_span_first) {
        const filterStart = new Date(params.date_span_first);
        if (start < filterStart) return false;
      }
      if (params.date_span_second) {
        const filterEnd = new Date(params.date_span_second);
        if (start > filterEnd) return false;
      }
    }

    // Deadline range filter
    if (params.deadline_first || params.deadline_second) {
      if (!conf.deadline) return false;
      const deadline = new Date(conf.deadline);
      if (params.deadline_first) {
        const filterStart = new Date(params.deadline_first);
        if (deadline < filterStart) return false;
      }
      if (params.deadline_second) {
        const filterEnd = new Date(params.deadline_second);
        if (deadline > filterEnd) return false;
      }
    }

    // Ranking filter
    if (params.ranking_source && params.ranking_score) {
      const core = conf.core ?? {};
      const rankOrder: Record<string, number> = { 'A*': 4, A: 3, B: 2, C: 1 };

      if (params.ranking_source === 'scholar') {
        // Google Scholar h5-index filter
        const h5 = conf.h5_index ?? 0;
        const threshold = parseInt(params.ranking_score) || 0;
        if (h5 < threshold) return false;
      } else {
        // CORE or ERA ranking filter
        const sourcePrefix = params.ranking_source.toUpperCase();
        const matchingKey = Object.keys(core).find((k) =>
          k.toUpperCase().startsWith(sourcePrefix)
        );
        if (!matchingKey) return false;
        const confRank = rankOrder[core[matchingKey]] ?? 0;
        const userRank = rankOrder[params.ranking_score] ?? 0;
        if (confRank < userRank) return false;
      }
    }

    return true;
  });
}

export const onRequestGet: PagesFunction = async (context) => {
  const { request, env } = context;
  const url = new URL(request.url);

  // Parse search parameters
  const params: SearchParams = {
    query: url.searchParams.get('query') ?? '',
    search_type: (url.searchParams.get('search_type') as SearchParams['search_type']) ?? 'semantic',
    num_results: Math.min(parseInt(url.searchParams.get('num_results') ?? '10'), 100),
    location: url.searchParams.get('location') ?? undefined,
    ranking_source: url.searchParams.get('ranking_source') ?? undefined,
    ranking_score: url.searchParams.get('ranking_score') ?? undefined,
    date_span_first: url.searchParams.get('date_span_first') ?? undefined,
    date_span_second: url.searchParams.get('date_span_second') ?? undefined,
    deadline_first: url.searchParams.get('deadline_first') ?? undefined,
    deadline_second: url.searchParams.get('deadline_second') ?? undefined,
  };

  // Return empty results if no query
  if (!params.query.trim()) {
    return Response.json({ results: [], count: 0 });
  }

  let resultIds: string[] = [];

  try {
    if (params.search_type === 'lexical') {
      // FTS5 lexical search only
      const lexResults = await lexicalSearch(env.DB, params.query, 50);
      resultIds = lexResults.map((r) => r.id);
    } else if (params.search_type === 'semantic') {
      // Vector search only
      const queryVector = await getEmbedding(params.query, env.OPENAI_API_KEY);
      const vecResults = await vectorSearch(env, queryVector, 50);
      resultIds = vecResults.map((r) => r.id);
    } else {
      // Hybrid search with RRF fusion
      const queryVector = await getEmbedding(params.query, env.OPENAI_API_KEY);

      // Run lexical and vector searches in parallel
      const [lexResults, vecResults] = await Promise.all([
        lexicalSearch(env.DB, params.query, 50),
        vectorSearch(env, queryVector, 50),
      ]);

      // Fuse results using RRF
      resultIds = rrfFuse(
        [lexResults, vecResults.map((r) => ({ id: r.id, score: r.score }))],
        50,
        60.0,
        [1.0, 1.0]
      );
    }

    // Return empty if no results
    if (resultIds.length === 0) {
      return Response.json({ results: [], count: 0 });
    }

    // Fetch full conference data
    let conferences = await getConferencesByIds(env.DB, resultIds);

    // Apply filters
    conferences = applyFilters(conferences, params);

    // Limit results
    conferences = conferences.slice(0, params.num_results);

    return Response.json({
      results: conferences,
      count: conferences.length,
    });
  } catch (error) {
    console.error('Search error:', error);
    return Response.json(
      { ok: false, error: 'Search failed' },
      { status: 500 }
    );
  }
};
