import { eq, desc } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { documents, reviewActions } from '@/lib/db/schema';
import { processDocument } from '@/lib/services/pipeline';
import { ok, fail, parseJsonBody, reviewActionSchema } from '@/lib/apiHelpers';

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const doc = await db.query.documents.findFirst({ where: eq(documents.id, params.id) });
  if (!doc) return fail('Document not found.', 404, 'NOT_FOUND');

  const parsed = await parseJsonBody(req, reviewActionSchema);
  if (!parsed.ok) return parsed.response;
  const { action, reviewer, notes } = parsed.data;

  await db.insert(reviewActions).values({
    documentId: doc.id,
    action,
    reviewer: reviewer || 'demo-reviewer',
    notes,
  });

  if (action === 'APPROVE') {
    await db
      .update(documents)
      .set({ status: 'COMPLETED', needsReview: false, updatedAt: new Date() })
      .where(eq(documents.id, doc.id));
  } else if (action === 'REJECT') {
    await db
      .update(documents)
      .set({
        status: 'FAILED',
        needsReview: false,
        failureReason: notes || 'Rejected during human review.',
        updatedAt: new Date(),
      })
      .where(eq(documents.id, doc.id));
  } else if (action === 'SEND_BACK') {
    // Re-run the pipeline from the top. Field corrections already made via
    // PATCH /fields are preserved on the Invoice row; re-processing only
    // re-derives extraction/classification/validation/analysis, and the
    // validation step will re-check the (now-corrected) data.
    try {
      await processDocument(doc.id);
    } catch (err: any) {
      await db
        .update(documents)
        .set({ status: 'FAILED', failureReason: err?.message || 'Reprocessing failed.', updatedAt: new Date() })
        .where(eq(documents.id, doc.id));
    }
  }

  const updated = await db.query.documents.findFirst({
    where: eq(documents.id, doc.id),
    with: { reviewActions: { orderBy: (t, { desc }) => [desc(t.createdAt)] } },
  });
  return ok(updated);
}
