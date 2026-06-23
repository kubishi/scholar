#!/usr/bin/env npx tsx
/**
 * Evaluates recommendation accuracy by checking whether a paper's known
 * conference appears in the top-K results from the live /api/search endpoint.
 *
 * Metric: Hit@K — did the correct conference appear in the top K results?
 *
 * Usage:
 *   npx tsx --env-file=.dev.vars scripts/eval-recommendations.ts
 *
 * Optional env vars:
 *   LIMIT        max conferences to sample (default: 50)
 *   TOP_K        how many results to check (default: 10)
 *   SEARCH_TYPE  semantic | lexical | hybrid (default: semantic)
 *   BASE_URL     API base URL (default: https://scholar.kubishi.com)
 *
 * Output: scripts/eval-results.csv — one row per paper tested, with hit@K
 * flags and the abstract text, so missed papers (hit_top_k=false) can be
 * inspected directly.
 */

import { execSync } from 'child_process';
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { resolve } from 'path';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const DB_NAME = 'kubishi-scholar-db';

const SEMANTIC_SCHOLAR_API_KEY = process.env.SEMANTIC_SCHOLAR_API_KEY;
const CONF_LIMIT = parseInt(process.env.LIMIT ?? '50');
const TOP_K = parseInt(process.env.TOP_K ?? '10');
const SEARCH_TYPE = process.env.SEARCH_TYPE ?? 'semantic';
const BASE_URL = (process.env.BASE_URL ?? 'https://scholar.kubishi.com').replace(/\/$/, '');
const MAX_PAPERS_PER_CONFERENCE = 30;
// Semantic Scholar's unauthenticated tier rate-limits aggressively (and can
// trigger a longer WAF block if hammered) — without an API key, stay well
// under 1 request/second between conference-level lookups.
const SEMANTIC_SCHOLAR_DELAY_MS = SEMANTIC_SCHOLAR_API_KEY ? 300 : 1500;

interface Conference { id: string; title: string; acronym: string; }
interface Paper { title?: string; abstract: string; }
interface ResultRow {
  conf_acronym: string;
  conf_title: string;
  paper_title: string;
  abstract: string;
  top_result_ids: string;
  hit_1: boolean;
  hit_5: boolean;
  hit_10: boolean;
  missed: boolean;
  error: string;
}

function escCsv(v: string): string {
  if (v.includes(',') || v.includes('"') || v.includes('\n')) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}

function writeResultsCsv(rows: ResultRow[], outPath: string): void {
  const headers: (keyof ResultRow)[] = [
    'conf_acronym', 'conf_title', 'paper_title', 'abstract',
    'hit_1', 'hit_5', 'hit_10', 'missed', 'top_result_ids', 'error',
  ];
  const lines = [
    headers.join(','),
    ...rows.map(r => headers.map(h => escCsv(String(r[h]))).join(',')),
  ];
  writeFileSync(outPath, lines.join('\n') + '\n', 'utf8');
}

// ── D1 ───────────────────────────────────────────────────────────────────────

function getConferences(): Conference[] {
  const out = execSync(
    `npx wrangler d1 execute ${DB_NAME} --remote --command ${JSON.stringify(`SELECT id, title, acronym FROM conferences WHERE url IS NOT NULL AND url != '' ORDER BY RANDOM() LIMIT ${CONF_LIMIT}`)} --json`,
    { cwd: resolve(__dirname, '..') }
  ).toString();
  return JSON.parse(out)[0]?.results ?? [];
}

// ── Semantic Scholar ─────────────────────────────────────────────────────────

function venueMatches(venue: string, acronym: string, title: string): boolean {
  const acronymRe = new RegExp(`\\b${acronym.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
  if (acronymRe.test(venue)) return true;
  if (venue.includes(title.toLowerCase())) return true;
  return false;
}

// Throws on persistent rate-limiting so the caller can surface it distinctly
// instead of silently treating a 429 as "no papers found".
async function fetchWithRetry(url: string, maxRetries = 5): Promise<Response> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const res = await fetch(url, {
      headers: SEMANTIC_SCHOLAR_API_KEY ? { 'x-api-key': SEMANTIC_SCHOLAR_API_KEY } : {},
    });
    if (res.status !== 429) return res;
    if (attempt === maxRetries) return res;
    const backoffMs = 2000 * 2 ** attempt; // 2s, 4s, 8s, 16s, 32s
    await new Promise(r => setTimeout(r, backoffMs));
  }
  throw new Error('unreachable');
}

async function fetchPapers(acronym: string, title: string): Promise<Paper[]> {
  const seen = new Set<string>();
  const papers: Paper[] = [];

  // Note: /paper/search/bulk ignores `limit` (it's a pagination endpoint that
  // returns up to 1000 results per page) — cap the matched papers ourselves.
  const url = `https://api.semanticscholar.org/graph/v1/paper/search/bulk?query=${encodeURIComponent(acronym)}&fields=title,abstract,venue`;
  const res = await fetchWithRetry(url);
  if (res.status === 429) throw new Error('rate-limited');
  if (!res.ok) return papers;

  const data = await res.json() as { data?: Array<{ paperId?: string; title?: string; abstract?: string; venue?: string }> };

  for (const p of data.data ?? []) {
    if (papers.length >= MAX_PAPERS_PER_CONFERENCE) break;
    if (!p.paperId || seen.has(p.paperId) || !p.abstract) continue;
    const venue = p.venue?.toLowerCase() ?? '';
    if (venueMatches(venue, acronym, title)) {
      seen.add(p.paperId);
      papers.push({ title: p.title, abstract: p.abstract });
    }
  }

  return papers;
}

// ── Live search API ───────────────────────────────────────────────────────────

async function searchConferences(query: string): Promise<string[]> {
  // Abstracts can be very long — truncate to avoid URL length limits
  const truncated = query.slice(0, 500);
  const params = new URLSearchParams({
    query: truncated,
    search_type: SEARCH_TYPE,
    num_results: String(TOP_K),
  });
  const res = await fetch(`${BASE_URL}/api/search?${params}`);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Search API ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = await res.json() as { results?: Array<{ id: string }> };
  return (data.results ?? []).map(r => r.id);
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`Config: TOP_K=${TOP_K}  SEARCH_TYPE=${SEARCH_TYPE}  BASE_URL=${BASE_URL}\n`);
  console.log(`Loading up to ${CONF_LIMIT} conferences from D1...`);

  const conferences = getConferences();
  console.log(`Loaded ${conferences.length} conferences.\n`);

  const hits: Record<number, number> = { 1: 0, 5: 0, 10: 0 };
  const ks = [1, 5, 10].filter(k => k <= TOP_K);
  const maxK = Math.max(...ks);
  let totalPapers = 0;
  let skippedConferences = 0;

  const worstConferences: Array<{ acronym: string; papers: number }> = [];
  const results: ResultRow[] = [];

  for (const conf of conferences) {
    process.stdout.write(`[${conf.acronym}] Fetching papers... `);

    let papers: Paper[];
    try {
      papers = await fetchPapers(conf.acronym, conf.title);
    } catch (err) {
      console.log(`rate-limited, pausing 30s...`);
      await new Promise(r => setTimeout(r, 30_000));
      skippedConferences++;
      continue;
    }

    if (papers.length === 0) {
      console.log('no papers found, skipping.');
      skippedConferences++;
      await new Promise(r => setTimeout(r, SEMANTIC_SCHOLAR_DELAY_MS));
      continue;
    }
    console.log(`${papers.length} papers.`);

    let confHit1 = 0;

    for (const paper of papers) {
      let resultIds: string[] = [];
      let error = '';
      try {
        resultIds = await searchConferences(paper.abstract);

        for (const k of ks) {
          if (resultIds.slice(0, k).includes(conf.id)) hits[k]++;
        }
        if (resultIds.slice(0, 1).includes(conf.id)) confHit1++;
        totalPapers++;
      } catch (err) {
        error = (err as Error).message;
        console.error(`  Error: ${error}`);
      }

      results.push({
        conf_acronym: conf.acronym,
        conf_title: conf.title,
        paper_title: paper.title ?? '',
        abstract: paper.abstract,
        top_result_ids: resultIds.join('; '),
        hit_1: resultIds.slice(0, 1).includes(conf.id),
        hit_5: resultIds.slice(0, 5).includes(conf.id),
        hit_10: resultIds.slice(0, 10).includes(conf.id),
        missed: !error && !resultIds.slice(0, maxK).includes(conf.id),
        error,
      });

      // Stay within rate limits
      await new Promise(r => setTimeout(r, 300));
    }

    console.log(`  Hit@1: ${confHit1}/${papers.length}  Hit@${Math.min(5, TOP_K)}: not yet shown`);
    if (confHit1 === 0) worstConferences.push({ acronym: conf.acronym, papers: papers.length });
  }

  const outPath = resolve(__dirname, 'eval-results.csv');
  writeResultsCsv(results, outPath);
  console.log(`\nWrote ${results.length} rows to ${outPath}`);

  const missed = results.filter(r => r.missed);
  if (missed.length > 0) {
    console.log(`\nMissed papers (not in top-${maxK} for their conference): ${missed.length}`);
    for (const m of missed.slice(0, 20)) {
      console.log(`  [${m.conf_acronym}] "${(m.paper_title || m.abstract).slice(0, 70)}"`);
    }
    if (missed.length > 20) console.log(`  ... and ${missed.length - 20} more (see CSV)`);
  }

  // ── Summary ──────────────────────────────────────────────────────────────────
  console.log('\n' + '─'.repeat(50));
  console.log('RESULTS');
  console.log('─'.repeat(50));
  console.log(`Conferences : ${conferences.length - skippedConferences} evaluated, ${skippedConferences} skipped`);
  console.log(`Papers      : ${totalPapers} tested`);
  console.log();

  for (const k of ks) {
    const pct = totalPapers > 0 ? ((hits[k] / totalPapers) * 100).toFixed(1) : '0.0';
    console.log(`  Hit@${String(k).padEnd(3)}: ${hits[k]}/${totalPapers}  (${pct}%)`);
  }

  if (worstConferences.length > 0) {
    console.log('\nConferences with Hit@1 = 0 (weakest embeddings):');
    worstConferences.forEach(c => console.log(`  ${c.acronym} (${c.papers} papers tested)`));
  }
}

main().catch(err => { console.error(err); process.exit(1); });