import { eq, and, desc, count } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { documents } from '@/lib/db/schema';
import { ok, fail } from '@/lib/apiHelpers';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status') || undefined;
  const documentType = searchParams.get('documentType') || undefined;
  const limit = Math.min(Number(searchParams.get('limit')) || 50, 200);
  const offset = Number(searchParams.get('offset')) || 0;

  try {
    const conditions = [
      status ? eq(documents.status, status) : undefined,
      documentType ? eq(documents.documentType, documentType) : undefined,
    ].filter((c): c is NonNullable<typeof c> => c !== undefined);
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [rows, totalRows] = await Promise.all([
      db.query.documents.findMany({
        where,
        orderBy: [desc(documents.createdAt)],
        limit,
        offset,
        with: { invoice: true },
      }),
      db.select({ value: count() }).from(documents).where(where),
    ]);

    return ok({ documents: rows, total: totalRows[0]?.value ?? 0, limit, offset });
  } catch (err: any) {
    return fail(`Failed to list documents: ${err.message}`, 500, 'LIST_FAILED');
  }
}
