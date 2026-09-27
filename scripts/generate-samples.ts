import PDFDocument from 'pdfkit';
import fs from 'node:fs';
import path from 'node:path';

const OUT_DIR = path.resolve(process.cwd(), 'samples');
fs.mkdirSync(OUT_DIR, { recursive: true });

interface LineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
}

interface InvoiceSpec {
  filename: string;
  vendorName: string;
  vendorAddress: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  currency: string;
  poNumber?: string;
  lineItems: LineItem[];
  subtotal: number;
  tax: number;
  discount: number;
  total: number; // deliberately wrong in some samples
  paymentTerms: string;
}

function renderInvoice(spec: InvoiceSpec): Promise<void> {
  return new Promise((resolve, reject) => {
    const outPath = path.join(OUT_DIR, spec.filename);
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const stream = fs.createWriteStream(outPath);
    doc.pipe(stream);

    doc.fontSize(20).text(spec.vendorName, { align: 'left' });
    doc.fontSize(10).text(spec.vendorAddress);
    doc.moveDown(1.5);

    doc.fontSize(16).text('INVOICE', { align: 'right' });
    doc.moveDown(0.5);
    doc.fontSize(10);
    doc.text(`Invoice Number: ${spec.invoiceNumber}`);
    doc.text(`Invoice Date: ${spec.invoiceDate}`);
    doc.text(`Due Date: ${spec.dueDate}`);
    if (spec.poNumber) doc.text(`Purchase Order Number: ${spec.poNumber}`);
    doc.text(`Payment Terms: ${spec.paymentTerms}`);
    doc.moveDown(1);

    // Line items -- two-space-separated columns so the mock provider's
    // regex-based line item parser (extraction relies on real spacing, not
    // a rendered table grid) can actually read it back out.
    doc.fontSize(11).text('Line items', { underline: true });
    doc.moveDown(0.3);
    doc.fontSize(9);
    for (const item of spec.lineItems) {
      const line = `${item.description.padEnd(28)}  ${item.quantity.toFixed(2).padStart(6)}  $${item.unitPrice.toFixed(2).padStart(9)}  $${item.amount.toFixed(2).padStart(10)}`;
      doc.text(line);
    }
    doc.moveDown(1);

    doc.fontSize(10);
    doc.text(`Subtotal: $${spec.subtotal.toFixed(2)}`);
    doc.text(`Tax: $${spec.tax.toFixed(2)}`);
    doc.text(`Discount: $${spec.discount.toFixed(2)}`);
    doc.fontSize(12).text(`Total Due: $${spec.total.toFixed(2)}`);

    doc.end();
    stream.on('finish', () => resolve());
    stream.on('error', reject);
  });
}

const samples: InvoiceSpec[] = [
  {
    filename: '01-valid-invoice.pdf',
    vendorName: 'Northwind Supply Co.',
    vendorAddress: '4821 Harbor Lane, Springfield, IL 62704',
    invoiceNumber: 'INV-1001',
    invoiceDate: '2026-08-01',
    dueDate: '2026-08-31',
    currency: 'USD',
    poNumber: 'PO-5521',
    paymentTerms: 'Net 30',
    lineItems: [
      { description: 'Concrete mixer rental', quantity: 2, unitPrice: 150, amount: 300 },
      { description: 'Rebar (10mm) bundle', quantity: 10, unitPrice: 45, amount: 450 },
      { description: 'Delivery fee', quantity: 1, unitPrice: 75, amount: 75 },
    ],
    subtotal: 825,
    tax: 66,
    discount: 0,
    total: 891,
  },
  {
    filename: '02-total-mismatch.pdf',
    vendorName: 'Atlas Industrial Parts',
    vendorAddress: '110 Foundry Row, Trenton, NJ 08608',
    invoiceNumber: 'INV-2044',
    invoiceDate: '2026-08-05',
    dueDate: '2026-09-04',
    currency: 'USD',
    poNumber: 'PO-7710',
    paymentTerms: 'Net 30',
    lineItems: [
      { description: 'Steel bracket set', quantity: 20, unitPrice: 12, amount: 240 },
      { description: 'Anchor bolts (box)', quantity: 5, unitPrice: 18, amount: 90 },
    ],
    subtotal: 100,
    tax: 10,
    discount: 0,
    // Deliberately wrong: subtotal(100) + tax(10) - discount(0) = 110, not 150.
    total: 150,
  },
  {
    filename: '03-missing-po.pdf',
    vendorName: 'Greenfield Office Supplies',
    vendorAddress: '77 Market St, Austin, TX 78701',
    invoiceNumber: 'INV-3391',
    invoiceDate: '2026-08-10',
    dueDate: '2026-09-09',
    currency: 'USD',
    paymentTerms: 'Net 15',
    lineItems: [
      { description: 'Printer paper (case)', quantity: 4, unitPrice: 32, amount: 128 },
      { description: 'Toner cartridge', quantity: 2, unitPrice: 89, amount: 178 },
    ],
    subtotal: 306,
    tax: 24.48,
    discount: 0,
    total: 330.48,
  },
  {
    filename: '04-scanned-style.pdf',
    vendorName: 'Riverbend Logistics LLC',
    vendorAddress: '9 Dockside Ave, Portland, OR 97201',
    invoiceNumber: 'INV-4410',
    invoiceDate: '2026-08-12',
    dueDate: '2026-09-11',
    currency: 'USD',
    poNumber: 'PO-9012',
    paymentTerms: 'Net 30',
    lineItems: [{ description: 'Freight, Portland to Seattle', quantity: 1, unitPrice: 640, amount: 640 }],
    subtotal: 640,
    tax: 51.2,
    discount: 0,
    total: 691.2,
  },
  {
    filename: '05-duplicate-of-01.pdf',
    vendorName: 'Northwind Supply Co.',
    vendorAddress: '4821 Harbor Lane, Springfield, IL 62704',
    invoiceNumber: 'INV-1001', // same invoice number + vendor as sample 01 on purpose
    invoiceDate: '2026-08-01',
    dueDate: '2026-08-31',
    currency: 'USD',
    poNumber: 'PO-5521',
    paymentTerms: 'Net 30',
    lineItems: [
      { description: 'Concrete mixer rental', quantity: 2, unitPrice: 150, amount: 300 },
      { description: 'Rebar (10mm) bundle', quantity: 10, unitPrice: 45, amount: 450 },
      { description: 'Delivery fee', quantity: 1, unitPrice: 75, amount: 75 },
    ],
    subtotal: 825,
    tax: 66,
    discount: 0,
    total: 891,
  },
];

async function main() {
  for (const spec of samples) {
    await renderInvoice(spec);
    console.log(`Generated samples/${spec.filename}`);
  }
  console.log(`\n${samples.length} synthetic sample invoices written to ${OUT_DIR}`);
  console.log('All vendor/invoice data above is fictional, generated for this demo only.');
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
