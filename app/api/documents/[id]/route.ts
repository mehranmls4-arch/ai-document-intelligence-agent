import { eq, asc, desc } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { documents } from '@/lib/db/schema';
import { ok, fail } from '@/lib/apiHelpers';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const doc = await db.query.documents.findFirst({
    where: eq(documents.id, params.id),
    with: {
      invoice: { with: { lineItems: true } },
      validationResults: true,
      aiAnalysis: true,
      reviewActions: { orderBy: (t, { desc }) => [desc(t.createdAt)] },
      processingRuns: { orderBy: (t, { asc }) => [asc(t.startedAt)] },
    },
  });

  if (!doc) return fail('Document not found.', 404, 'NOT_FOUND');
  return ok(doc);
}
