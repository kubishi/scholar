#!/usr/bin/env npx tsx
/**
 * Re-embeds conferences using paper_text + topics from D1 and upserts to Vectorize.
 * Falls back to topics, then title+acronym for conferences without paper_text.
 *
 * Usage:
 *   npx tsx --env-file=.dev.vars scripts/revectorize-conferences.ts
 *   npx tsx --env-file=.dev.vars scripts/revectorize-conferences.ts --dry-run
 *
 * Uses `wrangler vectorize upsert` (OAuth-authenticated) instead of the raw
 * Vectorize REST API, so no CLOUDFLARE_API_TOKEN is required.
 *
 * Required env vars:
 *   OPENAI_API_KEY
 *
 * Optional env vars:
 *   LIMIT             max conferences to process (default: all)
 *   ONLY_PAPER_TEXT=1 only process conferences that have paper_text (default: all)
 */

import { execSync } from 'child_process';
import { writeFileSync, unlinkSync } from 'fs';
import { resolve } from 'path';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url).toString());
const DB_NAME = 'kubishi-scholar-db';
const VECTORIZE_INDEX = 'kubishi-conferences';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY!;
const LIMIT = process.env.LIMIT ? parseInt(process.env.LIMIT) : Infinity;
const SKIP = process.env.SKIP ? parseInt(process.env.SKIP) : 0;
const ONLY_PAPER_TEXT = process.env.ONLY_PAPER_TEXT === '1';
const DRY_RUN = process.argv.includes('--dry-run');

if (!OPENAI_API_KEY) {
  console.error('Missing required env var: OPENAI_API_KEY');
  process.exit(1);
}

interface Conference {
  id: string;
  title: string;
  acronym: string;
  paper_text?: string;
  topics?: string;
}

// ── D1 ───────────────────────────────────────────────────────────────────────

function getConferences(): Conference[] {
  const where = ONLY_PAPER_TEXT ? `WHERE paper_text IS NOT NULL AND paper_text != ''` : '';
  const out = execSync(
    `npx wrangler d1 execute ${DB_NAME} --remote --command ${JSON.stringify(
      `SELECT id, title, acronym, paper_text, topics FROM conferences ${where} ORDER BY id`
    )} --json`,
    { cwd: resolve(__dirname, '..'), maxBuffer: 1024 * 1024 * 100 }
  ).toString();
  return JSON.parse(out)[0]?.results ?? [];
}

function buildEmbedText(conf: Conference): string {
  const parts: string[] = [];

  if (conf.paper_text?.trim()) parts.push(conf.paper_text.trim());
  else if (conf.topics?.trim()) parts.push(conf.topics.trim());
  else parts.push(`${conf.title} (${conf.acronym})`);

  if (conf.paper_text?.trim() && conf.topics?.trim()) parts.push(conf.topics.trim());

  return parts.join('\n\n');
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
  const tmpFile = resolve(tmpdir(), `vectorize-upsert-${Date.now()}.ndjson`);
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
  console.log('Loading conferences from D1...');
  const all = getConferences();
  const afterSkip = SKIP > 0 ? all.slice(SKIP) : all;
  const conferences = afterSkip.slice(0, LIMIT === Infinity ? afterSkip.length : LIMIT);
  console.log(`Loaded ${all.length} conferences (skipped ${SKIP}); processing ${conferences.length}.\n`);

  const withPaperText = conferences.filter(c => c.paper_text?.trim());
  const withTopics = conferences.filter(c => !c.paper_text?.trim() && c.topics?.trim());
  const titleOnly = conferences.filter(c => !c.paper_text?.trim() && !c.topics?.trim());

  console.log(`  paper_text:  ${withPaperText.length}`);
  console.log(`  topics only: ${withTopics.length}`);
  console.log(`  title only:  ${titleOnly.length}\n`);

  if (DRY_RUN) {
    console.log('Dry run — first 5:');
    conferences.slice(0, 5).forEach(c => {
      const source = c.paper_text ? 'paper_text' : c.topics ? 'topics' : 'title';
      console.log(`  [${source}] ${c.acronym}: ${buildEmbedText(c).slice(0, 80).replace(/\n/g, ' ')}...`);
    });
    return;
  }

  const BATCH_SIZE = 10;
  let succeeded = 0;
  let failed = 0;

  for (let i = 0; i < conferences.length; i += BATCH_SIZE) {
    const batch = conferences.slice(i, i + BATCH_SIZE);

    const vectors = await Promise.all(
      batch.map(async conf => {
        const text = buildEmbedText(conf);
        const source = conf.paper_text ? 'paper_text' : conf.topics ? 'topics' : 'title';
        process.stdout.write(`[${conf.acronym}/${source}] `);
        try {
          const values = await getEmbedding(text);
          succeeded++;
          return { id: conf.id, values, metadata: { id: conf.id, title: conf.title, acronym: conf.acronym } };
        } catch (err) {
          console.error(`\n  ERROR ${conf.acronym}: ${(err as Error).message.slice(0, 80)}`);
          failed++;
          return null;
        }
      })
    );

    const valid = vectors.filter(Boolean) as Array<{ id: string; values: number[]; metadata: Record<string, string> }>;
    if (valid.length > 0) {
      upsertVectors(valid);
    }

    console.log(`  batch ${Math.floor(i / BATCH_SIZE) + 1} done`);
    await new Promise(r => setTimeout(r, 200));
  }

  console.log(`\nDone. ${succeeded} upserted, ${failed} failed.`);
}

main().catch(err => { console.error(err); process.exit(1); });
