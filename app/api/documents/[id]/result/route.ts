import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { documents } from '@/lib/db/schema';
import { ok, fail } from '@/lib/apiHelpers';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const doc = await db.query.documents.findFirst({
    where: eq(documents.id, params.id),
    with: {
      invoice: { with: { lineItems: true } },
      aiAnalysis: true,
    },
  });

  if (!doc) return fail('Document not found.', 404, 'NOT_FOUND');

  const fieldConfidence = doc.invoice?.fieldConfidenceJson
    ? JSON.parse(doc.invoice.fieldConfidenceJson)
    : null;

  return ok({
    documentId: doc.id,
    status: doc.status,
    documentType: doc.documentType,
    classificationConfidence: doc.classificationConfidence,
    overallConfidence: doc.overallConfidence,
    needsReview: doc.needsReview,
    invoice: doc.invoice
      ? {
          vendorName: doc.invoice.vendorName,
          vendorAddress: doc.invoice.vendorAddress,
          invoiceNumber: doc.invoice.invoiceNumber,
          invoiceDate: doc.invoice.invoiceDate,
          dueDate: doc.invoice.dueDate,
          currency: doc.invoice.currency,
          purchaseOrderNumber: doc.invoice.purchaseOrderNumber,
          subtotal: doc.invoice.subtotal,
          tax: doc.invoice.tax,
          discount: doc.invoice.discount,
          total: doc.invoice.total,
          paymentTerms: doc.invoice.paymentTerms,
          lineItems: doc.invoice.lineItems,
          fieldConfidence,
        }
      : null,
    aiAnalysis: doc.aiAnalysis
      ? {
          summary: doc.aiAnalysis.summary,
          keyObservations: JSON.parse(doc.aiAnalysis.keyObservationsJson),
          anomalies: JSON.parse(doc.aiAnalysis.anomaliesJson),
          provider: doc.aiAnalysis.provider,
          model: doc.aiAnalysis.model,
        }
      : null,
  });
}
