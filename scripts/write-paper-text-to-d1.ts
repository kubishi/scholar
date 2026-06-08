#!/usr/bin/env npx tsx
/**
 * Reads paper-text-output.csv and writes successful rows to D1.
 * Run this after backfill-paper-text.ts to persist results to the database.
 *
 * Usage:
 *   npx tsx --env-file=.dev.vars scripts/write-paper-text-to-d1.ts
 *   npx tsx --env-file=.dev.vars scripts/write-paper-text-to-d1.ts --dry-run
 */

import { execSync } from 'child_process';
import { readFileSync, writeFileSync, unlinkSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url).toString());
const DB_NAME = 'kubishi-scholar-db';
const CSV_PATH = resolve(__dirname, 'paper-text-output.csv');
const TMP_SQL = resolve(__dirname, '_tmp_paper_text.sql');
const DRY_RUN = process.argv.includes('--dry-run');

// ── CSV parser ────────────────────────────────────────────────────────────────

function parseCsv(content: string): Array<Record<string, string>> {
  const rows: Array<Record<string, string>> = [];
  let headers: string[] = [];
  let field = '';
  let fields: string[] = [];
  let inQuotes = false;
  let i = 0;

  const flush = () => { fields.push(field); field = ''; };

  while (i < content.length) {
    const ch = content[i];
    if (inQuotes) {
      if (ch === '"' && content[i + 1] === '"') { field += '"'; i += 2; continue; }
      if (ch === '"') { inQuotes = false; i++; continue; }
      field += ch;
    } else {
      if (ch === '"') { inQuotes = true; i++; continue; }
      if (ch === ',') { flush(); i++; continue; }
      if (ch === '\r' && content[i + 1] === '\n') { flush(); i += 2; }
      else if (ch === '\n') { flush(); i++; }
      else { field += ch; i++; continue; }

      if (headers.length === 0) {
        headers = fields;
      } else if (fields.length > 0) {
        const row: Record<string, string> = {};
        headers.forEach((h, idx) => { row[h] = fields[idx] ?? ''; });
        rows.push(row);
      }
      fields = [];
      continue;
    }
    i++;
  }

  // flush final field/row
  if (field || fields.length > 0) {
    flush();
    if (headers.length === 0) headers = fields;
    else if (fields.length > 0) {
      const row: Record<string, string> = {};
      headers.forEach((h, idx) => { row[h] = fields[idx] ?? ''; });
      rows.push(row);
    }
  }

  return rows;
}

// ── Main ──────────────────────────────────────────────────────────────────────

function main() {
  const content = readFileSync(CSV_PATH, 'utf8');
  const rows = parseCsv(content);
  const successful = rows.filter(r => r.status === 'success' && r.paper_text);

  console.log(`CSV rows: ${rows.length} total, ${successful.length} successful`);

  if (successful.length === 0) {
    console.log('Nothing to write.');
    return;
  }

  if (DRY_RUN) {
    console.log('Dry run — first 3 that would be written:');
    successful.slice(0, 3).forEach(r =>
      console.log(`  ${r.id}: ${r.paper_text.slice(0, 80).replace(/\n/g, ' ')}...`)
    );
    return;
  }

  const statements = successful.map(r => {
    const escaped = r.paper_text.replace(/'/g, "''");
    return `UPDATE conferences SET paper_text = '${escaped}', updated_at = datetime('now') WHERE id = '${r.id}';`;
  });

  writeFileSync(TMP_SQL, statements.join('\n') + '\n', 'utf8');

  try {
    console.log(`Writing ${statements.length} rows to D1...`);
    execSync(`npx wrangler d1 execute ${DB_NAME} --remote --file=${TMP_SQL}`, {
      stdio: 'inherit',
      cwd: resolve(__dirname, '..'),
    });
    console.log('Done.');
  } finally {
    unlinkSync(TMP_SQL);
  }
}

main();
