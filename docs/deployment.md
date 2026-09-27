# Deployment

This project is built and verified as a local/demo application. Notes below are what would actually need to change to run it somewhere else — not a claim that any of this has been done.

## Local (verified)

```bash
npm install
cp .env.example .env
npm run db:migrate
npm run build
npm run start -- -p 3000
```

Requires `tesseract-ocr` and `poppler-utils` on the host (system packages, not npm packages) — `pdftotext`, `pdftoppm`, and `tesseract` all need to be on `PATH`. `better-sqlite3`'s native addon is compiled at `npm install` time for whatever platform you're installing on; there's no separate build step for it.

## Moving off SQLite

SQLite (`dev.db`, a single file) is fine for a demo and for the kind of document volume a single portfolio review would generate. It is not a target for concurrent multi-writer production load. To move to Postgres:

1. `lib/db/client.ts`: swap `drizzle-orm/better-sqlite3` + `better-sqlite3` for `drizzle-orm/node-postgres` (or `postgres-js`) + a Postgres driver.
2. `drizzle.config.ts`: `dialect: 'sqlite'` → `'postgresql'`.
3. `lib/db/schema.ts`: column types are already plain scalars (text/integer/real/boolean/timestamp) with direct Postgres equivalents — no redesign needed, just re-declare the table helpers from `drizzle-orm/pg-core` instead of `sqlite-core`.
4. Regenerate migrations (`npm run db:generate`) against the new dialect and apply them.
5. Point `DATABASE_URL` at a real connection string.

## File storage

Uploaded files are currently written to a local directory (`UPLOAD_DIR`, default `./storage/uploads`) and read back from disk (`/api/documents/:id/file`, and the extraction pipeline itself). For a multi-instance deployment, this would need to move to an object store (S3-compatible) — `lib/security.ts`'s `safeStorageFilename()` and the `storagePath` column would still work the same way, just with a bucket key instead of a local path.

## Processing model

The pipeline currently runs synchronously inside the HTTP request that triggers it (upload, or a manual `/process` call) — there's no queue or worker. This is fine for a single demo document at a time; it would not hold up under concurrent uploads with a slow real-LLM provider (the request would just take as long as the LLM call does). Moving to background processing would mean: upload writes the file and returns immediately with `status: UPLOADED`, a worker picks it up and calls the same `processDocument()` function, and the frontend polls `/api/documents/:id/status` (which already exists) instead of getting the final result back from the upload call.

## AI provider costs

`AI_PROVIDER=mock` (the default) makes zero external calls. Switching to `openai` or `anthropic` means every document upload makes one real API call (the extraction prompt covers classification + extraction + analysis together, specifically to keep this to one call per document rather than three). Budget accordingly if enabling a real provider for a live demo.

## What was not tested

Nothing above (Postgres, object storage, background workers, a real reverse-proxy/TLS setup) has been deployed or tested as part of this build — this document describes the migration path, not a verified deployment.
