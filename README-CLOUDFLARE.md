# Kubishi Scholar - Cloudflare Deployment

This document covers the Cloudflare Pages/Workers deployment of Kubishi Scholar.

## Architecture

- **Frontend**: Static HTML + vanilla JS served from Cloudflare Pages
- **API**: Cloudflare Pages Functions (Workers)
- **Database**: Cloudflare D1 (SQLite)
- **Vector Search**: Cloudflare Vectorize
- **Auth**: Auth0 (SPA SDK + JWT verification)

## Prerequisites

1. [Cloudflare account](https://dash.cloudflare.com/sign-up)
2. [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/)
3. [Auth0 account](https://auth0.com/) with SPA application configured
4. [OpenAI API key](https://platform.openai.com/api-keys)
5. Node.js 18+

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Login to Cloudflare

```bash
wrangler login
```

### 3. Create D1 Database

```bash
wrangler d1 create kubishi-scholar-db
```

Copy the database ID from the output and update `wrangler.toml`:

```toml
[[d1_databases]]
binding = "DB"
database_name = "kubishi-scholar-db"
database_id = "your-database-id-here"
```

### 4. Apply Database Schema

```bash
wrangler d1 execute kubishi-scholar-db --file=schema/d1-schema.sql
```

### 5. Create Vectorize Index

```bash
wrangler vectorize create kubishi-conferences --dimensions 1536 --metric cosine
```

### 6. Set Secrets

```bash
wrangler secret put AUTH0_DOMAIN
# Enter your Auth0 domain (e.g., kubishi.auth0.com)

wrangler secret put AUTH0_CLIENT_ID
# Enter your Auth0 SPA Client ID

wrangler secret put AUTH0_AUDIENCE
# Enter your API identifier

wrangler secret put OPENAI_API_KEY
# Enter your OpenAI API key
```

### 7. Update Frontend Config

Edit `frontend/public/js/config.js` with your Auth0 settings:

```javascript
window.AUTH0_CONFIG = {
  domain: 'YOUR_AUTH0_DOMAIN.auth0.com',
  clientId: 'YOUR_AUTH0_CLIENT_ID',
  audience: 'YOUR_API_AUDIENCE',
  redirectUri: window.location.origin,
};
```

## Development

Run local development server:

```bash
npm run dev
```

This starts Wrangler Pages dev server with D1 bindings.

## Deployment

Deploy to Cloudflare Pages:

```bash
npm run deploy
```

Or use Wrangler directly:

```bash
wrangler pages deploy frontend/public --project-name=kubishi-scholar
```

## Data Migration (from MongoDB)

### Prerequisites

Set environment variables:

```bash
export MONGO_URI="mongodb+srv://..."
export CLOUDFLARE_ACCOUNT_ID="your-account-id"
export CLOUDFLARE_API_TOKEN="your-api-token"
export D1_DATABASE_ID="your-d1-database-id"
```

### Migrate Data to D1

```bash
npm run migrate:mongo
```

### Migrate Vectors to Vectorize

```bash
npm run migrate:vectors
```

## Project Structure

```
kubishi-scholar/
├── frontend/public/          # Static frontend files
│   ├── index.html            # Main search page
│   ├── saved.html            # Saved conferences
│   ├── add-conference.html   # Submit new conference
│   ├── edit-conference.html  # Edit existing conference
│   ├── friends.html          # Find friends
│   ├── admin/approvals.html  # Admin dashboard
│   ├── css/styles.css        # Styles
│   ├── js/                   # JavaScript modules
│   └── img/                  # Images
├── functions/                # Cloudflare Pages Functions
│   ├── api/                  # API endpoints
│   ├── lib/                  # Shared utilities
│   └── _middleware.ts        # Auth middleware
├── schema/                   # Database schema
├── scripts/                  # Migration scripts
├── wrangler.toml             # Cloudflare configuration
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
| `/api/admin/submissions` | GET | Admin | List submissions |
| `/api/admin/approve/:id` | POST | Admin | Approve submission |
| `/api/admin/reject/:id` | DELETE | Admin | Reject submission |
| `/api/admin/submit-all` | POST | Admin | Publish approved |

## Auth0 Configuration

### Create SPA Application

1. Go to Auth0 Dashboard → Applications → Create Application
2. Choose "Single Page Application"
3. Configure Allowed Callback URLs, Logout URLs, and Web Origins with your domain

### Create API

1. Go to Auth0 Dashboard → APIs → Create API
2. Set an identifier (e.g., `https://api.scholar.kubishi.com`)
3. This becomes your `AUTH0_AUDIENCE`

### Required Scopes

- `openid`
- `profile`
- `email`

## Troubleshooting

### CORS Issues

Cloudflare Pages Functions handle CORS automatically for same-origin requests.

### JWT Verification Fails

Ensure `AUTH0_DOMAIN` and `AUTH0_AUDIENCE` match your Auth0 configuration exactly.

### Vector Search Returns No Results

1. Verify Vectorize index exists: `wrangler vectorize list`
2. Check vectors were migrated: the migration script shows counts
3. Ensure embedding dimensions match (1536 for text-embedding-3-small)

### FTS5 Search Returns No Results

The FTS triggers should auto-populate the index. If not, rebuild:

```sql
-- In D1 console
INSERT INTO conferences_fts(conferences_fts) VALUES('rebuild');
```
