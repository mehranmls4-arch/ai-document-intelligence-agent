import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { config } from '../config';

const execFileAsync = promisify(execFile);

export interface ExtractionResult {
  text: string;
  pageCount: number;
  method: 'pdf_text' | 'ocr';
  confidence: number; // heuristic confidence in the extraction quality itself
}

/**
 * Extracts embedded text from a text-based PDF using poppler's `pdftotext`.
 * This is the fast, cheap, high-fidelity path: no AI call, no image
 * rasterization, just the PDF's own text layer.
 */
export class PdfTextExtractor {
  async extract(filePath: string): Promise<ExtractionResult> {
    const { stdout } = await execFileAsync(config.pdftotextBin, ['-layout', filePath, '-']);
    const pageCount = await this.getPageCount(filePath);
    const text = stdout.trim();

    // A text-based PDF that yields almost nothing is very likely a scanned
    // image wrapped in a PDF container -- the caller should fall back to OCR.
    const confidence = text.length > 40 ? 0.98 : 0.1;

    return { text, pageCount, method: 'pdf_text', confidence };
  }

  private async getPageCount(filePath: string): Promise<number> {
    try {
      const { stdout } = await execFileAsync('pdfinfo', [filePath]);
      const match = stdout.match(/^Pages:\s+(\d+)/m);
      return match ? parseInt(match[1], 10) : 1;
    } catch {
      return 1;
    }
  }
}

/**
 * OCR extraction for scanned PDFs and raw images, via the system Tesseract
 * binary. For PDFs, each page is first rasterized to a PNG with poppler's
 * `pdftoppm`, then OCR'd individually and the results concatenated -- this
 * keeps per-page confidence obtainable in the future without re-architecting.
 *
 * Kept behind this class (and the shared ExtractionResult contract) so the
 * provider can be swapped for a cloud OCR API later without touching any
 * caller.
 */
export class OCRExtractor {
  async extract(filePath: string, fileType: string): Promise<ExtractionResult> {
    if (fileType === 'application/pdf') {
      return this.extractFromScannedPdf(filePath);
    }
    return this.extractFromImage(filePath);
  }

  private async extractFromImage(filePath: string): Promise<ExtractionResult> {
    const { text, confidence } = await this.runTesseract(filePath);
    return { text, pageCount: 1, method: 'ocr', confidence };
  }

  private async extractFromScannedPdf(filePath: string): Promise<ExtractionResult> {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ocr-'));
    const prefix = path.join(tmpDir, 'page');
    try {
      await execFileAsync(config.pdftoppmBin, ['-r', '200', '-png', filePath, prefix]);
      const files = (await fs.readdir(tmpDir)).filter((f) => f.endsWith('.png')).sort();

      if (files.length === 0) {
        return { text: '', pageCount: 0, method: 'ocr', confidence: 0 };
      }

      const pageTexts: string[] = [];
      const confidences: number[] = [];
      for (const file of files) {
        const { text, confidence } = await this.runTesseract(path.join(tmpDir, file));
        pageTexts.push(text);
        confidences.push(confidence);
      }

      const avgConfidence =
        confidences.reduce((a, b) => a + b, 0) / Math.max(confidences.length, 1);

      return {
        text: pageTexts.join('\n\n--- page break ---\n\n'),
        pageCount: files.length,
        method: 'ocr',
        confidence: avgConfidence,
      };
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  private async runTesseract(imagePath: string): Promise<{ text: string; confidence: number }> {
    // `tesseract <img> stdout --psm 3 tsv` would give per-word confidence;
    // for demo purposes we use plain text output plus a coarse confidence
    // derived from the fraction of alphanumeric-vs-noise characters, which
    // is a real (if crude) signal of OCR quality without a second pass.
    const { stdout } = await execFileAsync(config.tesseractBin, [imagePath, 'stdout']);
    const text = stdout.trim();
    const confidence = estimateOcrConfidence(text);
    return { text, confidence };
  }
}

function estimateOcrConfidence(text: string): number {
  if (text.length === 0) return 0;
  const alnumRatio = (text.match(/[a-zA-Z0-9]/g)?.length ?? 0) / text.length;
  // Clamp into a believable OCR confidence band.
  return Math.max(0.4, Math.min(0.95, 0.5 + alnumRatio * 0.5));
}

/**
 * DocumentExtractor: the single entry point the pipeline calls. It decides
 * PDF-text vs. OCR (falling back to OCR automatically when the PDF's text
 * layer is empty/near-empty, i.e. a scanned document), and normalizes both
 * paths to the same ExtractionResult shape.
 */
export class DocumentExtractor {
  private pdfTextExtractor = new PdfTextExtractor();
  private ocrExtractor = new OCRExtractor();

  async extract(filePath: string, fileType: string): Promise<ExtractionResult> {
    if (fileType === 'application/pdf') {
      const textResult = await this.pdfTextExtractor.extract(filePath);
      if (textResult.confidence >= 0.5) {
        return textResult;
      }
      // Likely a scanned/image-only PDF -- fall back to OCR.
      return this.ocrExtractor.extract(filePath, fileType);
    }

    if (fileType === 'image/png' || fileType === 'image/jpeg') {
      return this.ocrExtractor.extract(filePath, fileType);
    }

    throw new Error(`No extractor available for file type "${fileType}"`);
  }
}
