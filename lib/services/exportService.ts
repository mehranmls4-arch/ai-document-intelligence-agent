import type { DocumentRow, InvoiceRow, InvoiceLineItemRow, ValidationResultRow, ReviewActionRow, AiAnalysisRow } from '../db/schema';

type DocumentWithRelations = DocumentRow & {
  invoice: (InvoiceRow & { lineItems: InvoiceLineItemRow[] }) | null | undefined;
  validationResults: ValidationResultRow[];
  aiAnalysis: AiAnalysisRow | null | undefined;
  reviewActions: ReviewActionRow[];
};

export function toExportJson(doc: DocumentWithRelations) {
  return {
    document: {
      id: doc.id,
      filename: doc.originalFilename,
      fileType: doc.fileType,
      fileSizeBytes: doc.fileSizeBytes,
      status: doc.status,
      documentType: doc.documentType,
      classificationConfidence: doc.classificationConfidence,
      overallConfidence: doc.overallConfidence,
      needsReview: doc.needsReview,
      pageCount: doc.pageCount,
      extractionMethod: doc.extractionMethod,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    },
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
          fieldConfidence: doc.invoice.fieldConfidenceJson
            ? JSON.parse(doc.invoice.fieldConfidenceJson)
            : null,
          lineItems: doc.invoice.lineItems.map((li) => ({
            description: li.description,
            quantity: li.quantity,
            unitPrice: li.unitPrice,
            amount: li.amount,
          })),
        }
      : null,
    validation: doc.validationResults.map((v) => ({
      rule: v.rule,
      status: v.status,
      message: v.message,
    })),
    aiAnalysis: doc.aiAnalysis
      ? {
          summary: doc.aiAnalysis.summary,
          keyObservations: JSON.parse(doc.aiAnalysis.keyObservationsJson),
          anomalies: JSON.parse(doc.aiAnalysis.anomaliesJson),
          provider: doc.aiAnalysis.provider,
          model: doc.aiAnalysis.model,
        }
      : null,
    reviewHistory: doc.reviewActions.map((r) => ({
      fieldName: r.fieldName,
      originalValue: r.originalValue,
      correctedValue: r.correctedValue,
      action: r.action,
      reviewer: r.reviewer,
      createdAt: r.createdAt,
    })),
  };
}

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

export function toExportCsv(doc: DocumentWithRelations): string {
  const headers = [
    'document_id',
    'filename',
    'status',
    'document_type',
    'overall_confidence',
    'vendor_name',
    'invoice_number',
    'invoice_date',
    'due_date',
    'currency',
    'subtotal',
    'tax',
    'discount',
    'total',
    'line_item_description',
    'line_item_quantity',
    'line_item_unit_price',
    'line_item_amount',
  ];

  const baseRow = [
    doc.id,
    doc.originalFilename,
    doc.status,
    doc.documentType,
    doc.overallConfidence ?? '',
    doc.invoice?.vendorName ?? '',
    doc.invoice?.invoiceNumber ?? '',
    doc.invoice?.invoiceDate ?? '',
    doc.invoice?.dueDate ?? '',
    doc.invoice?.currency ?? '',
    doc.invoice?.subtotal ?? '',
    doc.invoice?.tax ?? '',
    doc.invoice?.discount ?? '',
    doc.invoice?.total ?? '',
  ];

  const lineItems = doc.invoice?.lineItems ?? [];
  const rows =
    lineItems.length > 0
      ? lineItems.map((li) => [...baseRow, li.description, li.quantity, li.unitPrice, li.amount])
      : [[...baseRow, '', '', '', '']];

  const lines = [headers.join(','), ...rows.map((r) => r.map(csvEscape).join(','))];
  return lines.join('\n');
}
