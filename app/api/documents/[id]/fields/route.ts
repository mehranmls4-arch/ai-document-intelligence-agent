import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { documents, invoices, reviewActions } from '@/lib/db/schema';
import {
  ok,
  fail,
  parseJsonBody,
  fieldUpdateSchema,
  INVOICE_EDITABLE_FIELDS,
  NUMERIC_INVOICE_FIELDS,
} from '@/lib/apiHelpers';

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const doc = await db.query.documents.findFirst({
    where: eq(documents.id, params.id),
    with: { invoice: true },
  });
  if (!doc) return fail('Document not found.', 404, 'NOT_FOUND');
  if (!doc.invoice) return fail('Document has no structured invoice data to edit.', 409, 'NO_INVOICE_DATA');

  const parsed = await parseJsonBody(req, fieldUpdateSchema);
  if (!parsed.ok) return parsed.response;
  const { fields, reviewer } = parsed.data;

  const unknownFields = Object.keys(fields).filter((f) => !INVOICE_EDITABLE_FIELDS.has(f));
  if (unknownFields.length > 0) {
    return fail(`Unknown/uneditable field(s): ${unknownFields.join(', ')}`, 422, 'UNKNOWN_FIELD');
  }

  const updateData: Record<string, string | number | null> = {};
  const auditEntries: { fieldName: string; originalValue: string | null; correctedValue: string | null }[] = [];

  for (const [fieldName, rawValue] of Object.entries(fields)) {
    const originalValue = (doc.invoice as any)[fieldName];
    let value: string | number | null = rawValue;

    if (NUMERIC_INVOICE_FIELDS.has(fieldName) && value !== null) {
      const num = typeof value === 'number' ? value : parseFloat(value);
      if (!Number.isFinite(num)) {
        return fail(`Field "${fieldName}" must be numeric.`, 422, 'INVALID_FIELD_TYPE');
      }
      value = num;
    }

    updateData[fieldName] = value;
    auditEntries.push({
      fieldName,
      originalValue: originalValue === null || originalValue === undefined ? null : String(originalValue),
      correctedValue: value === null ? null : String(value),
    });
  }

  await db.update(invoices).set({ ...updateData, updatedAt: new Date() }).where(eq(invoices.documentId, doc.id));
  await db.insert(reviewActions).values(
    auditEntries.map((entry) => ({
      documentId: doc.id,
      fieldName: entry.fieldName,
      originalValue: entry.originalValue,
      correctedValue: entry.correctedValue,
      action: 'FIELD_CORRECTION' as const,
      reviewer: reviewer || 'demo-reviewer',
    }))
  );

  const updated = await db.query.documents.findFirst({
    where: eq(documents.id, doc.id),
    with: {
      invoice: { with: { lineItems: true } },
      reviewActions: { orderBy: (t, { desc }) => [desc(t.createdAt)] },
    },
  });
  return ok(updated);
}
