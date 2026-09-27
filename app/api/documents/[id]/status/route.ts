import { eq, asc } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { documents } from '@/lib/db/schema';
import { ok, fail } from '@/lib/apiHelpers';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const doc = await db.query.documents.findFirst({
    where: eq(documents.id, params.id),
    columns: {
      id: true,
      status: true,
      needsReview: true,
      failureReason: true,
      documentType: true,
      overallConfidence: true,
      updatedAt: true,
    },
    with: {
      processingRuns: {
        orderBy: (t, { asc }) => [asc(t.startedAt)],
        columns: { stage: true, status: true, durationMs: true, errorMessage: true },
      },
    },
  });

  if (!doc) return fail('Document not found.', 404, 'NOT_FOUND');
  return ok(doc);
}
