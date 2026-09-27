# Architecture

## Layers

```text
app/                  Next.js App Router: pages (React) + API routes
  page.tsx, upload/, documents/, review/     -- frontend
  api/documents/*, api/review-queue, api/stats  -- backend, same process
lib/
  services/
    extraction.ts     -- PdfTextExtractor, OCRExtractor, DocumentExtractor
    aiProvider.ts      -- AIProvider interface, MockAIProvider, OpenAI/Anthropic adapters
    validation.ts      -- ValidationEngine (no AI involved)
    pipeline.ts         -- orchestrates all stages, logs a ProcessingRun per stage
    exportService.ts    -- JSON/CSV shaping
  db/
    schema.ts           -- Drizzle schema (the real runtime schema)
    client.ts           -- better-sqlite3 connection + Drizzle instance
  security.ts           -- filename sanitization, upload validation, prompt-injection defense
  config.ts             -- every tunable threshold/path, read from env, nowhere else
```

Next.js runs the frontend and the API in one process — there's no separate backend service. Route handlers under `app/api/**/route.ts` call directly into `lib/services/*`, which call `lib/db/client.ts`. There is no queue or worker: `processDocument()` runs synchronously inside the request that triggers it (the upload request, or a manual `/process` call).

## Pipeline stages (`lib/services/pipeline.ts`)

`processDocument(documentId)` runs, in order:

1. **Extraction** — `DocumentExtractor.extract()`: tries `PdfTextExtractor` first for PDFs; if the resulting text is too short (heuristic: confidence < 0.5, itself derived from `text.length > 40`), falls back to `OCRExtractor` (rasterize with `pdftoppm`, OCR each page with Tesseract). Images go straight to OCR.
2. **Classification** — `AIProvider.classifyDocument()`. Non-invoice documents stop here (marked complete or needing review based on classification confidence alone); only `invoice` continues.
3. **Structured extraction** — `AIProvider.extractInvoiceData()`, saved to the `invoices` + `invoice_line_items` tables (upsert, so re-processing a document updates rather than duplicates).
4. **Validation** — `ValidationEngine.validate()` (pure rules) + `checkDuplicates()` (the one rule that needs the database, to check for a prior invoice with the same number + vendor).
5. **AI analysis** — `AiProvider.analyzeDocument()`: summary, key observations, anomalies. Non-fatal if it fails (an analysis failure doesn't block the document from being validated/reviewed).
6. **Confidence scoring / routing** — the document's `overallConfidence` is the minimum of classification confidence and structured-extraction confidence; the document is routed to `NEEDS_REVIEW` if that's below `REVIEW_CONFIDENCE_THRESHOLD`, if any core field's confidence is below threshold, or if validation didn't fully pass. Otherwise `COMPLETED`.

Every stage is wrapped in `runStage()`, which records a `processing_runs` row (stage, status, start/end time, duration, error message on failure) regardless of success or failure — this is what backs the processing log shown in the UI and returned by `/api/documents/:id/status`.

## Extraction confidence heuristics

- `PdfTextExtractor`: confidence `0.98` if the extracted text is over 40 characters, else `0.1` (signals "probably a scan, fall back to OCR").
- `OCRExtractor`: confidence is derived from the ratio of alphanumeric characters to total characters in the OCR output, clamped to `[0.4, 0.95]` — a crude but real signal of OCR quality without a second pass or per-word confidence data.

## Why processing is synchronous

For a portfolio-scale demo (single documents, mock provider by default), running the pipeline inline in the upload request is simpler and easier to test/debug than a queue, and every stage's timing is still recorded individually. For real production volume, or a slow real-LLM provider, this would need to move to a background job (e.g. `/api/documents/:id/process` already exists as an endpoint separate from upload — it would be extended to be invoked by a worker instead of on-demand).
