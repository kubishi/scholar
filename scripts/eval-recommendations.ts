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
 *   TOP_K        how many results to check (default: 5)
 *   SEARCH_TYPE  semantic | lexical | hybrid (default: semantic)
 *   BASE_URL     API base URL (default: https://scholar.kubishi.com)
 */

import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { resolve } from 'path';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const DB_NAME = 'kubishi-scholar-db';

const SEMANTIC_SCHOLAR_API_KEY = process.env.SEMANTIC_SCHOLAR_API_KEY;
const CONF_LIMIT = parseInt(process.env.LIMIT ?? '50');
const TOP_K = parseInt(process.env.TOP_K ?? '5');
const SEARCH_TYPE = process.env.SEARCH_TYPE ?? 'semantic';
const BASE_URL = (process.env.BASE_URL ?? 'https://scholar.kubishi.com').replace(/\/$/, '');

interface Conference { id: string; title: string; acronym: string; }
interface Paper { title?: string; abstract: string; }

// ── D1 ───────────────────────────────────────────────────────────────────────

function getConferences(): Conference[] {
  const out = execSync(
    `npx wrangler d1 execute ${DB_NAME} --remote --command ${JSON.stringify(`SELECT id, title, acronym FROM conferences WHERE url IS NOT NULL AND url != '' ORDER BY RANDOM() LIMIT ${CONF_LIMIT}`)} --json`,
    { cwd: resolve(__dirname, '..') }
  ).toString();
  return JSON.parse(out)[0]?.results ?? [];
}

// ── Semantic Scholar ─────────────────────────────────────────────────────────

async function fetchPapers(acronym: string, title: string): Promise<Paper[]> {
  const queries = [acronym, title];
  const seen = new Set<string>();
  const papers: Paper[] = [];

  for (const query of queries) {
    const url = `https://api.semanticscholar.org/graph/v1/paper/search/bulk?query=${encodeURIComponent(query)}&fields=title,abstract,venue&limit=30`;
    const res = await fetch(url, {
      headers: SEMANTIC_SCHOLAR_API_KEY ? { 'x-api-key': SEMANTIC_SCHOLAR_API_KEY } : {},
    });
    if (!res.ok) continue;

    const data = await res.json() as { data?: Array<{ paperId?: string; title?: string; abstract?: string; venue?: string }> };
    const lower = [acronym.toLowerCase(), title.toLowerCase()];

    for (const p of data.data ?? []) {
      if (!p.paperId || seen.has(p.paperId) || !p.abstract) continue;
      const venue = p.venue?.toLowerCase() ?? '';
      if (lower.some(l => venue.includes(l))) {
        seen.add(p.paperId);
        papers.push({ title: p.title, abstract: p.abstract });
      }
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

  const hits: Record<number, number> = { 1: 0, 3: 0, 5: 0, 10: 0 };
  const ks = [1, 3, 5, 10].filter(k => k <= TOP_K);
  let totalPapers = 0;
  let skippedConferences = 0;

  const worstConferences: Array<{ acronym: string; papers: number }> = [];

  for (const conf of conferences) {
    process.stdout.write(`[${conf.acronym}] Fetching papers... `);
    const papers = await fetchPapers(conf.acronym, conf.title);

    if (papers.length === 0) {
      console.log('no papers found, skipping.');
      skippedConferences++;
      continue;
    }
    console.log(`${papers.length} papers.`);

    let confHit1 = 0;

    for (const paper of papers) {
      try {
        const resultIds = await searchConferences(paper.abstract);

        for (const k of ks) {
          if (resultIds.slice(0, k).includes(conf.id)) hits[k]++;
        }
        if (resultIds.slice(0, 1).includes(conf.id)) confHit1++;
        totalPapers++;
      } catch (err) {
        console.error(`  Error: ${(err as Error).message}`);
      }

      // Stay within rate limits
      await new Promise(r => setTimeout(r, 300));
    }

    console.log(`  Hit@1: ${confHit1}/${papers.length}  Hit@${Math.min(5, TOP_K)}: not yet shown`);
    if (confHit1 === 0) worstConferences.push({ acronym: conf.acronym, papers: papers.length });
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