#!/usr/bin/env npx tsx
/**
 * Populates the kubishi-conference-papers Vectorize index with one vector
 * per individual conference-accepted paper, instead of one averaged vector
 * per conference (kubishi-conferences). This fixes the centroid-dilution
 * problem broad/umbrella conferences (e.g. SAC, KES) hit when their many
 * unrelated subtopics get blended into a single diffuse vector.
 *
 * Vector id = "<conference_id>-<semanticScholarPaperId>" (composite, so a
 * paper that legitimately appears under more than one conference — joint
 * conferences, acronym overlaps — gets a separate slot per conference
 * instead of one overwriting the other).
 * metadata.conference_id links back to conferences.id.
 *
 * Conference list is read directly from paper-text-output.csv (status=success)
 * rather than querying D1 fresh — this is the same set backfill-paper-text.ts
 * already confirmed has matching papers via the Semantic Scholar venue filter,
 * so we don't waste calls re-checking the ~410 conferences known to return nothing.
 *
 * Usage:
 *   npx tsx --env-file=.dev.vars scripts/backfill-conference-papers-vectors.ts
 *   npx tsx --env-file=.dev.vars scripts/backfill-conference-papers-vectors.ts --dry-run
 *
 * Required env vars:
 *   OPENAI_API_KEY
 *
 * Optional env vars:
 *   LIMIT             max conferences to process (default: all)
 *   SKIP              skip the first N conferences — for resuming after a failure (default: 0)
 *   PAPERS_PER_CONF   max papers to embed per conference (default: 30)
 */

import { execSync } from 'child_process';
import { readFileSync, writeFileSync, unlinkSync } from 'fs';
import { resolve } from 'path';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url).toString());
const VECTORIZE_INDEX = 'kubishi-conference-papers';
const CSV_PATH = resolve(__dirname, 'paper-text-output.csv');

// Same manually-confirmed acronym-collision / acronym-truncation false
// positives excluded when writing paper_text (see write-paper-text-to-d1.ts)
// — wrong regardless of which index the papers end up in.
const EXCLUDE_ACRONYMS = new Set(['DNA', 'OP', 'ICCV', 'ICVS', 'HPCC', 'CANS', 'SOFTCOM', 'GLOBAL']);

const OPENAI_API_KEY = process.env.OPENAI_API_KEY!;
const SEMANTIC_SCHOLAR_API_KEY = process.env.SEMANTIC_SCHOLAR_API_KEY;
const LIMIT = process.env.LIMIT ? parseInt(process.env.LIMIT) : Infinity;
const SKIP = process.env.SKIP ? parseInt(process.env.SKIP) : 0;
const ONLY_ACRONYMS = process.env.ONLY_ACRONYMS
  ? new Set(process.env.ONLY_ACRONYMS.split(',').map(s => s.trim()))
  : null;
const PAPERS_PER_CONF = parseInt(process.env.PAPERS_PER_CONF ?? '30');
const DRY_RUN = process.argv.includes('--dry-run');
// Semantic Scholar's unauthenticated tier rate-limits aggressively — stay
// well under 1 request/second between conference-level lookups.
const SEMANTIC_SCHOLAR_DELAY_MS = SEMANTIC_SCHOLAR_API_KEY ? 300 : 1500;

if (!OPENAI_API_KEY) {
  console.error('Missing required env var: OPENAI_API_KEY');
  process.exit(1);
}

interface ConferenceRow { id: string; title: string; acronym: string; }
interface Paper { paperId: string; title?: string; abstract: string; }

// ── CSV ──────────────────────────────────────────────────────────────────────

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let cur = '';
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') { cur += '"'; i++; }
      else inQuote = !inQuote;
    } else if (ch === ',' && !inQuote) {
      result.push(cur); cur = '';
    } else {
      cur += ch;
    }
  }
  result.push(cur);
  return result;
}

function readSuccessfulConferences(path: string): ConferenceRow[] {
  const text = readFileSync(path, 'utf8');
  const lines: string[] = [];
  let cur = '';
  let inQuote = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') inQuote = !inQuote;
    if (ch === '\n' && !inQuote) { lines.push(cur); cur = ''; }
    else cur += ch;
  }
  if (cur.trim()) lines.push(cur);

  const headers = parseCsvLine(lines[0]);
  const idIdx = headers.indexOf('id');
  const titleIdx = headers.indexOf('title');
  const acronymIdx = headers.indexOf('acronym');
  const statusIdx = headers.indexOf('status');

  const rows: ConferenceRow[] = [];
  for (const line of lines.slice(1)) {
    if (!line.trim()) continue;
    const values = parseCsvLine(line);
    if (values[statusIdx] !== 'success') continue;
    if (EXCLUDE_ACRONYMS.has(values[acronymIdx])) continue;
    rows.push({ id: values[idIdx], title: values[titleIdx], acronym: values[acronymIdx] });
  }
  return rows;
}

// ── Semantic Scholar ─────────────────────────────────────────────────────────

async function fetchWithRetry(url: string, maxRetries = 5): Promise<Response> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const res = await fetch(url, {
      headers: SEMANTIC_SCHOLAR_API_KEY ? { 'x-api-key': SEMANTIC_SCHOLAR_API_KEY } : {},
    });
    if (res.status !== 429) return res;
    if (attempt === maxRetries) return res;
    const backoffMs = 2000 * 2 ** attempt;
    await new Promise(r => setTimeout(r, backoffMs));
  }
  throw new Error('unreachable');
}

async function fetchPapers(acronym: string): Promise<Paper[]> {
  const papers: Paper[] = [];
  const url = `https://api.semanticscholar.org/graph/v1/paper/search/bulk?venue=${encodeURIComponent(acronym)}&fields=title,abstract,venue`;
  const res = await fetchWithRetry(url);
  if (res.status === 429) throw new Error('rate-limited');
  if (!res.ok) return papers;

  const data = await res.json() as { data?: Array<{ paperId?: string; title?: string; abstract?: string }> };
  for (const p of data.data ?? []) {
    if (papers.length >= PAPERS_PER_CONF) break;
    if (!p.paperId || !p.abstract) continue;
    papers.push({ paperId: p.paperId, title: p.title, abstract: p.abstract });
  }
  return papers;
}

// ── OpenAI embeddings ─────────────────────────────────────────────────────────

async function getEmbedding(text: string): Promise<number[]> {
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ input: text.slice(0, 8000), model: 'text-embedding-3-small' }),
  });
  if (!res.ok) throw new Error(`OpenAI embedding failed: ${await res.text()}`);
  const data = await res.json() as { data: Array<{ embedding: number[] }> };
  return data.data[0].embedding;
}

// ── Vectorize ─────────────────────────────────────────────────────────────────

function upsertVectors(vectors: Array<{ id: string; values: number[]; metadata: Record<string, string> }>): void {
  const tmpFile = resolve(tmpdir(), `conference-papers-upsert-${Date.now()}.ndjson`);
  try {
    writeFileSync(tmpFile, vectors.map(v => JSON.stringify(v)).join('\n'), 'utf8');
    execSync(
      `npx wrangler vectorize upsert ${VECTORIZE_INDEX} --file ${JSON.stringify(tmpFile)}`,
      { cwd: resolve(__dirname, '..'), stdio: 'pipe' }
    );
  } catch (err: unknown) {
    const execErr = err as { stdout?: Buffer; message?: string };
    const raw = execErr.stdout?.toString() ?? execErr.message ?? String(err);
    throw new Error(raw.slice(0, 500));
  } finally {
    try { unlinkSync(tmpFile); } catch {}
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`Reading ${CSV_PATH}...`);
  const all = readSuccessfulConferences(CSV_PATH);
  const filtered = ONLY_ACRONYMS ? all.filter(c => ONLY_ACRONYMS.has(c.acronym)) : all;
  const afterSkip = SKIP > 0 ? filtered.slice(SKIP) : filtered;
  const conferences = afterSkip.slice(0, LIMIT === Infinity ? afterSkip.length : LIMIT);
  console.log(`${all.length} successful conferences in CSV (skipped ${SKIP}); processing ${conferences.length}.\n`);

  if (DRY_RUN) {
    console.log('Dry run — first 3 conferences:');
    conferences.slice(0, 3).forEach(c => console.log(`  [${c.acronym}] ${c.title.slice(0, 60)}`));
    return;
  }

  let conferencesDone = 0;
  let papersEmbedded = 0;
  let conferencesFailed = 0;

  for (const conf of conferences) {
    process.stdout.write(`[${conf.acronym}] `);
    try {
      const papers = await fetchPapers(conf.acronym);
      if (papers.length === 0) {
        console.log('0 papers, skipping.');
        await new Promise(r => setTimeout(r, SEMANTIC_SCHOLAR_DELAY_MS));
        continue;
      }

      const vectors = await Promise.all(
        papers.map(async p => {
          const text = [p.title, p.abstract].filter(Boolean).join(': ');
          const values = await getEmbedding(text);
          return {
            id: `${conf.id}-${p.paperId}`,
            values,
            metadata: { conference_id: conf.id, title: p.title ?? '' },
          };
        })
      );

      upsertVectors(vectors);
      papersEmbedded += vectors.length;
      conferencesDone++;
      console.log(`${vectors.length} papers embedded + upserted.`);
    } catch (err) {
      conferencesFailed++;
      console.error(`ERROR: ${(err as Error).message.slice(0, 150)}`);
    }

    await new Promise(r => setTimeout(r, SEMANTIC_SCHOLAR_DELAY_MS));
  }

  console.log(`\nDone. ${conferencesDone} conferences processed, ${papersEmbedded} paper vectors written, ${conferencesFailed} conferences failed.`);
}

main().catch(err => { console.error(err); process.exit(1); });
