# Security

Scope: this documents what is actually implemented and tested. It is not a claim that this application is production-hardened — see the README's Limitations.

## Upload validation (`lib/security.ts` → `validateUpload`)

- Extension allow-list: `.pdf`, `.png`, `.jpg`, `.jpeg` — anything else is rejected (`422 FILE_VALIDATION_ERROR`) before the file touches disk.
- MIME-type check against the same allow-list (declared `type` on the multipart part).
- Size limit (`MAX_UPLOAD_SIZE_MB`, default 15MB) and empty-file rejection.
- Tested: `.exe` upload rejected; 20MB PDF (over the 15MB default) rejected. Both confirmed via direct HTTP requests to a running server, not just unit tests.

## Filename handling (`lib/security.ts` → `safeStorageFilename`)

The client-supplied filename is never used directly as a storage path. Every upload gets a generated name: `${timestamp}-${randomHex}-${sanitizedBase}${validatedExtension}`.

**A real vulnerability was found and fixed here.** The original implementation derived the extension with `path.extname()` and sanitized everything *except* that extension. On Linux, `path.extname()` does not treat `\` as a separator — for an input like `..\..\windows\system32\config.pdf`, `path.extname()` doesn't cleanly return `.pdf`; for inputs without a recognizable trailing extension, it can return an unbounded suffix containing the traversal sequence, which was then concatenated onto the final filename unsanitized.

Fix: the extension is now validated against `config.allowedExtensions` (the same list used for upload validation) before being trusted at all; if it's not on the list (or implausibly long), it's dropped rather than reused. The base name is still passed through the character allow-list (`[a-zA-Z0-9-_]`, everything else replaced with `_`) as before, with an explicit extra pass replacing `/` and `\` first.

**Regression test performed** against the rebuilt, restarted server (not just unit tests) with 7 cases: Unix traversal (`../../../etc/passwd.pdf`), Windows-style backslash traversal, mixed `/`/`\` separators, doubled separators, an unusually long extension-like suffix, a literal `%2e%2e%2f`-containing filename, and a backslash-traversal filename with no valid extension at all (correctly rejected outright with `422`, since it has no allowed extension — no file was written for that case). All 7 resolved safely: either the stored path stayed inside `storage/uploads/` with no `..` component, or the upload was rejected before any file was written. `/etc/passwd` was independently confirmed untouched (checksum compared before/after).

## Untrusted content handling

- Extracted document text (from either `pdftotext` or Tesseract OCR) is treated as data, never as instructions. `neutralizeForPrompt()` wraps it in an explicit `<untrusted_document_content>` boundary before any real AI provider would include it in a prompt.
- AI-generated anomalies are explicitly tagged `isFactual: true`/`false` so the UI never presents an AI's interpretation as an established fact.

## API input validation

Every route that accepts a body validates it with Zod (`lib/apiHelpers.ts`) before touching the database:

- Malformed JSON → `400 INVALID_JSON`.
- Missing/wrong-typed fields → `422 VALIDATION_ERROR` with the specific field and reason.
- An invalid `action` value on `/review` → `422`, listing the valid options.
- `PATCH /fields` only accepts a fixed allow-list of invoice column names (`INVOICE_EDITABLE_FIELDS`) — an attempt to set `storagePath` (an internal field, not user data) was tested directly and correctly rejected with `422 UNKNOWN_FIELD`.

## Secrets

- `.env` is git-ignored (confirmed in `.gitignore` and in `git status` output during this build — it never appears as untracked/staged).
- `.env.example` contains empty-string placeholders only (`OPENAI_API_KEY=""`, etc.), no real keys.
- No API route echoes back an API key, database path, or other secret in its response.

## Explicitly not implemented

- No authentication or authorization on any route.
- No rate limiting.
- No malware/virus scanning of uploaded files (only type/extension/size checks).
- No CSRF protection (there's no session/cookie-based auth to protect against CSRF in the first place, but this would need addressing before adding one).
