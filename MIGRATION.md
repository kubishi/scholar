# Migration: Heroku/Flask/MongoDB to Cloudflare

This document describes the migration of Kubishi Scholar from the original Heroku-based stack to Cloudflare.

## Previous Stack

- **Hosting:** Heroku
- **Backend:** Python/Flask
- **Database:** MongoDB Atlas
- **Search:** MongoDB Atlas Search (vector + text indexes)
- **Frontend:** Jinja2 templates + Bootstrap
- **Auth:** Auth0

## New Stack

- **Hosting:** Cloudflare Pages
- **Backend:** Cloudflare Functions (TypeScript)
- **Database:** Cloudflare D1 (SQLite)
- **Text Search:** D1 FTS5 (full-text search)
- **Vector Search:** Cloudflare Vectorize
- **Frontend:** Static HTML + vanilla JS + Bootstrap 5
- **Auth:** Auth0 (unchanged)

## Why Migrate?

1. **Cost:** Cloudflare's free tier is more generous than Heroku
2. **Performance:** Edge deployment provides lower latency globally
3. **Simplicity:** No server management, automatic scaling
4. **Modern stack:** TypeScript, better tooling

## Architecture Changes

### Database

**Before (MongoDB):**
- Single `conferences` collection with embedded rankings and vectors
- `users` collection with embedded favorites array
- `user_submitted_conf` collection for submissions

**After (D1 + Vectorize):**
- `conferences` table - core conference data
- `conference_rankings` table - normalized rankings (one row per source)
- `users` table - user accounts
- `user_favorites` table - junction table for favorites
- `submitted_conferences` table - pending submissions
- `conferences_fts` - FTS5 virtual table for text search
- Vectorize index - separate vector storage

### Search

**Before:**
- MongoDB Atlas Search with `$vectorSearch` and `$search` aggregations
- Combined vector and text search in single query

**After:**
- Separate search systems:
  - **Lexical:** D1 FTS5 with BM25 scoring
  - **Semantic:** Cloudflare Vectorize cosine similarity
  - **Hybrid:** Reciprocal Rank Fusion (RRF) combining both

### API

**Before:**
- Flask routes returning rendered HTML or JSON
- Server-side template rendering

**After:**
- Cloudflare Functions returning JSON only
- Client-side rendering with vanilla JS

## Migration Scripts

Two scripts handle data migration:

### 1. `scripts/migrate-mongo-to-d1.ts`

Migrates structured data from MongoDB to D1:

```bash
# Set environment variables
export MONGO_URI="mongodb+srv://..."
export CLOUDFLARE_ACCOUNT_ID="..."
export CLOUDFLARE_API_TOKEN="..."
export D1_DATABASE_ID="..."

# Run migration
npx tsx scripts/migrate-mongo-to-d1.ts
```

Migrates:
- Conferences (253 records)
- Conference rankings (normalized from embedded `core` object)
- Users (5 records)
- User favorites
- Submissions

### 2. `scripts/migrate-vectors.ts`

Migrates vector embeddings to Cloudflare Vectorize:

```bash
# Set environment variables (same as above, plus)
export VECTORIZE_INDEX_NAME="kubishi-conferences"

# Run migration
npx tsx scripts/migrate-vectors.ts
```

Migrates:
- Vector embeddings (253 vectors, 1536 dimensions each)
- Metadata (id, title, acronym, location, dates)

## Search Algorithm: Reciprocal Rank Fusion

The hybrid search combines lexical and semantic results using RRF:

```typescript
function rrfFuse(rankings: Array<Array<{id: string}>>, k = 50, c = 60): string[] {
  const scores = new Map<string, number>();

  for (const list of rankings) {
    for (let rank = 0; rank < list.length; rank++) {
      const id = list[rank].id;
      const current = scores.get(id) ?? 0;
      scores.set(id, current + 1.0 / (c + rank + 1));
    }
  }

  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, k)
    .map(([id]) => id);
}
```

Parameters:
- `c = 60` - standard RRF constant
- Equal weights for lexical and semantic (1.0 each)
- Returns top 50 results before filtering

## Schema Design

### FTS5 Configuration

```sql
CREATE VIRTUAL TABLE conferences_fts USING fts5(
    id, title, acronym, topics, city, country,
    content='conferences',
    content_rowid='rowid'
);
```

Triggers keep FTS index synchronized with main table.

### Vectorize Index

```bash
wrangler vectorize create kubishi-conferences \
  --dimensions 1536 \
  --metric cosine
```

Uses OpenAI `text-embedding-3-small` model (1536 dimensions).

## Auth Changes

- Auth0 configuration unchanged
- JWT verification moved from Flask to Cloudflare Functions
- Uses `jose` library for RS256 JWT verification
- JWKS fetched from Auth0 and cached

## Files Mapping

| Old (Flask) | New (Cloudflare) |
|-------------|------------------|
| `app.py` | `functions/api/*.ts` |
| `services/mongo_atlas_service.py` | `functions/lib/db.ts`, `functions/lib/vectorize.ts` |
| `templates/*.html` | `frontend/public/*.html` |
| `static/styles.scss` | `frontend/public/css/styles.css` |
| N/A | `functions/_middleware.ts` (auth) |

## Known Differences

1. **Local development:** Vectorize doesn't work locally; must test on deployed version
2. **Secrets:** Must use `wrangler pages secret put` for sensitive values
3. **FTS syntax:** FTS5 uses different syntax than MongoDB text search
4. **No aggregation:** D1 doesn't have MongoDB's aggregation pipeline

## Rollback Plan

The original Heroku app and MongoDB database remain intact. To rollback:

1. Point DNS back to Heroku
2. Ensure MongoDB Atlas cluster is running
3. No data migration needed (original data unchanged)
