import { eq } from 'drizzle-orm';
import { db } from '../db/client';
import { documents, invoices, invoiceLineItems, validationResults, processingRuns, aiAnalyses } from '../db/schema';
import { config } from '../config';
import { DocumentExtractor } from './extraction';
import { getAIProvider } from './aiProvider';
import { ValidationEngine, overallValidationStatus } from './validation';

const extractor = new DocumentExtractor();
const validationEngine = new ValidationEngine();

type ProcessingStage =
  | 'UPLOAD'
  | 'EXTRACTION'
  | 'CLASSIFICATION'
  | 'STRUCTURED_EXTRACTION'
  | 'VALIDATION'
  | 'AI_ANALYSIS'
  | 'REVIEW'
  | 'COMPLETED';
type ProcessingStatus = 'STARTED' | 'SUCCEEDED' | 'FAILED' | 'SKIPPED';

/**
 * Wraps a single pipeline stage: records a ProcessingRun row before and
 * after, times it, and captures the error message on failure without
 * throwing out of the pipeline runner (so later stages / the caller decide
 * what to do next). This is what makes the per-document processing log
 * (spec section 15) real data instead of a UI mock.
 */
async function runStage<T>(
  documentId: string,
  stage: ProcessingStage,
  fn: () => Promise<T>
): Promise<{ ok: true; value: T } | { ok: false; error: string }> {
  const [run] = await db
    .insert(processingRuns)
    .values({ documentId, stage, status: 'STARTED' as ProcessingStatus })
    .returning();
  const startedAt = Date.now();
  try {
    const value = await fn();
    await db
      .update(processingRuns)
      .set({ status: 'SUCCEEDED', completedAt: new Date(), durationMs: Date.now() - startedAt })
      .where(eq(processingRuns.id, run.id));
    return { ok: true, value };
  } catch (err: any) {
    const message = err?.message || String(err);
    await db
      .update(processingRuns)
      .set({
        status: 'FAILED',
        completedAt: new Date(),
        durationMs: Date.now() - startedAt,
        errorMessage: message,
      })
      .where(eq(processingRuns.id, run.id));
    return { ok: false, error: message };
  }
}

async function getDocumentOrThrow(documentId: string) {
  const doc = await db.query.documents.findFirst({ where: eq(documents.id, documentId) });
  if (!doc) throw new Error(`Document ${documentId} not found.`);
  return doc;
}

async function updateDocument(documentId: string, data: Partial<typeof documents.$inferInsert>) {
  await db
    .update(documents)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(documents.id, documentId));
}

/**
 * Runs the full pipeline for a single document, end to end:
 * Extraction -> Classification -> Structured Extraction -> Validation ->
 * AI Analysis -> Confidence Scoring -> (Review Queue | Completed).
 *
 * Every stage is fault-isolated via runStage: a failure sets the document
 * to FAILED with a reason and stops, rather than throwing and losing the
 * partial progress already recorded.
 */
export async function processDocument(documentId: string): Promise<void> {
  const doc = await getDocumentOrThrow(documentId);
  const provider = getAIProvider();

  await updateDocument(documentId, { status: 'PROCESSING' });

  // --- Extraction ---------------------------------------------------------
  await updateDocument(documentId, { status: 'EXTRACTING' });
  const extraction = await runStage(documentId, 'EXTRACTION', () =>
    extractor.extract(doc.storagePath, doc.fileType)
  );
  if (!extraction.ok) {
    await failDocument(documentId, `Extraction failed: ${extraction.error}`);
    return;
  }
  await updateDocument(documentId, {
    extractedText: extraction.value.text,
    pageCount: extraction.value.pageCount,
    extractionMethod: extraction.value.method,
    extractionConfidence: extraction.value.confidence,
    extractedAt: new Date(),
  });

  if (!extraction.value.text || extraction.value.text.trim().length === 0) {
    await failDocument(documentId, 'No text could be extracted from the document.');
    return;
  }

  // --- Classification ------------------------------------------------------
  await updateDocument(documentId, { status: 'CLASSIFYING' });
  const classification = await runStage(documentId, 'CLASSIFICATION', () =>
    provider.classifyDocument(extraction.value.text)
  );
  if (!classification.ok) {
    await failDocument(documentId, `Classification failed: ${classification.error}`);
    return;
  }
  const docTypeEnum = classification.value.documentType.toUpperCase();
  await updateDocument(documentId, {
    documentType: docTypeEnum,
    classificationConfidence: classification.value.confidence,
  });

  // Only the invoice workflow is fully implemented end-to-end (per spec:
  // "build the invoice workflow extremely well, don't over-engineer all
  // document types initially"). Anything else still gets extracted and
  // classified, but is marked complete without invoice-specific structured
  // extraction/validation.
  if (classification.value.documentType !== 'invoice') {
    const needsReview = classification.value.confidence < config.reviewConfidenceThreshold;
    await updateDocument(documentId, {
      status: needsReview ? 'NEEDS_REVIEW' : 'COMPLETED',
      needsReview,
      overallConfidence: classification.value.confidence,
    });
    await db.insert(processingRuns).values({
      documentId,
      stage: 'STRUCTURED_EXTRACTION',
      status: 'SKIPPED',
      completedAt: new Date(),
    });
    return;
  }

  // --- Structured extraction ------------------------------------------------
  const structured = await runStage(documentId, 'STRUCTURED_EXTRACTION', () =>
    provider.extractInvoiceData(extraction.value.text)
  );
  if (!structured.ok) {
    await failDocument(documentId, `Structured extraction failed: ${structured.error}`);
    return;
  }
  const invoiceData = structured.value;

  const invoiceFields = {
    vendorName: invoiceData.vendorName.value,
    vendorAddress: invoiceData.vendorAddress.value,
    invoiceNumber: invoiceData.invoiceNumber.value,
    invoiceDate: invoiceData.invoiceDate.value,
    dueDate: invoiceData.dueDate.value,
    currency: invoiceData.currency.value,
    purchaseOrderNumber: invoiceData.purchaseOrderNumber.value,
    subtotal: invoiceData.subtotal.value,
    tax: invoiceData.tax.value,
    discount: invoiceData.discount.value,
    total: invoiceData.total.value,
    paymentTerms: invoiceData.paymentTerms.value,
  };
  const fieldConfidenceJson = JSON.stringify({
    vendorName: invoiceData.vendorName.confidence,
    invoiceNumber: invoiceData.invoiceNumber.confidence,
    invoiceDate: invoiceData.invoiceDate.confidence,
    dueDate: invoiceData.dueDate.confidence,
    currency: invoiceData.currency.confidence,
    purchaseOrderNumber: invoiceData.purchaseOrderNumber.confidence,
    subtotal: invoiceData.subtotal.confidence,
    tax: invoiceData.tax.confidence,
    discount: invoiceData.discount.confidence,
    total: invoiceData.total.confidence,
    paymentTerms: invoiceData.paymentTerms.confidence,
  });

  const existingInvoice = await db.query.invoices.findFirst({ where: eq(invoices.documentId, documentId) });

  let invoiceId: string;
  if (existingInvoice) {
    invoiceId = existingInvoice.id;
    await db
      .update(invoices)
      .set({ ...invoiceFields, fieldConfidenceJson, updatedAt: new Date() })
      .where(eq(invoices.id, invoiceId));
    await db.delete(invoiceLineItems).where(eq(invoiceLineItems.invoiceId, invoiceId));
  } else {
    const [created] = await db
      .insert(invoices)
      .values({ documentId, ...invoiceFields, fieldConfidenceJson })
      .returning();
    invoiceId = created.id;
  }

  if (invoiceData.lineItems.length > 0) {
    await db.insert(invoiceLineItems).values(
      invoiceData.lineItems.map((li) => ({
        invoiceId,
        description: li.description,
        quantity: li.quantity,
        unitPrice: li.unitPrice,
        amount: li.amount,
      }))
    );
  }

  // --- Validation ------------------------------------------------------------
  await updateDocument(documentId, { status: 'VALIDATING' });
  const validation = await runStage(documentId, 'VALIDATION', async () => {
    const ruleResults = validationEngine.validate(invoiceData);
    const dupResults = await validationEngine.checkDuplicates(invoiceData, documentId);
    return [...ruleResults, ...dupResults];
  });
  if (!validation.ok) {
    await failDocument(documentId, `Validation failed: ${validation.error}`);
    return;
  }

  await db.delete(validationResults).where(eq(validationResults.documentId, documentId));
  await db.insert(validationResults).values(
    validation.value.map((r) => ({
      documentId,
      rule: r.rule,
      status: r.status,
      message: r.message,
    }))
  );
  const validationStatus = overallValidationStatus(validation.value);

  // --- AI analysis -------------------------------------------------------------
  const analysis = await runStage(documentId, 'AI_ANALYSIS', () =>
    provider.analyzeDocument(extraction.value.text, invoiceData)
  );
  if (analysis.ok) {
    const existingAnalysis = await db.query.aiAnalyses.findFirst({ where: eq(aiAnalyses.documentId, documentId) });
    const analysisData = {
      summary: analysis.value.summary,
      keyObservationsJson: JSON.stringify(analysis.value.keyObservations),
      anomaliesJson: JSON.stringify(analysis.value.anomalies),
      provider: provider.name,
      model: provider.model,
    };
    if (existingAnalysis) {
      await db.update(aiAnalyses).set(analysisData).where(eq(aiAnalyses.documentId, documentId));
    } else {
      await db.insert(aiAnalyses).values({ documentId, ...analysisData });
    }
  }
  // AI analysis failing is non-fatal to the pipeline (it's an enrichment,
  // not a gate) -- the document can still be validated and reviewed without it.

  // --- Confidence scoring / routing --------------------------------------------
  const overallConfidence = Math.min(classification.value.confidence, invoiceData.overallConfidence);
  const lowConfidenceField = [
    invoiceData.vendorName.confidence,
    invoiceData.invoiceNumber.confidence,
    invoiceData.invoiceDate.confidence,
    invoiceData.total.confidence,
  ].some((c) => c > 0 && c < config.reviewConfidenceThreshold);

  const needsReview =
    overallConfidence < config.reviewConfidenceThreshold ||
    validationStatus !== 'PASSED' ||
    lowConfidenceField;

  await updateDocument(documentId, {
    overallConfidence,
    needsReview,
    status: needsReview ? 'NEEDS_REVIEW' : 'COMPLETED',
  });

  await db.insert(processingRuns).values({
    documentId,
    stage: 'REVIEW',
    status: needsReview ? 'STARTED' : 'SKIPPED',
    completedAt: needsReview ? undefined : new Date(),
  });
}

async function failDocument(documentId: string, reason: string): Promise<void> {
  await updateDocument(documentId, { status: 'FAILED', failureReason: reason });
}
