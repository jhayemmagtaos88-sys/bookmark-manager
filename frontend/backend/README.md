# Bookmark Manager Backend

This is the backend API for the Bookmark Manager app.

## Setup

1. Install dependencies:
   npm install
2. Copy `.env.example` to `.env`
3. Start the server:
   npm run dev

Without `DATABASE_URL`, the API uses `data/store.json` and creates local daily backups. Set `DATABASE_URL` to use PostgreSQL; the server creates its tables at startup. Set `DATABASE_SSL=true` when the database endpoint requires TLS. Keep `JWT_SECRET` unchanged to preserve existing logins.

## Import existing JSON data into PostgreSQL

The migration reads `data/store.json` by default, imports users and bookmarks in one transaction, and never modifies the source file. It refuses to import if the destination database already contains rows.

From PowerShell, set the connection string using the database's external connection URL. Do not commit the URL or put it in a shared script:

```powershell
$env:DATABASE_URL = 'postgresql://...'
$env:DATABASE_SSL = 'true'
npm run migrate:postgres
npm run migrate:postgres -- --execute
```

The first command is a dry run. The second performs the import. Keep a separate copy of the JSON store before migration. After verifying the import, configure the hosted backend with its internal PostgreSQL URL and `DATABASE_SSL=false` unless its connection settings require TLS.

## API

- `GET /api/health`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/bookmarks`
- `POST /api/bookmarks`
- `PUT /api/bookmarks/:id`
- `DELETE /api/bookmarks/:id`

## Authentication

Use a Bearer token in the `Authorization` header.
