import { BadRequestException } from '@nestjs/common';
import type {
  PDFDocumentProxy,
  PDFPageProxy,
  TextContent,
  TextItem,
} from 'pdfjs-dist/types/src/display/api';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js') as {
  getDocument: (params: {
    data: Uint8Array;
    password?: string;
    isEvalSupported: boolean;
    useSystemFonts: boolean;
    disableFontFace: boolean;
  }) => { promise: Promise<PDFDocumentProxy> };
};

/** A positioned text run, in PDF user-space points (origin bottom-left). */
export interface PdfTextItem {
  x: number;
  y: number;
  width: number;
  str: string;
}

/**
 * A 5 MB PDF can still hold thousands of pages, and parsing runs synchronously
 * in the request thread. Real statements are single-digit page counts.
 */
const MAX_PAGES = 100;

/** `%PDF-` — the file signature every PDF starts with. */
const PDF_MAGIC = '%PDF-';

/**
 * Content-based PDF detection. The multipart mimetype is client-supplied and
 * routinely wrong (browsers send `application/octet-stream` for both .csv and
 * .pdf), so the file signature is the only dependable signal.
 */
export function isPdfBuffer(buffer: Buffer): boolean {
  return buffer.subarray(0, PDF_MAGIC.length).toString('latin1') === PDF_MAGIC;
}

/**
 * Extracts positioned text runs, one array per page.
 *
 * Positions are kept rather than flattened to strings because bank statements
 * are tables: the reliable way to read one is to slice by column x-range, not
 * to regex a line whose columns were joined by a heuristic.
 *
 * Uses `pdfjs-dist` (legacy/node build) and supports optional password decryption.
 */
export async function extractPdfPages(
  fileBuffer: Buffer,
  options?: { password?: string },
): Promise<PdfTextItem[][]> {
  if (!isPdfBuffer(fileBuffer)) {
    throw new BadRequestException('File bukan PDF yang valid.');
  }

  const pages: PdfTextItem[][] = [];

  try {
    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(fileBuffer),
      password: options?.password,
      isEvalSupported: false,
      useSystemFonts: true,
      disableFontFace: true,
    });

    const doc: PDFDocumentProxy = await loadingTask.promise;
    const numPages = doc.numPages;

    if (numPages > MAX_PAGES) {
      throw new BadRequestException(
        `File PDF terlalu panjang (maksimal ${MAX_PAGES} halaman).`,
      );
    }

    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      const page: PDFPageProxy = await doc.getPage(pageNum);
      const content: TextContent = await page.getTextContent();

      const pageItems: PdfTextItem[] = [];
      for (const rawItem of content.items) {
        const item = rawItem as TextItem;
        if (
          typeof item.str === 'string' &&
          item.str.trim() !== '' &&
          Array.isArray(item.transform)
        ) {
          const x = item.transform[4] as number;
          const y = item.transform[5] as number;
          pageItems.push({
            x,
            y,
            width: item.width,
            str: item.str.trim(),
          });
        }
      }
      pages.push(pageItems);
    }
  } catch (caught) {
    if (caught instanceof BadRequestException) {
      throw caught;
    }

    const name = caught instanceof Error ? caught.name : '';
    const message = caught instanceof Error ? caught.message : '';
    const errString = String(caught);

    if (
      name === 'PasswordException' ||
      message.toLowerCase().includes('password') ||
      errString.toLowerCase().includes('password')
    ) {
      throw new BadRequestException(
        'File PDF terkunci kata sandi. Masukkan kata sandi yang sesuai atau buka proteksi PDF terlebih dahulu sebelum mengunggah.',
      );
    }
    if (
      name === 'InvalidPDFException' ||
      message.toLowerCase().includes('invalid pdf') ||
      message.toLowerCase().includes('bad xref') ||
      message.toLowerCase().includes('corrupted') ||
      errString.toLowerCase().includes('invalid') ||
      errString.toLowerCase().includes('format')
    ) {
      throw new BadRequestException('File PDF rusak atau tidak dapat dibaca.');
    }
    throw new BadRequestException('File PDF tidak dapat diproses.');
  }

  return pages;
}
