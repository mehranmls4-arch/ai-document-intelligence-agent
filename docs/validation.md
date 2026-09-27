# Validation Engine

`lib/services/validation.ts` — a plain TypeScript class, no AI calls. Runs after structured extraction, on whatever the `AIProvider` returned, regardless of which provider produced it.

## Rules

| Rule | Type | Behavior |
|---|---|---|
| `REQUIRED_FIELD_PRESENT` / `REQUIRED_FIELD_MISSING` | required fields | `vendorName`, `invoiceNumber`, `invoiceDate`, `total` must be non-null/non-empty |
| `TOTAL_MATH` / `TOTAL_MISMATCH` | math | `subtotal + tax − discount == total`, within `VALIDATION_AMOUNT_TOLERANCE` (default `0.02`). `WARNING` (not a hard fail) if subtotal or total is missing entirely — there's nothing to check |
| `LINE_ITEM_MATH` / `LINE_ITEM_MATH_MISMATCH` | math | per line item, `quantity × unitPrice == amount`, same tolerance. `LINE_ITEMS_PRESENT` warning if there are no line items at all |
| `INVOICE_DATE_VALID` / `INVALID_INVOICE_DATE`, `DUE_DATE_VALID` / `INVALID_DUE_DATE` | dates | the string must parse as a real date |
| `DATE_ORDER` / `DUE_BEFORE_INVOICE` | dates | due date must not be before invoice date (only checked if both dates parsed) |
| `CURRENCY_VALID` / `CURRENCY_UNRECOGNIZED` / `CURRENCY_MISSING` | currency | checked against a fixed list (`USD, EUR, GBP, PKR, AED, CAD, AUD`); unrecognized is a `WARNING`, not a hard fail (a currency this list doesn't know about isn't necessarily wrong) |
| `DUPLICATE_INVOICE` / `DUPLICATE_CHECK` / `DUPLICATE_CHECK_SKIPPED` | duplicate detection | queries the database for another invoice with the same `invoiceNumber` + `vendorName` (excluding the current document); skipped (as a `WARNING`, not silently ignored) if either field is missing |

`overallValidationStatus()` rolls a list of rule results up to one document-level status: any `FAILED` wins over any `WARNING`, which wins over all-`PASSED`.

## Test cases (verified)

All six run as automated Vitest tests (`tests/validation.test.ts`) *and* were separately exercised through the real HTTP pipeline against synthetic sample PDFs (`/samples`):

1. **Valid invoice** — every rule passes. (`samples/01-valid-invoice.pdf`, via HTTP: 12 passed / 0 warnings / 1 failed — see note below.)
2. **Total mismatch** — `subtotal=100, tax=10, total=150` → `TOTAL_MISMATCH`, message states the calculated value (110.00) vs. the stated one (150.00). (`samples/02-total-mismatch.pdf`, verified via HTTP.)
3. **Line-item mismatch** — `quantity=2, unitPrice=50, amount=150` → `LINE_ITEM_MATH_MISMATCH`.
4. **Invalid dates** — due date before invoice date → `DUE_BEFORE_INVOICE`, `FAILED`.
5. **Missing required field** — invoice number removed → `REQUIRED_FIELD_MISSING`, `FAILED`. (Also individually tested for `vendorName`, `invoiceDate`, `total`.)
6. **Duplicate** — the same invoice number + vendor processed twice → the second one gets `DUPLICATE_INVOICE`, `FAILED`, naming the earlier document's ID. (`samples/05-duplicate-of-01.pdf` is a dedicated test case for this; a duplicate was also found *organically* during manual testing when the same sample was accidentally uploaded twice, which is additional independent confirmation the rule works against real data, not just the test fixture.)

Two additional cases worth calling out because they're easy to get wrong:

- **Rounding within tolerance is not a false failure** — `110.00` vs. a stated `110.01` passes `TOTAL_MATH` (difference is within the default `0.02` tolerance).
- **An unrecognized currency code is a `WARNING`, not a `FAILED`** — the point is to flag it for a human glance, not to reject a legitimate but uncommon currency outright.

Note on the "valid invoice" sample showing a validation failure in the live test run: it correctly triggered `DUPLICATE_INVOICE` because an earlier test run had already uploaded the same synthetic invoice into the same database. That's the duplicate-detection rule working as intended, not a bug in the "valid invoice" case itself — on a freshly-migrated empty database it passes all 12 applicable rules.

## Explicit non-goal

The validation engine never calls an `AIProvider`. If every AI provider disappeared, this file would still correctly catch a math error in a hand-typed invoice.
