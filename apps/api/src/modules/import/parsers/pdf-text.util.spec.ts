import { extractPdfPages, isPdfBuffer } from './pdf-text.util';

/**
 * Minimal uncompressed PDF 1.4 template that contains searchable text.
 */
function createSimplePdfBuffer(textContent: string): Buffer {
  const streamContent = `BT /F1 12 Tf 52 492 Td (${textContent}) Tj ET`;
  const streamLength = Buffer.byteLength(streamContent);

  const pdf = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>
endobj
4 0 obj
<< /Length ${streamLength} >>
stream
${streamContent}
endstream
endobj
5 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000244 00000 n 
0000000300 00000 n 
trailer
<< /Size 6 /Root 1 0 R >>
startxref
377
%%EOF`;

  return Buffer.from(pdf, 'utf-8');
}

describe('extractPdfPages with modern pdfjs', () => {
  it('identifies PDF signature', () => {
    expect(isPdfBuffer(Buffer.from('%PDF-1.4 test'))).toBe(true);
    expect(isPdfBuffer(Buffer.from('not a pdf'))).toBe(false);
  });

  it('extracts text items with coordinates from a valid PDF buffer', async () => {
    const pdfBuf = createSimplePdfBuffer('Hello Mandiri');
    const pages = await extractPdfPages(pdfBuf);

    expect(pages).toHaveLength(1);
    expect(pages[0].length).toBeGreaterThan(0);
    expect(pages[0].some((item) => item.str.includes('Hello Mandiri'))).toBe(
      true,
    );
  });

  it('throws BadRequestException for invalid PDF', async () => {
    await expect(
      extractPdfPages(Buffer.from('%PDF-corrupted-bytes-here')),
    ).rejects.toThrow('File PDF rusak atau tidak dapat dibaca.');
  });
});
