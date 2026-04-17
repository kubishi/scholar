#!/usr/bin/env npx tsx
/// <reference types="node" />
/**
 * Imports csa.csv into the Cloudflare D1 database.
 * Inserts conferences and their ICORE2026 rankings.
 *
 * Usage:
 *   npx tsx scripts/add_conferences.ts [--dry-run]
 */

import { execSync } from "child_process";
import { createReadStream, writeFileSync, unlinkSync } from "fs";
import { createInterface } from "readline";
import { resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

const CSV_PATH = resolve(__dirname, "test.csv");
const DB_NAME = "kubishi-scholar-db";
const RANKING_SOURCE = "ICORE2026";
const DRY_RUN = process.argv.includes("--dry-run");

interface Row {
  acronym: string;
  title: string;
  deadline: string;
  notification: string;
  start: string;
  end: string;
  topics: string;
  city: string;
  country: string;
  url: string;
  ranking: string;
}

function escSql(value: string): string {
  return value.replace(/'/g, "''");
}

async function parseCsv(filePath: string): Promise<Row[]> {
  const rows: Row[] = [];
  const rl = createInterface({
    input: createReadStream(filePath),
    crlfDelay: Infinity,
  });

  let firstLine = true;
  for await (const rawLine of rl) {
    if (firstLine) {
      firstLine = false;
      continue; // skip header
    }
    if (!rawLine.trim()) continue;

    const fields = parseFields(rawLine);
    if (fields.length < 2) continue;

    // Columns: Acronym,Title,deadline,notification,start,end,location,topics,city,country,url,ICORE2026
    const [acronym, title, deadline = "", notification = "", start = "", end = "", _location = "", topics = "", city = "", country = "", url = "", ranking = ""] = fields;
    if (!acronym.trim()) continue;
    rows.push({
      acronym: acronym.trim(), title: title.trim(), deadline: deadline.trim(),
      notification: notification.trim(), start: start.trim(), end: end.trim(),
      topics: topics.trim(), city: city.trim(), country: country.trim(),
      url: url.trim(), ranking: ranking.trim(),
    });
  }
  return rows;
}

function parseFields(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      fields.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}

async function main() {
  const rows = await parseCsv(CSV_PATH);
  console.log(`Parsed ${rows.length} conferences from ${CSV_PATH}`);

  const statements: string[] = [];

  for (const { title, acronym, deadline, notification, start, end, topics, city, country, url, ranking } of rows) {
    const id = escSql(acronym);
    const t = escSql(title);
    const a = escSql(acronym);
    const dl = escSql(deadline);
    const notif = escSql(notification);
    const sd = escSql(start);
    const ed = escSql(end);
    const tp = escSql(topics);
    const ci = escSql(city);
    const co = escSql(country);
    const u = escSql(url);

    statements.push(
      `INSERT INTO conferences (id, title, acronym, deadline, notification, start_date, end_date, topics, city, country, url) ` +
      `VALUES ('${id}', '${t}', '${a}', ${dl ? `'${dl}'` : "NULL"}, ${notif ? `'${notif}'` : "NULL"}, ${sd ? `'${sd}'` : "NULL"}, ${ed ? `'${ed}'` : "NULL"}, ${tp ? `'${tp}'` : "NULL"}, ${ci ? `'${ci}'` : "NULL"}, ${co ? `'${co}'` : "NULL"}, ${u ? `'${u}'` : "NULL"}) ` +
      `ON CONFLICT(id) DO UPDATE SET title=excluded.title, acronym=excluded.acronym, deadline=excluded.deadline, notification=excluded.notification, start_date=excluded.start_date, end_date=excluded.end_date, topics=excluded.topics, city=excluded.city, country=excluded.country, url=excluded.url;`
    );

    // Upsert ranking if present
    if (ranking) {
      const r = escSql(ranking);
      statements.push(
        `INSERT INTO conference_rankings (conference_id, ranking_source, ranking_value) VALUES ('${id}', '${RANKING_SOURCE}', '${r}') ON CONFLICT(conference_id, ranking_source) DO UPDATE SET ranking_value=excluded.ranking_value;`
      );
    }
  }

  if (DRY_RUN) {
    console.log("\n--- DRY RUN: first 20 SQL statements ---");
    for (const s of statements.slice(0, 20)) console.log(s);
    if (statements.length > 20) console.log(`... and ${statements.length - 20} more`);
    console.log(`\nTotal statements: ${statements.length}`);
    return;
  }

  const tmpSql = resolve(__dirname, "_tmp_import.sql");
  writeFileSync(tmpSql, statements.join("\n") + "\n", "utf8");

  console.log(`Executing ${statements.length} SQL statements against D1 (${DB_NAME})...`);
  try {
    execSync(
      `npx wrangler d1 execute ${DB_NAME} --remote --file=${tmpSql}`,
      { stdio: "inherit", cwd: resolve(__dirname, "..") }
    );
    console.log("Done!");
  } finally {
    unlinkSync(tmpSql);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
