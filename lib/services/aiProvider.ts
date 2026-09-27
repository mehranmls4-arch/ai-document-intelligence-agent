import { config } from '../config';
import { neutralizeForPrompt } from '../security';

export type DocumentTypeGuess =
  | 'invoice'
  | 'purchase_order'
  | 'receipt'
  | 'contract'
  | 'application'
  | 'report'
  | 'onboarding_document'
  | 'unknown';

export interface ClassificationResult {
  documentType: DocumentTypeGuess;
  confidence: number;
}

export interface FieldValue<T> {
  value: T;
  confidence: number;
}

export interface ExtractedInvoiceLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
}

export interface ExtractedInvoice {
  vendorName: FieldValue<string | null>;
  vendorAddress: FieldValue<string | null>;
  invoiceNumber: FieldValue<string | null>;
  invoiceDate: FieldValue<string | null>;
  dueDate: FieldValue<string | null>;
  currency: FieldValue<string | null>;
  purchaseOrderNumber: FieldValue<string | null>;
  subtotal: FieldValue<number | null>;
  tax: FieldValue<number | null>;
  discount: FieldValue<number | null>;
  total: FieldValue<number | null>;
  paymentTerms: FieldValue<string | null>;
  lineItems: ExtractedInvoiceLineItem[];
  overallConfidence: number;
}

export interface AiAnalysisResult {
  summary: string;
  keyObservations: string[];
  // Each anomaly is explicitly tagged so the UI can separate verified fact
  // from AI interpretation, per the spec's "never present speculation as
  // verified fact" requirement.
  anomalies: Array<{
    type: string;
    severity: 'low' | 'medium' | 'high';
    message: string;
    isFactual: boolean; // true = derived directly from validated numbers; false = AI judgment
  }>;
}

export interface AIProvider {
  readonly name: string;
  readonly model: string;
  classifyDocument(text: string): Promise<ClassificationResult>;
  extractInvoiceData(text: string): Promise<ExtractedInvoice>;
  analyzeDocument(text: string, invoice: ExtractedInvoice): Promise<AiAnalysisResult>;
}

// ---------------------------------------------------------------------------
// Mock provider: deterministic, offline, zero-cost. This is what the demo
// runs on by default (AI_PROVIDER=mock) so the whole pipeline works without
// any API key. It uses real heuristics/regex against the actual extracted
// text -- it is not randomly generated data, but it is not an LLM either,
// and confidence scores reflect that (they are pattern-match strength, not
// a model's calibrated probability).
// ---------------------------------------------------------------------------
export class MockAIProvider implements AIProvider {
  readonly name = 'mock';
  readonly model = 'heuristic-v1';

  async classifyDocument(text: string): Promise<ClassificationResult> {
    const t = text.toLowerCase();
    const scores: Record<DocumentTypeGuess, number> = {
      invoice: 0,
      purchase_order: 0,
      receipt: 0,
      contract: 0,
      application: 0,
      report: 0,
      onboarding_document: 0,
      unknown: 0,
    };

    const bump = (type: DocumentTypeGuess, weight: number) => (scores[type] += weight);

    if (/\binvoice\b/.test(t)) bump('invoice', 3);
    if (/\bbill to\b/.test(t)) bump('invoice', 2);
    if (/\bdue date\b/.test(t)) bump('invoice', 1);
    if (/\bpurchase order\b|\bp\.?o\.?\s*#/.test(t)) bump('purchase_order', 3);
    if (/\breceipt\b/.test(t)) bump('receipt', 3);
    if (/\bthank you for your purchase\b/.test(t)) bump('receipt', 2);
    if (/\bagreement\b|\bcontract\b|\bterms and conditions\b|\bparty a\b|\bparty b\b/.test(t))
      bump('contract', 3);
    if (/\bapplication\b|\bapplicant\b/.test(t)) bump('application', 3);
    if (/\bquarterly report\b|\bannual report\b|\bexecutive summary\b/.test(t)) bump('report', 3);
    if (/\bonboarding\b|\bnew hire\b|\bemployee handbook\b/.test(t)) bump('onboarding_document', 3);

    let best: DocumentTypeGuess = 'unknown';
    let bestScore = 0;
    for (const [type, score] of Object.entries(scores) as [DocumentTypeGuess, number][]) {
      if (score > bestScore) {
        best = type;
        bestScore = score;
      }
    }

    if (bestScore === 0) return { documentType: 'unknown', confidence: 0.3 };

    // Convert an unbounded heuristic score into a bounded, believable
    // confidence. Capped below 1.0 -- a keyword match is never certainty.
    const confidence = Math.min(0.5 + bestScore * 0.09, 0.97);
    return { documentType: best, confidence: Number(confidence.toFixed(2)) };
  }

  async extractInvoiceData(text: string): Promise<ExtractedInvoice> {
    const field = <T>(value: T | null, confidence: number): FieldValue<T | null> => ({
      value,
      confidence: value === null ? 0 : confidence,
    });

    const vendorName = matchFirst(text, [
      /^\s*([A-Z][A-Za-z0-9&.,'\- ]{2,60})\s*$/m, // first plausible title-case line
    ]);
    const invoiceNumber = matchFirst(text, [
      /invoice\s*(?:number|no\.?|#)\s*[:\-]?\s*([A-Za-z0-9\-\/]+)/i,
    ]);
    const invoiceDate = matchFirst(text, [
      /invoice\s*date\s*[:\-]?\s*([0-9]{4}-[0-9]{2}-[0-9]{2}|[0-9]{1,2}\/[0-9]{1,2}\/[0-9]{2,4})/i,
      /\bdate\s*[:\-]?\s*([0-9]{4}-[0-9]{2}-[0-9]{2})/i,
    ]);
    const dueDate = matchFirst(text, [
      /due\s*date\s*[:\-]?\s*([0-9]{4}-[0-9]{2}-[0-9]{2}|[0-9]{1,2}\/[0-9]{1,2}\/[0-9]{2,4})/i,
    ]);
    const currency = matchFirst(text, [/\b(USD|EUR|GBP|PKR|AED|CAD|AUD)\b/]) ?? detectCurrencySymbol(text);
    const poNumber = matchFirst(text, [/(?:purchase order|p\.?o\.?)\s*(?:number|#)?\s*[:\-]?\s*([A-Za-z0-9\-\/]+)/i]);
    const paymentTerms = matchFirst(text, [/payment\s*terms\s*[:\-]?\s*([A-Za-z0-9 %,\-]+)/i]);
    const vendorAddress = matchFirst(text, [/(\d{1,5}\s+[A-Za-z0-9.,'\- ]+,\s*[A-Za-z .]+,\s*[A-Z]{2}\s*\d{5})/]);

    const subtotal = matchNumber(text, [/sub\s*-?total\s*[:\-]?\s*\$?\s*([\d,]+\.\d{2}|[\d,]+)/i]);
    const tax = matchNumber(text, [/tax(?:\s*\([\d.]+%\))?\s*[:\-]?\s*\$?\s*([\d,]+\.\d{2}|[\d,]+)/i]);
    const discount = matchNumber(text, [/discount\s*[:\-]?\s*\$?\s*([\d,]+\.\d{2}|[\d,]+)/i]) ?? 0;
    const total = matchNumber(text, [/\btotal\s*(?:due)?\s*[:\-]?\s*\$?\s*([\d,]+\.\d{2}|[\d,]+)/i]);

    const lineItems = extractLineItems(text);

    const filledCount = [
      vendorName,
      invoiceNumber,
      invoiceDate,
      dueDate,
      currency,
      total,
    ].filter((v) => v !== null && v !== undefined).length;
    const overallConfidence = Number((0.35 + filledCount * 0.11).toFixed(2));

    return {
      vendorName: field(vendorName, 0.75),
      vendorAddress: field(vendorAddress, 0.6),
      invoiceNumber: field(invoiceNumber, 0.92),
      invoiceDate: field(invoiceDate, 0.88),
      dueDate: field(dueDate, 0.85),
      currency: field(currency, 0.8),
      purchaseOrderNumber: field(poNumber, 0.8),
      subtotal: field(subtotal, subtotal !== null ? 0.9 : 0),
      tax: field(tax, tax !== null ? 0.9 : 0),
      discount: field(discount, 0.7),
      total: field(total, total !== null ? 0.92 : 0),
      paymentTerms: field(paymentTerms, 0.7),
      lineItems,
      overallConfidence: Math.min(overallConfidence, 0.96),
    };
  }

  async analyzeDocument(text: string, invoice: ExtractedInvoice): Promise<AiAnalysisResult> {
    // `text` is treated as untrusted data even in the mock provider, to keep
    // the same contract a real-LLM provider must honor (see neutralizeForPrompt).
    void neutralizeForPrompt(text);

    const vendor = invoice.vendorName.value || 'an unidentified vendor';
    const total = invoice.total.value;
    const lineItemCount = invoice.lineItems.length;

    const summary =
      total !== null
        ? `Invoice from ${vendor} for ${formatCurrency(total, invoice.currency.value)} covering ${lineItemCount} line item${lineItemCount === 1 ? '' : 's'}.`
        : `Invoice from ${vendor}. Total amount could not be confidently extracted.`;

    const keyObservations: string[] = [];
    if (invoice.paymentTerms.value) keyObservations.push(`Payment terms: ${invoice.paymentTerms.value}.`);
    if (invoice.dueDate.value) keyObservations.push(`Due date: ${invoice.dueDate.value}.`);
    if (!invoice.purchaseOrderNumber.value) keyObservations.push('No purchase order number was found on this document.');
    if (lineItemCount === 0) keyObservations.push('No individual line items could be parsed from the document text.');

    const anomalies: AiAnalysisResult['anomalies'] = [];

    if (total !== null && total > 10000) {
      anomalies.push({
        type: 'large_amount',
        severity: 'medium',
        message: `Total of ${formatCurrency(total, invoice.currency.value)} is unusually large for a typical invoice in this dataset.`,
        isFactual: false,
      });
    }

    if (!invoice.purchaseOrderNumber.value) {
      anomalies.push({
        type: 'missing_po',
        severity: 'low',
        message: 'No purchase order number present -- may require manual matching to a PO.',
        isFactual: true,
      });
    }

    if (invoice.invoiceDate.value && invoice.dueDate.value) {
      const inv = new Date(invoice.invoiceDate.value);
      const due = new Date(invoice.dueDate.value);
      if (!isNaN(inv.getTime()) && !isNaN(due.getTime()) && due < inv) {
        anomalies.push({
          type: 'due_before_invoice',
          severity: 'high',
          message: 'Due date falls before the invoice date.',
          isFactual: true,
        });
      }
    }

    for (const item of invoice.lineItems) {
      const expected = item.quantity * item.unitPrice;
      if (Math.abs(expected - item.amount) > config.validationAmountTolerance) {
        anomalies.push({
          type: 'line_item_math_mismatch',
          severity: 'medium',
          message: `Line item "${item.description}": quantity x unit price (${expected.toFixed(2)}) does not match the stated amount (${item.amount.toFixed(2)}).`,
          isFactual: true,
        });
      }
    }

    return { summary, keyObservations, anomalies };
  }
}

function matchFirst(text: string, patterns: RegExp[]): string | null {
  for (const pattern of patterns) {
    const m = text.match(pattern);
    if (m && m[1]) return m[1].trim();
  }
  return null;
}

function matchNumber(text: string, patterns: RegExp[]): number | null {
  const raw = matchFirst(text, patterns);
  if (raw === null) return null;
  const cleaned = raw.replace(/,/g, '');
  const num = parseFloat(cleaned);
  return Number.isFinite(num) ? num : null;
}

function detectCurrencySymbol(text: string): string | null {
  if (text.includes('$')) return 'USD';
  if (text.includes('\u20ac')) return 'EUR';
  if (text.includes('\u00a3')) return 'GBP';
  if (text.includes('Rs') || text.includes('\u20a8')) return 'PKR';
  return null;
}

function formatCurrency(amount: number, currency: string | null): string {
  const symbol = currency === 'USD' || !currency ? '$' : `${currency} `;
  return `${symbol}${amount.toFixed(2)}`;
}

/**
 * Parses a simple tabular line-items block out of extracted invoice text.
 * Looks for lines shaped like: <description> <qty> <unit price> <amount>
 * This is intentionally forgiving (it's a heuristic, not an LLM), and any
 * line it cannot confidently parse is skipped rather than guessed.
 */
function extractLineItems(text: string): ExtractedInvoiceLineItem[] {
  const lines = text.split('\n');
  const items: ExtractedInvoiceLineItem[] = [];
  const rowPattern =
    /^(.{3,50}?)\s{2,}(\d+(?:\.\d+)?)\s+\$?\s?(\d[\d,]*\.\d{2})\s+\$?\s?(\d[\d,]*\.\d{2})\s*$/;

  for (const line of lines) {
    const m = line.match(rowPattern);
    if (!m) continue;
    const [, description, qty, unitPrice, amount] = m;
    items.push({
      description: description.trim(),
      quantity: parseFloat(qty),
      unitPrice: parseFloat(unitPrice.replace(/,/g, '')),
      amount: parseFloat(amount.replace(/,/g, '')),
    });
  }
  return items;
}

// ---------------------------------------------------------------------------
// Real providers. These call actual LLM APIs and are provided so a user with
// their own API key can flip AI_PROVIDER and get genuine model-based
// classification/extraction/analysis instead of the heuristic mock. They
// follow each vendor's documented request/response shape as of this
// project's build date, but -- unlike MockAIProvider -- they have NOT been
// exercised in this environment (no API key was available), so treat them
// as a documented, best-effort integration point rather than a tested path.
// ---------------------------------------------------------------------------

const EXTRACTION_PROMPT = (text: string) => `
You are an invoice data extraction system. Given the document text below,
return ONLY a JSON object (no markdown, no prose) matching this shape:
{
  "documentType": "invoice"|"purchase_order"|"receipt"|"contract"|"application"|"report"|"onboarding_document"|"unknown",
  "classificationConfidence": number (0-1),
  "vendorName": {"value": string|null, "confidence": number},
  "vendorAddress": {"value": string|null, "confidence": number},
  "invoiceNumber": {"value": string|null, "confidence": number},
  "invoiceDate": {"value": string|null, "confidence": number},
  "dueDate": {"value": string|null, "confidence": number},
  "currency": {"value": string|null, "confidence": number},
  "purchaseOrderNumber": {"value": string|null, "confidence": number},
  "subtotal": {"value": number|null, "confidence": number},
  "tax": {"value": number|null, "confidence": number},
  "discount": {"value": number|null, "confidence": number},
  "total": {"value": number|null, "confidence": number},
  "paymentTerms": {"value": string|null, "confidence": number},
  "lineItems": [{"description": string, "quantity": number, "unitPrice": number, "amount": number}],
  "summary": string,
  "keyObservations": string[],
  "anomalies": [{"type": string, "severity": "low"|"medium"|"high", "message": string, "isFactual": boolean}]
}

${neutralizeForPrompt(text)}
`;

abstract class RealAIProvider implements AIProvider {
  abstract readonly name: string;
  abstract readonly model: string;
  protected cachedResponse: any = null;

  abstract callModel(prompt: string): Promise<string>;

  private async getStructured(text: string): Promise<any> {
    if (this.cachedResponse) return this.cachedResponse; // avoid a second paid call per document
    const raw = await this.callModel(EXTRACTION_PROMPT(text));
    const cleaned = raw.replace(/```json|```/g, '').trim();
    try {
      this.cachedResponse = JSON.parse(cleaned);
    } catch {
      throw new Error(`${this.name} returned invalid JSON for structured extraction.`);
    }
    return this.cachedResponse;
  }

  async classifyDocument(text: string): Promise<ClassificationResult> {
    const data = await this.getStructured(text);
    return { documentType: data.documentType, confidence: data.classificationConfidence };
  }

  async extractInvoiceData(text: string): Promise<ExtractedInvoice> {
    const data = await this.getStructured(text);
    return {
      vendorName: data.vendorName,
      vendorAddress: data.vendorAddress,
      invoiceNumber: data.invoiceNumber,
      invoiceDate: data.invoiceDate,
      dueDate: data.dueDate,
      currency: data.currency,
      purchaseOrderNumber: data.purchaseOrderNumber,
      subtotal: data.subtotal,
      tax: data.tax,
      discount: data.discount,
      total: data.total,
      paymentTerms: data.paymentTerms,
      lineItems: data.lineItems || [],
      overallConfidence: data.classificationConfidence,
    };
  }

  async analyzeDocument(text: string): Promise<AiAnalysisResult> {
    const data = await this.getStructured(text);
    return {
      summary: data.summary,
      keyObservations: data.keyObservations || [],
      anomalies: data.anomalies || [],
    };
  }
}

export class OpenAIProvider extends RealAIProvider {
  readonly name = 'openai';
  readonly model = config.aiModel;

  async callModel(prompt: string): Promise<string> {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.openaiApiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0,
      }),
    });
    if (!res.ok) throw new Error(`OpenAI API error: ${res.status} ${await res.text()}`);
    const json = await res.json();
    return json.choices?.[0]?.message?.content ?? '';
  }
}

export class AnthropicProvider extends RealAIProvider {
  readonly name = 'anthropic';
  readonly model = config.aiModel || 'claude-sonnet-4-6';

  async callModel(prompt: string): Promise<string> {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.anthropicApiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!res.ok) throw new Error(`Anthropic API error: ${res.status} ${await res.text()}`);
    const json = await res.json();
    return json.content?.find((b: any) => b.type === 'text')?.text ?? '';
  }
}

export function getAIProvider(): AIProvider {
  switch (config.aiProvider) {
    case 'openai':
      if (!config.openaiApiKey) throw new Error('AI_PROVIDER=openai but OPENAI_API_KEY is not set.');
      return new OpenAIProvider();
    case 'anthropic':
      if (!config.anthropicApiKey) throw new Error('AI_PROVIDER=anthropic but ANTHROPIC_API_KEY is not set.');
      return new AnthropicProvider();
    case 'mock':
    default:
      return new MockAIProvider();
  }
}
