# Kubishi Scholar

A web app that helps researchers identify, explore, and organize academic conferences using semantic, lexical, and hybrid search.

**Live:** https://scholar.kubishi.com/

## Tech Stack

- **Frontend:** Static HTML + vanilla JS + Bootstrap 5
- **Backend:** Cloudflare Pages Functions (TypeScript)
- **Database:** Cloudflare D1 (SQLite) with FTS5 for full-text search
- **Vector Search:** Cloudflare Vectorize (1536 dimensions, cosine similarity)
- **Auth:** Auth0 SPA SDK with RS256 JWT verification
- **Embeddings:** OpenAI text-embedding-3-small

## Prerequisites

- Node.js 18+
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/)
- Cloudflare account
- Auth0 account
- OpenAI API key

## Quick Start

### Install Dependencies

```bash
npm install
```

### Login to Cloudflare

```bash
npx wrangler login
```

### Local Development

```bash
npx wrangler pages dev frontend/public --compatibility-date=2024-01-01
```

Note: Local dev has limitations - D1 will be empty and Vectorize doesn't work locally.

### Deploy to Production

```bash
npx wrangler pages deploy frontend/public --project-name=kubishi-scholar
```

## Configuration

### Environment Variables

Set in `wrangler.toml` under `[vars]`:

- `AUTH0_DOMAIN` - Your Auth0 domain
- `AUTH0_CLIENT_ID` - Auth0 SPA client ID
- `AUTH0_AUDIENCE` - Auth0 API audience

### Secrets

Set via Cloudflare Dashboard:

1. Go to **Workers & Pages** > **kubishi-scholar** > **Settings** > **Environment variables**
2. Add `OPENAI_API_KEY` as an **Encrypted** variable in Production

### Frontend Config

Update `frontend/public/js/config.js` with your Auth0 settings.

## Project Structure

```
kubishi-scholar/
├── frontend/public/      # Static frontend
│   ├── index.html        # Main search page
│   ├── css/styles.css    # Styles
│   └── js/               # JavaScript modules
├── functions/            # Cloudflare Functions API
│   ├── api/              # API endpoints
│   ├── lib/              # Shared utilities
│   └── _middleware.ts    # Auth middleware
├── schema/               # Database schema
│   └── d1-schema.sql     # D1 schema with FTS5
├── scripts/              # Migration scripts
├── wrangler.toml         # Cloudflare config
└── package.json
```

## API Endpoints

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/search` | GET | No | Search conferences |
| `/api/conferences/:id` | GET | No | Get conference by ID |
| `/api/conferences/count` | GET | No | Get total count |
| `/api/user` | GET | Yes | Get user profile |
| `/api/favorites` | POST | Yes | Toggle favorite |
| `/api/conferences/submit` | POST | Yes | Submit conference |
| `/api/admin/*` | * | Admin | Admin endpoints |

## Database Setup

### Create D1 Database

```bash
npx wrangler d1 create kubishi-scholar-db
```

### Apply Schema

```bash
npx wrangler d1 execute kubishi-scholar-db --file=schema/d1-schema.sql --remote
```

### Create Vectorize Index

```bash
npx wrangler vectorize create kubishi-conferences --dimensions 1536 --metric cosine
```

## See Also

- [MIGRATION.md](MIGRATION.md) - Migration details from previous stack
