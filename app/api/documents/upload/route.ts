import path from 'node:path';
import fs from 'node:fs/promises';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { documents, processingRuns } from '@/lib/db/schema';
import { config } from '@/lib/config';
import { safeStorageFilename, validateUpload, FileValidationError } from '@/lib/security';
import { processDocument } from '@/lib/services/pipeline';
import { ok, fail } from '@/lib/apiHelpers';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return fail('Expected multipart/form-data with a "file" field.', 400, 'INVALID_FORM_DATA');
  }

  const file = formData.get('file');
  if (!(file instanceof File)) {
    return fail('Missing "file" field.', 400, 'MISSING_FILE');
  }

  try {
    validateUpload({ name: file.name, size: file.size, type: file.type });
  } catch (err) {
    if (err instanceof FileValidationError) {
      return fail(err.message, 422, 'FILE_VALIDATION_ERROR');
    }
    throw err;
  }

  await fs.mkdir(config.uploadDir, { recursive: true });
  const storedFilename = safeStorageFilename(file.name);
  const storagePath = path.join(config.uploadDir, storedFilename);
  const buffer = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(storagePath, buffer);

  const [document] = await db
    .insert(documents)
    .values({
      filename: storedFilename,
      originalFilename: file.name,
      fileType: file.type || guessMimeFromExtension(file.name),
      fileSizeBytes: file.size,
      storagePath,
      status: 'UPLOADED',
    })
    .returning();

  await db.insert(processingRuns).values({
    documentId: document.id,
    stage: 'UPLOAD',
    status: 'SUCCEEDED',
    completedAt: new Date(),
  });

  // Auto-start processing so the upload -> pipeline -> result flow the demo
  // needs works in one step. Failures are captured on the document itself
  // (status=FAILED, failureReason set) rather than surfaced as a 500 here --
  // the upload genuinely succeeded even if processing later fails.
  try {
    await processDocument(document.id);
  } catch (err: any) {
    await db
      .update(documents)
      .set({ status: 'FAILED', failureReason: err?.message || 'Unknown processing error.', updatedAt: new Date() })
      .where(eq(documents.id, document.id));
  }

  const finalDoc = await db.query.documents.findFirst({ where: eq(documents.id, document.id) });
  return ok(finalDoc, 201);
}

function guessMimeFromExtension(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  if (ext === '.pdf') return 'application/pdf';
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  return 'application/octet-stream';
}
