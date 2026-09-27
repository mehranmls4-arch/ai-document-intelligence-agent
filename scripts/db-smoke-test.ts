import { db, sqlite } from '../lib/db/client';
import * as schema from '../lib/db/schema';
import { eq } from 'drizzle-orm';

async function main() {
  console.log('--- DB smoke test ---');

  const [document] = await db
    .insert(schema.documents)
    .values({
      filename: 'smoke-test.pdf',
      originalFilename: 'smoke-test.pdf',
      fileType: 'application/pdf',
      fileSizeBytes: 1234,
      storagePath: '/tmp/smoke-test.pdf',
      status: 'UPLOADED',
    })
    .returning();
  console.log('1. Created document:', document.id);

  const [invoice] = await db
    .insert(schema.invoices)
    .values({
      documentId: document.id,
      vendorName: 'Smoke Test Vendor',
      invoiceNumber: 'SMOKE-001',
      total: 150,
    })
    .returning();
  console.log('2. Created invoice:', invoice.id);

  const [lineItem] = await db
    .insert(schema.invoiceLineItems)
    .values({ invoiceId: invoice.id, description: 'Widget', quantity: 3, unitPrice: 50, amount: 150 })
    .returning();
  console.log('3. Created line item:', lineItem.id);

  const [validation] = await db
    .insert(schema.validationResults)
    .values({ documentId: document.id, rule: 'TOTAL_MATH', status: 'PASSED', message: 'ok' })
    .returning();
  console.log('4. Created validation result:', validation.id);

  const [run] = await db
    .insert(schema.processingRuns)
    .values({ documentId: document.id, stage: 'UPLOAD', status: 'SUCCEEDED' })
    .returning();
  console.log('5. Created processing run:', run.id);

  const fetched = await db.query.documents.findFirst({
    where: eq(schema.documents.id, document.id),
    with: {
      invoice: { with: { lineItems: true } },
      validationResults: true,
      processingRuns: true,
    },
  });

  if (!fetched) throw new Error('FAILED: could not retrieve document with relations');
  if (!fetched.invoice) throw new Error('FAILED: invoice relation missing');
  if (fetched.invoice.lineItems.length !== 1) throw new Error('FAILED: line item relation missing');
  if (fetched.validationResults.length !== 1) throw new Error('FAILED: validation relation missing');
  if (fetched.processingRuns.length !== 1) throw new Error('FAILED: processing run relation missing');

  console.log('6. Retrieved document with all relations OK:');
  console.log(JSON.stringify(fetched, null, 2));

  // cleanup so this script is re-runnable
  await db.delete(schema.documents).where(eq(schema.documents.id, document.id));
  console.log('--- Cleanup done. SMOKE TEST PASSED ---');
}

main()
  .catch((err) => {
    console.error('SMOKE TEST FAILED:', err);
    process.exitCode = 1;
  })
  .finally(() => sqlite.close());
