import { Injectable, BadRequestException } from '@nestjs/common';
import { BankParser } from './interfaces/bank-parser.interface';
import { BcaCsvParser } from './parsers/bca-csv.parser';
import { BcaPdfParser } from './parsers/bca-pdf.parser';
import { MandiriCsvParser } from './parsers/mandiri-csv.parser';
import { MandiriPdfParser } from './parsers/mandiri-pdf.parser';

@Injectable()
export class BankParserFactory {
  getParser(format: string): BankParser {
    switch (format.toUpperCase()) {
      case 'BCA':
        return new BcaCsvParser();
      case 'MANDIRI':
        return new MandiriCsvParser();
      case 'BCA_PDF':
        return new BcaPdfParser();
      case 'MANDIRI_PDF':
        return new MandiriPdfParser();
      default:
        throw new BadRequestException(
          `Format berkas "${format}" tidak didukung. Gunakan CSV, atau PDF e-statement BCA / Mandiri Livin.`,
        );
    }
  }
}
