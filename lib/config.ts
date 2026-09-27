// Centralized configuration. Every tunable the spec calls out as
// "must be configurable, not hard-coded" is read from the environment here,
// and nowhere else in the codebase.

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const config = {
  aiProvider: (process.env.AI_PROVIDER || 'mock').toLowerCase() as
    | 'mock'
    | 'openai'
    | 'anthropic',
  aiModel: process.env.AI_MODEL || 'gpt-4o-mini',
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',

  // Single source of truth for the human-review threshold. Anything below
  // this confidence (document classification OR any individual field)
  // is routed to the Review Queue.
  reviewConfidenceThreshold: num('REVIEW_CONFIDENCE_THRESHOLD', 0.85),

  // Absolute currency tolerance for subtotal + tax - discount = total,
  // and quantity * unitPrice = amount.
  validationAmountTolerance: num('VALIDATION_AMOUNT_TOLERANCE', 0.02),

  maxUploadSizeBytes: num('MAX_UPLOAD_SIZE_MB', 15) * 1024 * 1024,
  uploadDir: process.env.UPLOAD_DIR || './storage/uploads',

  tesseractBin: process.env.TESSERACT_BIN || 'tesseract',
  pdftoppmBin: process.env.PDFTOPPM_BIN || 'pdftoppm',
  pdftotextBin: process.env.PDFTOTEXT_BIN || 'pdftotext',

  allowedMimeTypes: ['application/pdf', 'image/png', 'image/jpeg'],
  allowedExtensions: ['.pdf', '.png', '.jpg', '.jpeg'],
};
