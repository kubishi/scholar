#!/usr/bin/env npx tsx
/**
 * Generates descriptions for conferences without one by scraping the
 * conference website and using GPT to extract a description.
 * Saves all results to descriptions-output.csv and writes to D1.
 *
 * Usage:
 *   npx tsx --env-file=.dev.vars scripts/backfill-descriptions.ts
 *   npx tsx --env-file=.dev.vars scripts/backfill-descriptions.ts --dry-run
 *
 * Required env vars:
 *   OPENAI_API_KEY
 *
 * Optional:
 *   LIMIT   max conferences to process (default: all)
 */

import { execSync } from 'child_process';
import { writeFileSync, appendFileSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url).toString());
const DB_NAME = 'kubishi-scholar-db';
const CSV_PATH = resolve(__dirname, 'descriptions-output.csv');

const OPENAI_API_KEY = process.env.OPENAI_API_KEY!;
const LIMIT = process.env.LIMIT ? parseInt(process.env.LIMIT) : Infinity;
const DRY_RUN = process.argv.includes('--dry-run');

if (!OPENAI_API_KEY) {
  console.error('Missing required env var: OPENAI_API_KEY');
  process.exit(1);
}

interface Conference {
  id: string;
  title: string;
  acronym: string;
  topics?: string;
  url?: string;
  city?: string;
  country?: string;
}

// ── CSV ───────────────────────────────────────────────────────────────────────

function escapeCsv(val: string | undefined | null): string {
  if (!val) return '';
  const str = String(val).replace(/"/g, '""');
  return str.includes(',') || str.includes('"') || str.includes('\n') ? `"${str}"` : str;
}

function initCsv(): void {
  writeFileSync(CSV_PATH, 'id,title,url,description,status\n', 'utf8');
}

function writeCsvRow(row: { id: string; title: string; url: string; description: string; status: string }): void {
  const line = [
    escapeCsv(row.id),
    escapeCsv(row.title),
    escapeCsv(row.url),
    escapeCsv(row.description),
    escapeCsv(row.status),
  ].join(',') + '\n';
  appendFileSync(CSV_PATH, line, 'utf8');
}

// ── D1 ───────────────────────────────────────────────────────────────────────

function queryRemote(sql: string): Record<string, unknown>[] {
  const out = execSync(
    `npx wrangler d1 execute ${DB_NAME} --remote --command ${JSON.stringify(sql)} --json`,
    { cwd: resolve(__dirname, '..') }
  ).toString();
  return JSON.parse(out)[0]?.results ?? [];
}

// function executeRemoteSql(statements: string[]): void {
//   const tmp = resolve(__dirname, '_tmp_descriptions.sql');
//   writeFileSync(tmp, statements.join('\n') + '\n', 'utf8');
//   try {
//     execSync(`npx wrangler d1 execute ${DB_NAME} --remote --file=${tmp}`, {
//       stdio: 'inherit',
//       cwd: resolve(__dirname, '..'),
//     });
//   } finally {
//     unlinkSync(tmp);
//   }
// }

// ── Website scraping ──────────────────────────────────────────────────────────

async function fetchPageText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ScholarBot/1.0)' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const html = await res.text();
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 6000);
  } catch {
    return null;
  }
}

async function fetchCfpText(baseUrl: string): Promise<string | null> {
  const base = baseUrl.replace(/\/$/, '');
  const candidates = [
    `${base}/cfp`,
    `${base}/cfp.html`,
    `${base}/call-for-papers`,
    `${base}/call-for-papers.html`,
    `${base}/call`,
    `${base}/topics`,
    `${base}/topics.html`,
    `${base}/about`,
  ];

  for (const url of candidates) {
    const text = await fetchPageText(url);
    if (text && text.length > 300) return text;
  }

  // Fall back to homepage
  return fetchPageText(baseUrl);
}

// ── OpenAI ────────────────────────────────────────────────────────────────────

async function extractDescription(conf: Conference, pageText: string): Promise<string> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'Extract the scope and topics of the academic conference from the webpage text. Preserve specific research areas, subfields, and methodologies — do not summarize or compress them. Write 3-5 sentences covering: what the conference is about, what community it serves, and a detailed list of the specific topics it covers. Use only information present in the text. If the text does not contain enough information, return an empty string.',
        },
        {
          role: 'user',
          content: `Conference: ${conf.title} (${conf.acronym})\n\nWebpage text:\n${pageText}`,
        },
      ],
      max_tokens: 200,
      temperature: 0.1,
    }),
  });
  if (!res.ok) throw new Error(`OpenAI failed: ${await res.text()}`);
  const data = await res.json() as { choices: Array<{ message: { content: string } }> };
  return data.choices[0].message.content.trim();
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Fetching conferences without descriptions...');
  const rows = queryRemote(
    "SELECT id, title, acronym, topics, url, city, country FROM conferences WHERE description IS NULL OR description = ''"
  ) as unknown as Conference[];

  const toProcess = rows.slice(0, LIMIT === Infinity ? rows.length : LIMIT);
  console.log(`Found ${rows.length} — processing ${toProcess.length}`);
  console.log(`CSV output: ${CSV_PATH}\n`);

  initCsv();

  if (DRY_RUN) {
    console.log('Dry run — first 5 that would be processed:');
    toProcess.slice(0, 5).forEach(c => console.log(` - ${c.acronym}: ${c.title} (${c.url ?? 'no url'})`));
    return;
  }

  const sqlUpdates: string[] = [];
  let succeeded = 0;
  let failed = 0;

  for (const conf of toProcess) {
    process.stdout.write(`[${conf.acronym}] `);

    if (!conf.url) {
      console.log('no url, skipping.');
      writeCsvRow({ id: conf.id, title: conf.title, url: '', description: '', status: 'skipped-no-url' });
      failed++;
      continue;
    }

    try {
      process.stdout.write('fetching cfp... ');
      const pageText = await fetchCfpText(conf.url);

      if (!pageText) {
        console.log('fetch failed, skipping.');
        writeCsvRow({ id: conf.id, title: conf.title, url: conf.url, description: '', status: 'skipped-fetch-failed' });
        failed++;
        continue;
      }

      process.stdout.write('extracting description... ');
      const description = await extractDescription(conf, pageText);

      if (!description) {
        console.log('no description found, skipping.');
        writeCsvRow({ id: conf.id, title: conf.title, url: conf.url, description: '', status: 'skipped-no-description' });
        failed++;
        continue;
      }

      const escaped = description.replace(/'/g, "''");
      sqlUpdates.push(`UPDATE conferences SET description = '${escaped}', updated_at = datetime('now') WHERE id = '${conf.id}';`);

      writeCsvRow({ id: conf.id, title: conf.title, url: conf.url, description, status: 'success' });
      console.log('done.');
      succeeded++;
    } catch (err) {
      const msg = (err as Error).message.slice(0, 80);
      console.error(`\n  ERROR: ${msg}`);
      writeCsvRow({ id: conf.id, title: conf.title, url: conf.url ?? '', description: '', status: `error: ${msg}` });
      failed++;
    }

    await new Promise(r => setTimeout(r, 300));
  }

  // if (sqlUpdates.length > 0) {
  //   console.log(`\nWriting ${sqlUpdates.length} descriptions to D1...`);
  //   executeRemoteSql(sqlUpdates);
  // }

  console.log(`\nDone. ${succeeded} succeeded, ${failed} failed.`);
  console.log(`Results saved to: ${CSV_PATH}`);
}

main().catch(err => { console.error(err); process.exit(1); });
