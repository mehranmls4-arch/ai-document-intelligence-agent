# AI Pipeline

## Provider abstraction

```ts
interface AIProvider {
  readonly name: string;
  readonly model: string;
  classifyDocument(text: string): Promise<ClassificationResult>;
  extractInvoiceData(text: string): Promise<ExtractedInvoice>;
  analyzeDocument(text: string, invoice: ExtractedInvoice): Promise<AiAnalysisResult>;
}
```

`getAIProvider()` (`lib/services/aiProvider.ts`) reads `AI_PROVIDER` from config and returns one of three implementations. Nothing else in the codebase imports a concrete provider class directly — the pipeline only ever talks to the `AIProvider` interface.

## MockAIProvider — verified, zero-cost

The default (`AI_PROVIDER=mock`). Deterministic and offline:

- **Classification** — keyword/regex scoring against the extracted text (e.g. `\binvoice\b` +3, `\bbill to\b` +2, `\bdue date\b` +1 → `invoice`), converted to a bounded confidence, capped below `0.97` (a keyword match is never certainty).
- **Extraction** — regex patterns per field (`invoice\s*(?:number|no\.?|#)\s*[:\-]?\s*([A-Za-z0-9\-\/]+)` for the invoice number, similar for dates/currency/PO/amounts), plus a line-item parser that looks for `<description>  <qty>  <unit price>  <amount>` shaped lines. Missing fields get `value: null, confidence: 0` — never a fabricated value.
- **Analysis** — a templated summary (`Invoice from {vendor} for {total} covering {n} line items`), key observations from what was/wasn't found, and anomaly detection: large-total flag, missing-PO flag, due-before-invoice flag, and re-checking line-item math (the same check the validation engine does, surfaced here as an AI-analysis-level anomaly too, each tagged `isFactual: true`).

This is a real heuristic engine, not a stub — it's what every documented test result in the README's Testing table actually ran against. It is *not* a language model, and won't generalize to invoice layouts wildly different from the synthetic samples in `/samples` the way a real LLM would.

## OpenAIProvider / AnthropicProvider — implemented, not runtime-verified

Both extend `RealAIProvider`, which sends one structured-JSON-extraction prompt per document (covering classification + extraction + analysis in a single call to minimize cost) and caches the parsed response so a single document doesn't trigger three separate paid calls.

- `OpenAIProvider`: `POST https://api.openai.com/v1/chat/completions`, Bearer auth, reads `choices[0].message.content`.
- `AnthropicProvider`: `POST https://api.anthropic.com/v1/messages`, `x-api-key` + `anthropic-version` headers, reads the first `type: "text"` block from `content`.

Both strip markdown code fences from the response before `JSON.parse`, and throw a clear error if the result isn't valid JSON (surfaced through the normal pipeline failure path — the document gets marked `FAILED` with that message, not a silent bad result).

**What's actually been checked:** these compile and typecheck cleanly (`npx tsc --noEmit` passes with them included), `getAIProvider()` fails fast with a clear error message if you select `openai`/`anthropic` without setting the corresponding API key (verified — see below), and the request/response shapes match each vendor's documented API as of this project's build date. **What has not been checked:** an actual successful call to either API — no credentials were available in the build environment, and none were purchased/used to avoid spending money purely for verification theater.

```text
$ AI_PROVIDER=openai OPENAI_API_KEY= npx tsx scripts/test-provider-selection.ts
AI_PROVIDER=openai -> correctly throws: AI_PROVIDER=openai but OPENAI_API_KEY is not set.

$ AI_PROVIDER=anthropic ANTHROPIC_API_KEY= npx tsx scripts/test-provider-selection.ts
AI_PROVIDER=anthropic -> correctly throws: AI_PROVIDER=anthropic but ANTHROPIC_API_KEY is not set.
```

## Untrusted input handling

Every provider's extraction prompt wraps the document's extracted text in `neutralizeForPrompt()` (`lib/security.ts`) before it's sent anywhere — an explicit `<untrusted_document_content>` tag pair with a one-line reminder that the content is data, not instructions. This runs even for the mock provider (which doesn't build a real prompt), to keep the same contract that any future provider implementation has to honor.
