#!/usr/bin/env npx tsx
/**
 * Fetches past accepted paper titles and abstracts from Semantic Scholar
 * for each conference and outputs them to a CSV for review.
 *
 * The paper text (titles + abstracts) can later be used as a richer
 * conference embedding instead of topic lists or scraped CFP text.
 *
 * Usage:
 *   npx tsx --env-file=.dev.vars scripts/backfill-paper-text.ts
 *   npx tsx --env-file=.dev.vars scripts/backfill-paper-text.ts --dry-run
 *
 * Optional env vars:
 *   SEMANTIC_SCHOLAR_API_KEY
 *   LIMIT            max conferences to process (default: all)
 *   PAPERS_PER_CONF  max papers to fetch per conference (default: 30)
 */

import { execSync } from 'child_process';
import { writeFileSync, appendFileSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url).toString());
const DB_NAME = 'kubishi-scholar-db';
const CSV_PATH = resolve(__dirname, 'paper-text-output.csv');

const SEMANTIC_SCHOLAR_API_KEY = process.env.SEMANTIC_SCHOLAR_API_KEY;
const LIMIT = process.env.LIMIT ? parseInt(process.env.LIMIT) : Infinity;
const PAPERS_PER_CONF = parseInt(process.env.PAPERS_PER_CONF ?? '30');
const DRY_RUN = process.argv.includes('--dry-run');
// Semantic Scholar's unauthenticated tier rate-limits aggressively (and can
// trigger a longer WAF block if hammered) — without an API key, stay well
// under 1 request/second.
const REQUEST_DELAY_MS = SEMANTIC_SCHOLAR_API_KEY ? 300 : 1500;

interface Conference {
  id: string;
  title: string;
  acronym: string;
}

interface Paper {
  title?: string;
  abstract: string;
}

// ── CSV ───────────────────────────────────────────────────────────────────────

function escapeCsv(val: string | number | undefined | null): string {
  if (val === undefined || val === null) return '';
  const str = String(val).replace(/"/g, '""');
  return str.includes(',') || str.includes('"') || str.includes('\n') ? `"${str}"` : str;
}

function initCsv(): void {
  writeFileSync(CSV_PATH, 'id,title,acronym,paper_count,paper_text,status\n', 'utf8');
}

function writeCsvRow(row: {
  id: string;
  title: string;
  acronym: string;
  paper_count: number;
  paper_text: string;
  status: string;
}): void {
  const line = [
    escapeCsv(row.id),
    escapeCsv(row.title),
    escapeCsv(row.acronym),
    escapeCsv(row.paper_count),
    escapeCsv(row.paper_text),
    escapeCsv(row.status),
  ].join(',') + '\n';
  appendFileSync(CSV_PATH, line, 'utf8');
}

// ── D1 ───────────────────────────────────────────────────────────────────────

function getConferences(): Conference[] {
  const out = execSync(
    `npx wrangler d1 execute ${DB_NAME} --remote --command ${JSON.stringify(
      `SELECT id, title, acronym FROM conferences ORDER BY id`
    )} --json`,
    { cwd: resolve(__dirname, '..') }
  ).toString();
  return JSON.parse(out)[0]?.results ?? [];
}

// ── Semantic Scholar ──────────────────────────────────────────────────────────

function venueMatches(venue: string, acronym: string, title: string): boolean {
  // Word-boundary match on acronym prevents "AC" matching "ACM", "ACSAC", etc.
  const acronymRe = new RegExp(`\\b${acronym.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
  if (acronymRe.test(venue)) return true;
  // Full title substring match (long titles are specific enough without word boundaries)
  if (venue.includes(title.toLowerCase())) return true;
  return false;
}

// Throws on persistent rate-limiting so the caller can record a distinct
// 'rate-limited' status instead of silently reporting "no papers found".
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

  // Query by acronym — Semantic Scholar search ranks by relevance so acronym
  // queries surface papers whose venue field actually contains it.
  const url = `https://api.semanticscholar.org/graph/v1/paper/search/bulk?query=${encodeURIComponent(acronym)}&fields=title,abstract,venue&limit=100`;
  const res = await fetchWithRetry(url);

  if (res.status === 429) {
    throw new Error('rate-limited');
  }

  if (res.ok) {
    const data = await res.json() as {
      data?: Array<{ paperId?: string; title?: string; abstract?: string; venue?: string }>;
    };

    for (const p of data.data ?? []) {
      if (papers.length >= PAPERS_PER_CONF) break;
      if (!p.paperId || seen.has(p.paperId) || !p.abstract) continue;
      const venue = p.venue?.toLowerCase() ?? '';
      if (venueMatches(venue, acronym, title)) {
        seen.add(p.paperId);
        papers.push({ title: p.title, abstract: p.abstract });
      }
    }
  }

  return papers;
}

function buildPaperText(papers: Paper[]): string {
  return papers
    .map(p => [p.title, p.abstract].filter(Boolean).join(': '))
    .join('\n\n');
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Fetching conferences from D1...');
  const rows = getConferences();
  const toProcess = rows.slice(0, LIMIT === Infinity ? rows.length : LIMIT);
  console.log(`Found ${rows.length} — processing ${toProcess.length}`);
  console.log(`Max papers per conference: ${PAPERS_PER_CONF}`);
  console.log(`CSV output: ${CSV_PATH}\n`);

  initCsv();

  if (DRY_RUN) {
    console.log('Dry run — first 5 that would be processed:');
    toProcess.slice(0, 5).forEach(c => console.log(`  - ${c.acronym}: ${c.title}`));
    return;
  }

  let succeeded = 0;
  let failed = 0;

  for (const conf of toProcess) {
    process.stdout.write(`[${conf.acronym}] fetching papers... `);

    try {
      const papers = await fetchPapers(conf.acronym, conf.title);

      if (papers.length === 0) {
        console.log('no papers found, skipping.');
        writeCsvRow({ id: conf.id, title: conf.title, acronym: conf.acronym, paper_count: 0, paper_text: '', status: 'skipped-no-papers' });
        failed++;
      } else {
        const paper_text = buildPaperText(papers);
        console.log(`${papers.length} papers.`);
        writeCsvRow({ id: conf.id, title: conf.title, acronym: conf.acronym, paper_count: papers.length, paper_text, status: 'success' });
        succeeded++;
      }
    } catch (err) {
      const msg = (err as Error).message.slice(0, 80);
      console.error(`\n  ERROR: ${msg}`);
      writeCsvRow({ id: conf.id, title: conf.title, acronym: conf.acronym, paper_count: 0, paper_text: '', status: `error: ${msg}` });
      failed++;
      if (msg === 'rate-limited') {
        // Still rate-limited after retry/backoff inside fetchPapers — cool down
        // longer before hammering the API again.
        console.log('  Still rate-limited after backoff; pausing 30s...');
        await new Promise(r => setTimeout(r, 30_000));
      }
    }

    await new Promise(r => setTimeout(r, REQUEST_DELAY_MS));
  }

  console.log(`\nDone. ${succeeded} succeeded, ${failed} failed.`);
  console.log(`Results saved to: ${CSV_PATH}`);
}

main().catch(err => { console.error(err); process.exit(1); });
