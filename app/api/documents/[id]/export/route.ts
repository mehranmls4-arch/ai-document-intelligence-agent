import { eq, desc } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { documents } from '@/lib/db/schema';
import { fail } from '@/lib/apiHelpers';
import { toExportJson, toExportCsv } from '@/lib/services/exportService';

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const { searchParams } = new URL(req.url);
  const format = (searchParams.get('format') || 'json').toLowerCase();

  const doc = await db.query.documents.findFirst({
    where: eq(documents.id, params.id),
    with: {
      invoice: { with: { lineItems: true } },
      validationResults: true,
      aiAnalysis: true,
      reviewActions: { orderBy: (t, { desc }) => [desc(t.createdAt)] },
    },
  });
  if (!doc) return fail('Document not found.', 404, 'NOT_FOUND');

  if (format === 'csv') {
    const csv = toExportCsv(doc as any);
    return new Response(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${doc.id}.csv"`,
      },
    });
  }

  if (format === 'json') {
    const json = toExportJson(doc as any);
    return new Response(JSON.stringify(json, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="${doc.id}.json"`,
      },
    });
  }

  return fail(`Unsupported export format "${format}". Use json or csv.`, 400, 'UNSUPPORTED_FORMAT');
}
