#!/usr/bin/env npx tsx
/**
 * Pulls data from remote D1 into the local dev DB, skipping FTS virtual tables.
 * Usage: npx tsx scripts/sync-remote-to-local.ts
 */

import { execSync } from "child_process";
import { writeFileSync, unlinkSync } from "fs";
import { resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const DB_NAME = "kubishi-scholar-db";
const TABLES = [
  "conferences",
  "conference_rankings",
];

function escSql(v: unknown): string {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number") return String(v);
  return `'${String(v).replace(/'/g, "''")}'`;
}

function fetchRemote(sql: string): Record<string, unknown>[] {
  const out = execSync(
    `npx wrangler d1 execute ${DB_NAME} --remote --command ${JSON.stringify(sql)} --json`,
    { cwd: resolve(__dirname, "..") }
  ).toString();
  const parsed = JSON.parse(out);
  return parsed[0]?.results ?? [];
}

async function main() {
  const allStatements: string[] = [];

  for (const table of TABLES) {
    console.log(`Fetching ${table}...`);
    let rows: Record<string, unknown>[];
    try {
      rows = fetchRemote(`SELECT * FROM ${table}`);
    } catch (e) {
      console.warn(`  Skipping ${table}: ${(e as Error).message.split("\n")[0]}`);
      continue;
    }
    if (!rows.length) { console.log(`  0 rows`); continue; }

    const cols = Object.keys(rows[0]);
    const colList = cols.map(c => `"${c}"`).join(", ");
    for (const row of rows) {
      const vals = cols.map(c => escSql(row[c])).join(", ");
      allStatements.push(
        `INSERT OR REPLACE INTO ${table} (${colList}) VALUES (${vals});`
      );
    }
    console.log(`  ${rows.length} rows`);
  }

  if (!allStatements.length) {
    console.log("Nothing to import.");
    return;
  }

  const tmpSql = resolve(__dirname, "_tmp_sync.sql");
  writeFileSync(tmpSql, allStatements.join("\n") + "\n", "utf8");
  console.log(`\nImporting ${allStatements.length} rows into local DB...`);
  try {
    execSync(
      `npx wrangler d1 execute ${DB_NAME} --local --file=${tmpSql}`,
      { stdio: "inherit", cwd: resolve(__dirname, "..") }
    );
    console.log("Done!");
  } finally {
    unlinkSync(tmpSql);
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
