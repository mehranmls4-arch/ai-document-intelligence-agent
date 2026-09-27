# API Reference

Base URL: `http://localhost:3000` (dev) or wherever the app is deployed. All responses are JSON:

```json
{ "success": true, "data": { ... } }
{ "success": false, "error": { "message": "...", "code": "SOME_CODE" } }
```

## POST /api/documents/upload

`multipart/form-data` with a `file` field (PDF/PNG/JPG, ≤`MAX_UPLOAD_SIZE_MB`). Runs the full pipeline synchronously and returns the resulting document row (status will be `COMPLETED`, `NEEDS_REVIEW`, or `FAILED`).

- `201` — created and processed (check `status`/`failureReason` in the body either way; a `201` means the *upload* succeeded, not necessarily that processing finished cleanly)
- `422` — file validation failed (`FILE_VALIDATION_ERROR`: bad extension, bad MIME type, empty, or over size limit)
- `400` — no `file` field in the form data

## GET /api/documents

Query params: `status`, `documentType` (exact match), `limit` (default 50, max 200), `offset`. Returns `{ documents: [...], total, limit, offset }`, each document including its `invoice` relation.

## GET /api/documents/:id

Full detail: `invoice` (with `lineItems`), `validationResults`, `aiAnalysis`, `reviewActions` (newest first), `processingRuns` (chronological). `404` if the ID doesn't exist.

## POST /api/documents/:id/process

No body. Re-runs the pipeline from the top for this document (used for retries after a `FAILED` status, or after `SEND_BACK` during review). `404` if not found; `500` with `PROCESSING_FAILED` if the re-run itself throws (the document is marked `FAILED` with the error as `failureReason` either way).

## GET /api/documents/:id/status

Lightweight polling shape: `{ id, status, needsReview, failureReason, documentType, overallConfidence, updatedAt, processingRuns: [{ stage, status, durationMs, errorMessage }] }`.

## GET /api/documents/:id/result

`{ documentId, status, documentType, classificationConfidence, overallConfidence, needsReview, invoice, aiAnalysis }` — the structured-data-only view, no raw extracted text or processing log.

## GET /api/documents/:id/validation

`{ documentId, summary: { passed, warnings, failed }, results: [{ rule, status, message }] }`.

## POST /api/documents/:id/review

Body: `{ "action": "APPROVE" | "REJECT" | "SEND_BACK", "reviewer"?: string, "notes"?: string }`.

- `APPROVE` → status becomes `COMPLETED`
- `REJECT` → status becomes `FAILED`, `failureReason` set from `notes` (or a default message)
- `SEND_BACK` → re-runs the full pipeline (see `/process`); useful after a field correction, so validation re-checks the corrected data

Every call also writes a `review_actions` row. `422` (`VALIDATION_ERROR`) for an invalid/missing `action`.

## PATCH /api/documents/:id/fields

Body: `{ "fields": { "<field>": value, ... }, "reviewer"?: string }`. Only a fixed allow-list of invoice fields can be set this way (`vendorName`, `vendorAddress`, `invoiceNumber`, `invoiceDate`, `dueDate`, `currency`, `purchaseOrderNumber`, `subtotal`, `tax`, `discount`, `total`, `paymentTerms`) — anything else returns `422` (`UNKNOWN_FIELD`). Every field change writes a `review_actions` row with the original and corrected value. `409` (`NO_INVOICE_DATA`) if the document has no invoice row to edit (e.g. it wasn't classified as an invoice).

## GET /api/review-queue

`{ documents: [...], total }` — every document with `status = NEEDS_REVIEW`, oldest-waiting first, including its invoice and any non-passed validation results.

## GET /api/documents/:id/export?format=json|csv

`json` (default): full export shape — document metadata, invoice + field confidence + line items, validation results, AI analysis, review history. `csv`: one row per line item (or one row with blank line-item columns if there are none), invoice fields repeated per row. Both are returned as `attachment` downloads.

## GET /api/documents/:id/file

Streams the original uploaded file bytes with its real content type, `Content-Disposition: inline` (for the in-app `<iframe>`/`<img>` viewer, not a forced download).

## GET /api/stats

`{ totalDocuments, completed, needsReview, failed, avgProcessingTimeMs, recentDocuments }`. `avgProcessingTimeMs` is computed from `processing_runs` (earliest stage start to latest stage completion per document, averaged across documents with at least one completed stage).

## Notes on what's *not* here

There's no authentication on any of these routes, and no per-user scoping — see the README's Limitations section. `reviewer` is whatever string the client sends.
