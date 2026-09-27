import { and, eq, ne } from 'drizzle-orm';
import { config } from '../config';
import { db } from '../db/client';
import { invoices } from '../db/schema';
import type { ExtractedInvoice } from './aiProvider';

export type ValidationStatus = 'PASSED' | 'WARNING' | 'FAILED';

export interface ValidationOutcome {
  rule: string;
  status: ValidationStatus;
  message: string;
}

const REQUIRED_FIELDS: Array<{ key: keyof ExtractedInvoice; label: string }> = [
  { key: 'vendorName', label: 'Vendor name' },
  { key: 'invoiceNumber', label: 'Invoice number' },
  { key: 'invoiceDate', label: 'Invoice date' },
  { key: 'total', label: 'Total' },
];

/**
 * Purely deterministic, rule-based validation. Runs independently of (and
 * after) the AI extraction step -- the spec is explicit that validation
 * must not rely on the LLM being right. Every rule here is a plain
 * arithmetic/logic check with no model call involved.
 */
export class ValidationEngine {
  validate(invoice: ExtractedInvoice): ValidationOutcome[] {
    const results: ValidationOutcome[] = [];

    results.push(...this.checkRequiredFields(invoice));
    results.push(...this.checkTotalsMath(invoice));
    results.push(...this.checkLineItemMath(invoice));
    results.push(...this.checkDates(invoice));
    results.push(...this.checkCurrency(invoice));

    return results;
  }

  private checkRequiredFields(invoice: ExtractedInvoice): ValidationOutcome[] {
    return REQUIRED_FIELDS.map(({ key, label }) => {
      const field = invoice[key] as { value: unknown } | undefined;
      const present = field && field.value !== null && field.value !== undefined && field.value !== '';
      return present
        ? { rule: 'REQUIRED_FIELD_PRESENT', status: 'PASSED' as const, message: `${label} present.` }
        : {
            rule: 'REQUIRED_FIELD_MISSING',
            status: 'FAILED' as const,
            message: `${label} is required but could not be extracted.`,
          };
    });
  }

  private checkTotalsMath(invoice: ExtractedInvoice): ValidationOutcome[] {
    const { subtotal, tax, discount, total } = invoice;
    if (subtotal.value === null || total.value === null) {
      return [
        {
          rule: 'TOTAL_MATH',
          status: 'WARNING',
          message: 'Not enough numeric fields extracted to verify subtotal + tax - discount = total.',
        },
      ];
    }

    const expected = subtotal.value + (tax.value ?? 0) - (discount.value ?? 0);
    const diff = Math.abs(expected - total.value);

    if (diff <= config.validationAmountTolerance) {
      return [
        {
          rule: 'TOTAL_MATH',
          status: 'PASSED',
          message: `subtotal + tax - discount (${expected.toFixed(2)}) matches total (${total.value.toFixed(2)}).`,
        },
      ];
    }

    return [
      {
        rule: 'TOTAL_MISMATCH',
        status: 'FAILED',
        message: `Calculated total (${expected.toFixed(2)}) does not match extracted total (${total.value.toFixed(2)}); difference of ${diff.toFixed(2)}.`,
      },
    ];
  }

  private checkLineItemMath(invoice: ExtractedInvoice): ValidationOutcome[] {
    if (invoice.lineItems.length === 0) {
      return [
        {
          rule: 'LINE_ITEMS_PRESENT',
          status: 'WARNING',
          message: 'No line items could be parsed from the document.',
        },
      ];
    }

    return invoice.lineItems.map((item, idx) => {
      const expected = item.quantity * item.unitPrice;
      const diff = Math.abs(expected - item.amount);
      if (diff <= config.validationAmountTolerance) {
        return {
          rule: 'LINE_ITEM_MATH',
          status: 'PASSED' as const,
          message: `Line ${idx + 1} ("${item.description}"): quantity x unit price matches amount.`,
        };
      }
      return {
        rule: 'LINE_ITEM_MATH_MISMATCH',
        status: 'FAILED' as const,
        message: `Line ${idx + 1} ("${item.description}"): quantity x unit price (${expected.toFixed(2)}) does not match amount (${item.amount.toFixed(2)}).`,
      };
    });
  }

  private checkDates(invoice: ExtractedInvoice): ValidationOutcome[] {
    const results: ValidationOutcome[] = [];
    const invDateRaw = invoice.invoiceDate.value;
    const dueDateRaw = invoice.dueDate.value;

    if (invDateRaw) {
      const d = new Date(invDateRaw);
      results.push(
        isNaN(d.getTime())
          ? { rule: 'INVALID_INVOICE_DATE', status: 'FAILED', message: `"${invDateRaw}" is not a valid date.` }
          : { rule: 'INVOICE_DATE_VALID', status: 'PASSED', message: 'Invoice date is a valid date.' }
      );
    }

    if (dueDateRaw) {
      const d = new Date(dueDateRaw);
      results.push(
        isNaN(d.getTime())
          ? { rule: 'INVALID_DUE_DATE', status: 'FAILED', message: `"${dueDateRaw}" is not a valid date.` }
          : { rule: 'DUE_DATE_VALID', status: 'PASSED', message: 'Due date is a valid date.' }
      );
    }

    if (invDateRaw && dueDateRaw) {
      const inv = new Date(invDateRaw);
      const due = new Date(dueDateRaw);
      if (!isNaN(inv.getTime()) && !isNaN(due.getTime())) {
        results.push(
          due < inv
            ? {
                rule: 'DUE_BEFORE_INVOICE',
                status: 'FAILED',
                message: 'Due date is before the invoice date.',
              }
            : { rule: 'DATE_ORDER', status: 'PASSED', message: 'Due date is on or after the invoice date.' }
        );
      }
    }

    return results;
  }

  private checkCurrency(invoice: ExtractedInvoice): ValidationOutcome[] {
    const currency = invoice.currency.value;
    if (!currency) {
      return [{ rule: 'CURRENCY_MISSING', status: 'WARNING', message: 'No currency could be detected.' }];
    }
    const validCodes = ['USD', 'EUR', 'GBP', 'PKR', 'AED', 'CAD', 'AUD'];
    if (!validCodes.includes(currency)) {
      return [
        {
          rule: 'CURRENCY_UNRECOGNIZED',
          status: 'WARNING',
          message: `Currency "${currency}" is not in the recognized list (${validCodes.join(', ')}).`,
        },
      ];
    }
    return [{ rule: 'CURRENCY_VALID', status: 'PASSED', message: `Currency recognized as ${currency}.` }];
  }

  /**
   * Duplicate detection needs the database (comparing against previously
   * stored invoices), so it lives as a method that takes a Prisma client
   * rather than being a pure function like the rules above.
   */
  async checkDuplicates(
    invoice: ExtractedInvoice,
    excludeDocumentId: string
  ): Promise<ValidationOutcome[]> {
    if (!invoice.invoiceNumber.value || !invoice.vendorName.value) {
      return [
        {
          rule: 'DUPLICATE_CHECK_SKIPPED',
          status: 'WARNING',
          message: 'Insufficient data (invoice number/vendor) to check for duplicates.',
        },
      ];
    }

    const existing = await db.query.invoices.findFirst({
      where: and(
        eq(invoices.invoiceNumber, invoice.invoiceNumber.value),
        eq(invoices.vendorName, invoice.vendorName.value),
        ne(invoices.documentId, excludeDocumentId)
      ),
    });

    if (existing) {
      return [
        {
          rule: 'DUPLICATE_INVOICE',
          status: 'FAILED',
          message: `Invoice number "${invoice.invoiceNumber.value}" from vendor "${invoice.vendorName.value}" already exists (document ${existing.documentId}).`,
        },
      ];
    }

    return [{ rule: 'DUPLICATE_CHECK', status: 'PASSED', message: 'No duplicate invoice found.' }];
  }
}

/** Aggregates rule-level statuses into a single document-level status. */
export function overallValidationStatus(results: ValidationOutcome[]): ValidationStatus {
  if (results.some((r) => r.status === 'FAILED')) return 'FAILED';
  if (results.some((r) => r.status === 'WARNING')) return 'WARNING';
  return 'PASSED';
}
