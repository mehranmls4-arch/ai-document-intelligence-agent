import { DocumentExtractor } from '../lib/services/extraction';
import path from 'node:path';

async function main() {
  const extractor = new DocumentExtractor();
  const samplesDir = path.resolve(process.cwd(), 'samples');

  console.log('--- Text-based PDF ---');
  const r1 = await extractor.extract(path.join(samplesDir, '01-valid-invoice.pdf'), 'application/pdf');
  console.log('method:', r1.method, '| confidence:', r1.confidence, '| pages:', r1.pageCount, '| textLength:', r1.text.length);
  if (r1.method !== 'pdf_text') throw new Error('FAIL: expected pdf_text extraction for a text PDF');
  if (!r1.text.includes('INV-1001')) throw new Error('FAIL: extracted text missing expected invoice number');
  console.log('PASS: text PDF extracted via pdftotext, correct method selected.\n');

  console.log('--- Image-only PDF (should auto-fallback to OCR) ---');
  const r2 = await extractor.extract(path.join(samplesDir, '04-scanned-style-imageonly.pdf'), 'application/pdf');
  console.log('method:', r2.method, '| confidence:', r2.confidence.toFixed(2), '| pages:', r2.pageCount, '| textLength:', r2.text.length);
  if (r2.method !== 'ocr') throw new Error('FAIL: expected automatic OCR fallback for an image-only PDF');
  if (!r2.text.includes('4410') && !r2.text.toLowerCase().includes('riverbend')) {
    throw new Error('FAIL: OCR text does not contain expected content');
  }
  console.log('PASS: image-only PDF correctly fell back to pdftoppm + tesseract OCR.\n');

  console.log('--- Direct PNG image upload ---');
  const r3 = await extractor.extract(path.join(samplesDir, '04-scanned-style.png'), 'image/png');
  console.log('method:', r3.method, '| confidence:', r3.confidence.toFixed(2), '| textLength:', r3.text.length);
  if (r3.method !== 'ocr') throw new Error('FAIL: expected OCR for a raw image');
  if (!r3.text.toLowerCase().includes('riverbend')) throw new Error('FAIL: OCR text missing expected vendor name');
  console.log('PASS: raw PNG image OCR\'d correctly.\n');

  console.log('=== ALL EXTRACTION TESTS PASSED ===');
}

main().catch((err) => {
  console.error('EXTRACTION TEST FAILED:', err);
  process.exitCode = 1;
});
