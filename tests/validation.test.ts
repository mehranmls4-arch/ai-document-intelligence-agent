import { describe, it, expect } from 'vitest';
import { ValidationEngine, overallValidationStatus } from '../lib/services/validation';
import type { ExtractedInvoice } from '../lib/services/aiProvider';

function field<T>(value: T | null, confidence = 0.9) {
  return { value, confidence: value === null ? 0 : confidence };
}

function baseInvoice(overrides: Partial<ExtractedInvoice> = {}): ExtractedInvoice {
  return {
    vendorName: field('Acme Corp'),
    vendorAddress: field(null),
    invoiceNumber: field('INV-001'),
    invoiceDate: field('2026-01-01'),
    dueDate: field('2026-01-31'),
    currency: field('USD'),
    purchaseOrderNumber: field('PO-1'),
    subtotal: field(100),
    tax: field(10),
    discount: field(0),
    total: field(110),
    paymentTerms: field('Net 30'),
    lineItems: [{ description: 'Widget', quantity: 2, unitPrice: 50, amount: 100 }],
    overallConfidence: 0.9,
    ...overrides,
  };
}

describe('ValidationEngine', () => {
  const engine = new ValidationEngine();

  it('CASE 1: a fully correct invoice passes every rule', () => {
    const results = engine.validate(baseInvoice());
    expect(results.every((r) => r.status === 'PASSED')).toBe(true);
    expect(overallValidationStatus(results)).toBe('PASSED');
  });

  it('CASE 2: total mismatch is detected (subtotal 100 + tax 10 != total 150)', () => {
    const results = engine.validate(baseInvoice({ total: field(150) }));
    const totalRule = results.find((r) => r.rule === 'TOTAL_MISMATCH');
    expect(totalRule).toBeDefined();
    expect(totalRule?.status).toBe('FAILED');
    expect(totalRule?.message).toContain('110.00');
    expect(totalRule?.message).toContain('150.00');
  });

  it('CASE 3: line-item mismatch is detected (qty 2 * price 50 != amount 150)', () => {
    const results = engine.validate(
      baseInvoice({ lineItems: [{ description: 'Widget', quantity: 2, unitPrice: 50, amount: 150 }] })
    );
    const lineRule = results.find((r) => r.rule === 'LINE_ITEM_MATH_MISMATCH');
    expect(lineRule).toBeDefined();
    expect(lineRule?.status).toBe('FAILED');
  });

  it('CASE 4: due date before invoice date fails DUE_BEFORE_INVOICE', () => {
    const results = engine.validate(
      baseInvoice({ invoiceDate: field('2026-02-15'), dueDate: field('2026-01-01') })
    );
    const dateRule = results.find((r) => r.rule === 'DUE_BEFORE_INVOICE');
    expect(dateRule).toBeDefined();
    expect(dateRule?.status).toBe('FAILED');
  });

  it('CASE 5: missing invoice number fails REQUIRED_FIELD_MISSING', () => {
    const results = engine.validate(baseInvoice({ invoiceNumber: field(null) }));
    const missing = results.find((r) => r.rule === 'REQUIRED_FIELD_MISSING' && r.message.includes('Invoice number'));
    expect(missing).toBeDefined();
    expect(missing?.status).toBe('FAILED');
  });

  it('missing vendor name, invoice date, or total are each caught individually', () => {
    for (const [key, label] of [
      ['vendorName', 'Vendor name'],
      ['invoiceDate', 'Invoice date'],
      ['total', 'Total'],
    ] as const) {
      const results = engine.validate(baseInvoice({ [key]: field(null) } as any));
      const missing = results.find((r) => r.rule === 'REQUIRED_FIELD_MISSING' && r.message.includes(label));
      expect(missing, `expected ${label} to be flagged missing`).toBeDefined();
    }
  });

  it('invalid (unparseable) date string fails INVALID_INVOICE_DATE', () => {
    const results = engine.validate(baseInvoice({ invoiceDate: field('not-a-date') }));
    const invalid = results.find((r) => r.rule === 'INVALID_INVOICE_DATE');
    expect(invalid).toBeDefined();
    expect(invalid?.status).toBe('FAILED');
  });

  it('rounding within tolerance passes TOTAL_MATH (not a false failure)', () => {
    // 100 + 10 - 0 = 110.00 vs stated 110.01 -- within the 0.02 default tolerance
    const results = engine.validate(baseInvoice({ total: field(110.01) }));
    const totalRule = results.find((r) => r.rule.startsWith('TOTAL_'));
    expect(totalRule?.status).toBe('PASSED');
  });

  it('unrecognized currency code produces a WARNING, not a hard failure', () => {
    const results = engine.validate(baseInvoice({ currency: field('XYZ') }));
    const currencyRule = results.find((r) => r.rule === 'CURRENCY_UNRECOGNIZED');
    expect(currencyRule?.status).toBe('WARNING');
  });

  it('no line items produces a WARNING rather than crashing', () => {
    const results = engine.validate(baseInvoice({ lineItems: [] }));
    const rule = results.find((r) => r.rule === 'LINE_ITEMS_PRESENT');
    expect(rule?.status).toBe('WARNING');
  });

  it('overallValidationStatus: FAILED beats WARNING beats PASSED', () => {
    expect(overallValidationStatus([{ rule: 'A', status: 'PASSED', message: '' }])).toBe('PASSED');
    expect(
      overallValidationStatus([
        { rule: 'A', status: 'PASSED', message: '' },
        { rule: 'B', status: 'WARNING', message: '' },
      ])
    ).toBe('WARNING');
    expect(
      overallValidationStatus([
        { rule: 'A', status: 'WARNING', message: '' },
        { rule: 'B', status: 'FAILED', message: '' },
      ])
    ).toBe('FAILED');
  });
});
