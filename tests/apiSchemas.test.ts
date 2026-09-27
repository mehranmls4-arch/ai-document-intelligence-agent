import { describe, it, expect } from 'vitest';
import { reviewActionSchema, fieldUpdateSchema } from '../lib/apiHelpers';

describe('reviewActionSchema', () => {
  it('accepts a valid APPROVE action', () => {
    const result = reviewActionSchema.safeParse({ action: 'APPROVE' });
    expect(result.success).toBe(true);
  });

  it('accepts REJECT with notes', () => {
    const result = reviewActionSchema.safeParse({ action: 'REJECT', notes: 'Vendor not recognized' });
    expect(result.success).toBe(true);
  });

  it('rejects an invalid action value', () => {
    const result = reviewActionSchema.safeParse({ action: 'DELETE_EVERYTHING' });
    expect(result.success).toBe(false);
  });

  it('rejects a missing action field', () => {
    const result = reviewActionSchema.safeParse({ notes: 'no action given' });
    expect(result.success).toBe(false);
  });

  it('rejects an overly long reviewer name', () => {
    const result = reviewActionSchema.safeParse({ action: 'APPROVE', reviewer: 'x'.repeat(500) });
    expect(result.success).toBe(false);
  });
});

describe('fieldUpdateSchema', () => {
  it('accepts a valid single-field update', () => {
    const result = fieldUpdateSchema.safeParse({ fields: { vendorName: 'New Vendor' } });
    expect(result.success).toBe(true);
  });

  it('accepts numeric and null field values', () => {
    const result = fieldUpdateSchema.safeParse({ fields: { total: 500, discount: null } });
    expect(result.success).toBe(true);
  });

  it('rejects an empty fields object', () => {
    const result = fieldUpdateSchema.safeParse({ fields: {} });
    expect(result.success).toBe(false);
  });

  it('rejects a malformed body with no fields key at all', () => {
    const result = fieldUpdateSchema.safeParse({ vendorName: 'New Vendor' });
    expect(result.success).toBe(false);
  });

  it('rejects a non-object, non-array field value (e.g. a boolean)', () => {
    const result = fieldUpdateSchema.safeParse({ fields: { total: true } });
    expect(result.success).toBe(false);
  });
});
