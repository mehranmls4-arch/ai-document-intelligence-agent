import { describe, it, expect } from 'vitest';
import { MockAIProvider } from '../lib/services/aiProvider';

const provider = new MockAIProvider();

const SAMPLE_INVOICE_TEXT = `Northwind Supply Co.
4821 Harbor Lane, Springfield, IL 62704

                                                      INVOICE
Invoice Number: INV-1001
Invoice Date: 2026-08-01
Due Date: 2026-08-31
Purchase Order Number: PO-5521
Payment Terms: Net 30

Line items
Concrete mixer rental       2.00 $ 150.00 $ 300.00
Rebar (10mm) bundle          10.00 $ 45.00 $ 450.00
Delivery fee            1.00 $ 75.00 $ 75.00

Subtotal: $825.00
Tax: $66.00
Discount: $0.00
Total Due: $891.00`;

describe('MockAIProvider.classifyDocument', () => {
  it('classifies invoice-shaped text as invoice with confidence in [0,1]', async () => {
    const result = await provider.classifyDocument(SAMPLE_INVOICE_TEXT);
    expect(result.documentType).toBe('invoice');
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });

  it('classifies contract-shaped text as contract', async () => {
    const text = 'AGREEMENT\n\nThis Agreement is entered into between Party A and Party B under these terms and conditions.';
    const result = await provider.classifyDocument(text);
    expect(result.documentType).toBe('contract');
  });

  it('returns unknown with low confidence for unrecognizable text', async () => {
    const result = await provider.classifyDocument('the quick brown fox jumps over the lazy dog');
    expect(result.documentType).toBe('unknown');
    expect(result.confidence).toBeLessThan(0.5);
  });
});

describe('MockAIProvider.extractInvoiceData', () => {
  it('extracts every core field correctly from a well-formed invoice', async () => {
    const result = await provider.extractInvoiceData(SAMPLE_INVOICE_TEXT);
    expect(result.invoiceNumber.value).toBe('INV-1001');
    expect(result.invoiceDate.value).toBe('2026-08-01');
    expect(result.dueDate.value).toBe('2026-08-31');
    expect(result.purchaseOrderNumber.value).toBe('PO-5521');
    expect(result.currency.value).toBe('USD');
    expect(result.subtotal.value).toBe(825);
    expect(result.tax.value).toBe(66);
    expect(result.total.value).toBe(891);
    expect(result.paymentTerms.value).toBe('Net 30');
    expect(result.lineItems).toHaveLength(3);
    expect(result.lineItems[0]).toMatchObject({ quantity: 2, unitPrice: 150, amount: 300 });
  });

  it('every field carries a confidence between 0 and 1', async () => {
    const result = await provider.extractInvoiceData(SAMPLE_INVOICE_TEXT);
    const confidences = [
      result.vendorName.confidence,
      result.invoiceNumber.confidence,
      result.invoiceDate.confidence,
      result.total.confidence,
    ];
    for (const c of confidences) {
      expect(c).toBeGreaterThanOrEqual(0);
      expect(c).toBeLessThanOrEqual(1);
    }
  });

  it('missing fields have null value and zero confidence, not fabricated data', async () => {
    const sparseText = 'Invoice Number: INV-999\nTotal Due: $50.00';
    const result = await provider.extractInvoiceData(sparseText);
    expect(result.purchaseOrderNumber.value).toBeNull();
    expect(result.purchaseOrderNumber.confidence).toBe(0);
  });
});

describe('MockAIProvider.analyzeDocument', () => {
  it('flags a due-before-invoice date anomaly as factual', async () => {
    const invoice = await provider.extractInvoiceData(SAMPLE_INVOICE_TEXT);
    invoice.invoiceDate = { value: '2026-09-01', confidence: 0.9 };
    invoice.dueDate = { value: '2026-08-01', confidence: 0.9 };
    const analysis = await provider.analyzeDocument(SAMPLE_INVOICE_TEXT, invoice);
    const anomaly = analysis.anomalies.find((a) => a.type === 'due_before_invoice');
    expect(anomaly).toBeDefined();
    expect(anomaly?.isFactual).toBe(true);
  });

  it('flags a missing PO number as a factual (not speculative) anomaly', async () => {
    const invoice = await provider.extractInvoiceData(SAMPLE_INVOICE_TEXT);
    invoice.purchaseOrderNumber = { value: null, confidence: 0 };
    const analysis = await provider.analyzeDocument(SAMPLE_INVOICE_TEXT, invoice);
    const anomaly = analysis.anomalies.find((a) => a.type === 'missing_po');
    expect(anomaly?.isFactual).toBe(true);
  });

  it('flags a large total as a non-factual (AI interpretation) anomaly', async () => {
    const invoice = await provider.extractInvoiceData(SAMPLE_INVOICE_TEXT);
    invoice.total = { value: 50000, confidence: 0.9 };
    const analysis = await provider.analyzeDocument(SAMPLE_INVOICE_TEXT, invoice);
    const anomaly = analysis.anomalies.find((a) => a.type === 'large_amount');
    expect(anomaly).toBeDefined();
    expect(anomaly?.isFactual).toBe(false);
  });

  it('produces a human-readable summary mentioning the vendor and total', async () => {
    const invoice = await provider.extractInvoiceData(SAMPLE_INVOICE_TEXT);
    const analysis = await provider.analyzeDocument(SAMPLE_INVOICE_TEXT, invoice);
    expect(analysis.summary).toContain('Northwind Supply Co.');
    expect(analysis.summary).toContain('891.00');
  });
});
