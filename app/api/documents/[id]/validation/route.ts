import { eq, asc } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { documents, validationResults } from '@/lib/db/schema';
import { ok, fail } from '@/lib/apiHelpers';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const doc = await db.query.documents.findFirst({ where: eq(documents.id, params.id) });
  if (!doc) return fail('Document not found.', 404, 'NOT_FOUND');

  const results = await db.query.validationResults.findMany({
    where: eq(validationResults.documentId, params.id),
    orderBy: [asc(validationResults.createdAt)],
  });

  const summary = {
    passed: results.filter((r) => r.status === 'PASSED').length,
    warnings: results.filter((r) => r.status === 'WARNING').length,
    failed: results.filter((r) => r.status === 'FAILED').length,
  };

  return ok({ documentId: params.id, summary, results });
}
