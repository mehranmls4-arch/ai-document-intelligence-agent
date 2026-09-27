import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';
import { relations, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// NOTE ON ORM CHOICE
//
// This project was originally written against Prisma (prisma/schema.prisma
// is kept in the repo as the canonical, human-readable data model / ERD).
// At verification time, `prisma generate`/`validate`/`db push` all failed
// in this sandboxed build environment because Prisma's CLI and default
// query engine require downloading a native binary from
// binaries.prisma.sh, and that host is not on this environment's network
// allow-list (confirmed: connection refused with "host_not_allowed").
//
// Rather than leave the database layer unverified, the runtime data layer
// was rewritten against Drizzle ORM + better-sqlite3 -- both pure
// npm-distributed packages (better-sqlite3's native addon is compiled
// locally at install time with node-gyp, no external binary fetch). This
// mirrors the schema 1:1. See docs/database.md for the full explanation
// and for how to switch to Postgres in production.
// ---------------------------------------------------------------------------

export const documents = sqliteTable('documents', {
  id: text('id').primaryKey().$defaultFn(() => randomUUID()),
  filename: text('filename').notNull(),
  originalFilename: text('original_filename').notNull(),
  fileType: text('file_type').notNull(),
  fileSizeBytes: integer('file_size_bytes').notNull(),
  storagePath: text('storage_path').notNull(),

  documentType: text('document_type').notNull().default('UNKNOWN'),
  classificationConfidence: real('classification_confidence'),

  status: text('status').notNull().default('UPLOADED'),
  failureReason: text('failure_reason'),

  extractedText: text('extracted_text'),
  pageCount: integer('page_count'),
  extractionMethod: text('extraction_method'),
  extractionConfidence: real('extraction_confidence'),
  extractedAt: integer('extracted_at', { mode: 'timestamp_ms' }),

  overallConfidence: real('overall_confidence'),
  needsReview: integer('needs_review', { mode: 'boolean' }).notNull().default(false),

  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const invoices = sqliteTable('invoices', {
  id: text('id').primaryKey().$defaultFn(() => randomUUID()),
  documentId: text('document_id')
    .notNull()
    .unique()
    .references(() => documents.id, { onDelete: 'cascade' }),

  vendorName: text('vendor_name'),
  vendorAddress: text('vendor_address'),
  invoiceNumber: text('invoice_number'),
  invoiceDate: text('invoice_date'),
  dueDate: text('due_date'),
  currency: text('currency'),
  purchaseOrderNumber: text('purchase_order_number'),

  subtotal: real('subtotal'),
  tax: real('tax'),
  discount: real('discount'),
  total: real('total'),
  paymentTerms: text('payment_terms'),

  fieldConfidenceJson: text('field_confidence_json'),

  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const invoiceLineItems = sqliteTable('invoice_line_items', {
  id: text('id').primaryKey().$defaultFn(() => randomUUID()),
  invoiceId: text('invoice_id')
    .notNull()
    .references(() => invoices.id, { onDelete: 'cascade' }),

  description: text('description').notNull(),
  quantity: real('quantity').notNull(),
  unitPrice: real('unit_price').notNull(),
  amount: real('amount').notNull(),
});

export const validationResults = sqliteTable('validation_results', {
  id: text('id').primaryKey().$defaultFn(() => randomUUID()),
  documentId: text('document_id')
    .notNull()
    .references(() => documents.id, { onDelete: 'cascade' }),

  rule: text('rule').notNull(),
  status: text('status').notNull(), // PASSED | WARNING | FAILED
  message: text('message').notNull(),

  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const reviewActions = sqliteTable('review_actions', {
  id: text('id').primaryKey().$defaultFn(() => randomUUID()),
  documentId: text('document_id')
    .notNull()
    .references(() => documents.id, { onDelete: 'cascade' }),

  fieldName: text('field_name'),
  originalValue: text('original_value'),
  correctedValue: text('corrected_value'),
  action: text('action').notNull(), // FIELD_CORRECTION | APPROVE | REJECT | SEND_BACK
  reviewer: text('reviewer').notNull().default('demo-reviewer'),
  notes: text('notes'),

  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const processingRuns = sqliteTable('processing_runs', {
  id: text('id').primaryKey().$defaultFn(() => randomUUID()),
  documentId: text('document_id')
    .notNull()
    .references(() => documents.id, { onDelete: 'cascade' }),

  stage: text('stage').notNull(),
  status: text('status').notNull(), // STARTED | SUCCEEDED | FAILED | SKIPPED
  startedAt: integer('started_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
  completedAt: integer('completed_at', { mode: 'timestamp_ms' }),
  durationMs: integer('duration_ms'),
  errorMessage: text('error_message'),
});

export const aiAnalyses = sqliteTable('ai_analyses', {
  id: text('id').primaryKey().$defaultFn(() => randomUUID()),
  documentId: text('document_id').notNull().unique().references(() => documents.id, { onDelete: 'cascade' }),

  summary: text('summary').notNull(),
  keyObservationsJson: text('key_observations_json').notNull(),
  anomaliesJson: text('anomalies_json').notNull(),
  provider: text('provider').notNull(),
  model: text('model').notNull(),

  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
});

// --------------------------------------------------------------- relations

export const documentsRelations = relations(documents, ({ one, many }) => ({
  invoice: one(invoices, { fields: [documents.id], references: [invoices.documentId] }),
  validationResults: many(validationResults),
  reviewActions: many(reviewActions),
  processingRuns: many(processingRuns),
  aiAnalysis: one(aiAnalyses, { fields: [documents.id], references: [aiAnalyses.documentId] }),
}));

export const invoicesRelations = relations(invoices, ({ one, many }) => ({
  document: one(documents, { fields: [invoices.documentId], references: [documents.id] }),
  lineItems: many(invoiceLineItems),
}));

export const invoiceLineItemsRelations = relations(invoiceLineItems, ({ one }) => ({
  invoice: one(invoices, { fields: [invoiceLineItems.invoiceId], references: [invoices.id] }),
}));

export const validationResultsRelations = relations(validationResults, ({ one }) => ({
  document: one(documents, { fields: [validationResults.documentId], references: [documents.id] }),
}));

export const reviewActionsRelations = relations(reviewActions, ({ one }) => ({
  document: one(documents, { fields: [reviewActions.documentId], references: [documents.id] }),
}));

export const processingRunsRelations = relations(processingRuns, ({ one }) => ({
  document: one(documents, { fields: [processingRuns.documentId], references: [documents.id] }),
}));

export const aiAnalysesRelations = relations(aiAnalyses, ({ one }) => ({
  document: one(documents, { fields: [aiAnalyses.documentId], references: [documents.id] }),
}));

export type DocumentRow = typeof documents.$inferSelect;
export type InvoiceRow = typeof invoices.$inferSelect;
export type InvoiceLineItemRow = typeof invoiceLineItems.$inferSelect;
export type ValidationResultRow = typeof validationResults.$inferSelect;
export type ReviewActionRow = typeof reviewActions.$inferSelect;
export type ProcessingRunRow = typeof processingRuns.$inferSelect;
export type AiAnalysisRow = typeof aiAnalyses.$inferSelect;
