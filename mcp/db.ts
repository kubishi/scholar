// Local D1 (SQLite) access for the MCP dev server.
// Reads directly from the miniflare-managed sqlite file created by `wrangler pages dev`.

import { DatabaseSync } from "node:sqlite";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const D1_DIR = join(process.cwd(), ".wrangler/state/v3/d1/miniflare-D1DatabaseObject");

/**
 * Find the local D1 sqlite file for the kubishi-scholar-db database.
 * Miniflare names these files by a content hash, so we pick the one
 * that actually contains the `conferences` table.
 */
function findDatabaseFile(): string {
  if (!existsSync(D1_DIR)) {
    throw new Error(
      `No local D1 state found at ${D1_DIR}. Run "npm run dev" at least once to create it.`
    );
  }

  for (const file of readdirSync(D1_DIR)) {
    if (!file.endsWith(".sqlite")) continue;
    const path = join(D1_DIR, file);
    const db = new DatabaseSync(path, { readOnly: true });
    try {
      const row = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='conferences'"
      ).get();
      if (row) return path;
    } finally {
      db.close();
    }
  }

  throw new Error(`Could not find conferences table in any sqlite file under ${D1_DIR}`);
}

let db: DatabaseSync | undefined;

/** Get a read-only handle to the local D1 database (opened lazily, reused). */
export function getDb(): DatabaseSync {
  if (!db) {
    db = new DatabaseSync(findDatabaseFile(), { readOnly: true });
  }
  return db;
}
