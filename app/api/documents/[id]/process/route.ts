import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { documents } from '@/lib/db/schema';
import { processDocument } from '@/lib/services/pipeline';
import { ok, fail } from '@/lib/apiHelpers';

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const doc = await db.query.documents.findFirst({ where: eq(documents.id, params.id) });
  if (!doc) return fail('Document not found.', 404, 'NOT_FOUND');

  try {
    await processDocument(doc.id);
  } catch (err: any) {
    await db
      .update(documents)
      .set({ status: 'FAILED', failureReason: err?.message || 'Unknown processing error.', updatedAt: new Date() })
      .where(eq(documents.id, doc.id));
    return fail(`Processing failed: ${err.message}`, 500, 'PROCESSING_FAILED');
  }

  const updated = await db.query.documents.findFirst({ where: eq(documents.id, doc.id) });
  return ok(updated);
}
