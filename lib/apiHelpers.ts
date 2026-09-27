import { NextResponse } from 'next/server';
import { z } from 'zod';

/** Consistent success envelope used by every API route. */
export function ok<T>(data: T, status = 200) {
  return NextResponse.json({ success: true, data }, { status });
}

/** Consistent error envelope. Never leaks stack traces to the client. */
export function fail(message: string, status = 400, code?: string) {
  logError(status, message, code);
  return NextResponse.json({ success: false, error: { message, code: code ?? null } }, { status });
}

function logError(status: number, message: string, code?: string) {
  // Minimal structured logging -- swap for a real logger (pino/winston) in
  // production. Kept dependency-free for the demo.
  const entry = { level: status >= 500 ? 'error' : 'warn', status, code, message, ts: new Date().toISOString() };
  // eslint-disable-next-line no-console
  console.error(JSON.stringify(entry));
}

export async function parseJsonBody<T extends z.ZodTypeAny>(
  req: Request,
  schema: T
): Promise<{ ok: true; data: z.infer<T> } | { ok: false; response: NextResponse }> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return { ok: false, response: fail('Request body must be valid JSON.', 400, 'INVALID_JSON') };
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return {
      ok: false,
      response: fail(
        `Invalid request body: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
        422,
        'VALIDATION_ERROR'
      ),
    };
  }
  return { ok: true, data: parsed.data };
}

export const reviewActionSchema = z.object({
  action: z.enum(['APPROVE', 'REJECT', 'SEND_BACK']),
  reviewer: z.string().min(1).max(120).optional(),
  notes: z.string().max(2000).optional(),
});

export const fieldUpdateSchema = z.object({
  fields: z
    .record(z.string(), z.union([z.string(), z.number(), z.null()]))
    .refine((obj) => Object.keys(obj).length > 0, 'At least one field must be provided.'),
  reviewer: z.string().min(1).max(120).optional(),
});

export const INVOICE_EDITABLE_FIELDS = new Set([
  'vendorName',
  'vendorAddress',
  'invoiceNumber',
  'invoiceDate',
  'dueDate',
  'currency',
  'purchaseOrderNumber',
  'subtotal',
  'tax',
  'discount',
  'total',
  'paymentTerms',
]);

export const NUMERIC_INVOICE_FIELDS = new Set(['subtotal', 'tax', 'discount', 'total']);
