import fs from 'node:fs/promises';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { documents } from '@/lib/db/schema';
import { fail } from '@/lib/apiHelpers';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const doc = await db.query.documents.findFirst({ where: eq(documents.id, params.id) });
  if (!doc) return fail('Document not found.', 404, 'NOT_FOUND');

  try {
    const bytes = await fs.readFile(doc.storagePath);
    return new Response(bytes, {
      status: 200,
      headers: {
        'Content-Type': doc.fileType,
        'Content-Disposition': `inline; filename="${encodeURIComponent(doc.originalFilename)}"`,
        'Cache-Control': 'private, max-age=60',
      },
    });
  } catch {
    return fail('Stored file could not be read from disk.', 500, 'FILE_READ_ERROR');
  }
}
