import { eq, asc, inArray } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { documents } from '@/lib/db/schema';
import { ok, fail } from '@/lib/apiHelpers';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const limit = Math.min(Number(searchParams.get('limit')) || 50, 200);

  try {
    const rows = await db.query.documents.findMany({
      where: eq(documents.status, 'NEEDS_REVIEW'),
      orderBy: [asc(documents.updatedAt)],
      limit,
      with: {
        invoice: true,
        validationResults: { where: (t, { inArray }) => inArray(t.status, ['WARNING', 'FAILED']) },
      },
    });

    return ok({ documents: rows, total: rows.length });
  } catch (err: any) {
    return fail(`Failed to load review queue: ${err.message}`, 500, 'REVIEW_QUEUE_FAILED');
  }
}
