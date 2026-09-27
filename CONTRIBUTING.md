# Contributing

This started as a portfolio project, but issues and PRs are welcome.

## Setup

```bash
sudo apt-get install -y tesseract-ocr poppler-utils   # system deps
npm install
cp .env.example .env
npm run db:migrate
npm run samples:generate
npm run dev
```

## Development

- Runtime database layer is Drizzle ORM (`lib/db/schema.ts`) + better-sqlite3. `prisma/schema.prisma` is a reference ERD only — do not add `@prisma/client` back as a runtime dependency; see the README's "Why Drizzle, not Prisma" section before changing the data layer.
- Keep `prisma/schema.prisma` and `lib/db/schema.ts` in sync by hand if you add/change a column.
- New pipeline stages should go through `runStage()` in `lib/services/pipeline.ts` so they show up in the processing log automatically.
- Validation rules belong in `lib/services/validation.ts` and must not call any AI provider — that's the point of the engine being deterministic.
- Don't hard-code the review confidence threshold or validation tolerance anywhere; add to `lib/config.ts` and read from `process.env` there.

## Testing

```bash
npx tsc --noEmit   # typecheck
npm test           # vitest unit tests
npm run build      # production build
```

Before opening a PR that touches the pipeline, extraction, or validation, run a real invoice through the app end to end (`npm run dev`, upload a sample from `/samples`) — the unit tests don't cover OCR/pdftotext/tesseract integration, since those depend on system binaries.

## Pull requests

- Keep PRs focused — one concern per PR.
- Include what you tested and how (unit tests, manual HTTP calls, screenshots for UI changes).
- If you change the database schema, include the generated Drizzle migration (`npm run db:generate`) in the PR, not just the schema file.

## Security

If you find a security issue (a path traversal, an injection vector, an auth bypass), please open an issue describing it rather than a PR with an exploit — this project has no dedicated security contact, so use GitHub's private vulnerability reporting on the repository if that's enabled, otherwise a regular issue is fine given this is a demo project with no production deployment.
