#!/usr/bin/env npx tsx
/// <reference types="node" />
/**
 * Seeds the local D1 database with example "auto-update" submissions so the
 * "Approve & Publish Worker Updates" feature (functions/api/admin/approve-auto-updates.ts)
 * can be tested against /admin/approvals.html.
 *
 * Includes a mix of:
 *  - submissions whose name closely matches the existing conference (should auto-publish)
 *  - submissions whose name does NOT match (should be skipped for manual review)
 *  - a submission for a brand-new id with no existing conference (should auto-publish)
 *
 * Usage:
 *   npx tsx scripts/seed-auto-update-examples.ts
 */

import { execSync } from "child_process";
import { writeFileSync, unlinkSync } from "fs";
import { resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const DB_NAME = "kubishi-scholar-db";
const BOT_USER_ID = "system-bot";

function escSql(value: string): string {
  return value.replace(/'/g, "''");
}

interface Example {
  id: string;
  conference_name: string;
  city?: string;
  country?: string;
  deadline?: string;
  start_date?: string;
  end_date?: string;
  topics?: string;
  url?: string;
}

// Mix of name-match and name-mismatch examples against existing conferences.
const EXAMPLES: Example[] = [
  // Close name match -> should auto-publish
  {
    id: "ALT",
    conference_name: "International Conference on Algorithmic Learning Theory",
    city: "Tokyo",
    country: "Japan",
    deadline: "2026-09-15",
    start_date: "2027-02-08",
    end_date: "2027-02-11",
    topics: "Learning theory\nOnline learning\nStatistical learning",
    url: "https://alt-conference.org/2027/",
  },
  // Close name match (with year/edition noise) -> should auto-publish
  {
    id: "ALENEX25",
    conference_name: "SIAM Symposium on Algorithm Engineering and Experiments 2025",
    city: "New Orleans",
    country: "USA",
    deadline: "2026-09-01",
    start_date: "2027-01-05",
    end_date: "2027-01-06",
    topics: "Algorithm engineering\nExperimental algorithmics",
    url: "https://www.siam.org/conferences/cm/conference/alenex25",
  },
  // Mismatched name -> should be skipped for manual review
  {
    id: "AIIM26",
    conference_name: "Workshop on Quantum Cryptography and Security",
    city: "Berlin",
    country: "Germany",
    deadline: "2026-10-01",
    start_date: "2027-03-01",
    end_date: "2027-03-03",
    topics: "Quantum cryptography\nPost-quantum security",
    url: "https://example.com/quantum-crypto-workshop",
  },
  // Mismatched name -> should be skipped for manual review
  {
    id: "ASCILITE",
    conference_name: "International Conference on Robotics and Automation",
    city: "Singapore",
    country: "Singapore",
    deadline: "2026-11-15",
    start_date: "2027-05-10",
    end_date: "2027-05-13",
    topics: "Robotics\nAutomation\nControl systems",
    url: "https://example.com/icra",
  },
  // No existing conference with this id -> existing is null, should auto-publish
  {
    id: "EXAMPLECONF26",
    conference_name: "Example Conference on Test Automation",
    city: "Austin",
    country: "USA",
    deadline: "2026-12-01",
    start_date: "2027-04-01",
    end_date: "2027-04-03",
    topics: "Software testing\nCI/CD\nAutomation",
    url: "https://example.com/exampleconf",
  },
];

const statements: string[] = [];

// Ensure the bot user exists (submitted_conferences.submitter_id has an FK to users.id)
statements.push(`
INSERT INTO users (id, name, email, privilege)
VALUES ('${BOT_USER_ID}', 'Automation Worker', 'admin@kubishi.com', 'user')
ON CONFLICT(id) DO NOTHING;
`);

for (const ex of EXAMPLES) {
  statements.push(`
INSERT INTO submitted_conferences (
  id, conference_name, city, country, deadline, start_date, end_date, topics, url,
  submitter_id, submitter_name, submitter_email, edit_type, status, submitted_at
) VALUES (
  '${escSql(ex.id)}', '${escSql(ex.conference_name)}', ${ex.city ? `'${escSql(ex.city)}'` : "NULL"},
  ${ex.country ? `'${escSql(ex.country)}'` : "NULL"}, ${ex.deadline ? `'${ex.deadline}'` : "NULL"},
  ${ex.start_date ? `'${ex.start_date}'` : "NULL"}, ${ex.end_date ? `'${ex.end_date}'` : "NULL"},
  ${ex.topics ? `'${escSql(ex.topics)}'` : "NULL"}, ${ex.url ? `'${escSql(ex.url)}'` : "NULL"},
  '${BOT_USER_ID}', 'Automation Worker', 'admin@kubishi.com', 'auto-update', 'waiting', datetime('now')
)
ON CONFLICT(id) DO UPDATE SET
  conference_name = excluded.conference_name,
  city = excluded.city,
  country = excluded.country,
  deadline = excluded.deadline,
  start_date = excluded.start_date,
  end_date = excluded.end_date,
  topics = excluded.topics,
  url = excluded.url,
  edit_type = excluded.edit_type,
  status = 'waiting',
  submitted_at = datetime('now');
`);
}

const sqlPath = resolve(__dirname, "_seed-auto-update-examples.sql");
writeFileSync(sqlPath, statements.join("\n"));

try {
  execSync(`npx wrangler d1 execute ${DB_NAME} --local --file="${sqlPath}"`, {
    stdio: "inherit",
    cwd: resolve(__dirname, ".."),
  });
  console.log(`\nSeeded ${EXAMPLES.length} example auto-update submission(s) into local DB.`);
} finally {
  unlinkSync(sqlPath);
}
