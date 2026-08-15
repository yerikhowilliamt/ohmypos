import {
  BankParser,
  ParsedTransaction,
} from '../interfaces/bank-parser.interface';
import { parse } from 'csv-parse/sync';
import * as crypto from 'crypto';
import { TransactionType } from '../../../generated/prisma/enums';
import Decimal from 'decimal.js';

export class BcaCsvParser implements BankParser {
  parse(fileBuffer: Buffer): Promise<ParsedTransaction[]> {
    const records = parse(fileBuffer, {
      skip_empty_lines: true,
      relax_column_count: true,
      trim: true,
    });

    const parsed: ParsedTransaction[] = [];

    for (const record of records) {
      if (record.length < 5) continue;

      const dateStr = record[0];
      if (!/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) {
        continue;
      }

      const [day, month, year] = dateStr.split('/');
      const m = Number(month);
      const d = Number(day);
      const y = Number(year);
      if (m < 1 || m > 12) continue;

      const daysInMonth = new Date(y, m, 0).getDate();
      if (d < 1 || d > daysInMonth) continue;

      const txnDate = new Date(Date.UTC(y, m - 1, d));

      let description = record[1];
      if (record[2] && record[2].length > 0 && record[2] !== '0000') {
        description += ` - ${record[2]}`;
      }

      const rawAmount = record[3].replace(/,/g, '');
      let amount: string;
      try {
        amount = new Decimal(rawAmount).toFixed(2);
      } catch {
        continue;
      }

      const typeStr = record[4].toUpperCase();
      const type =
        typeStr === 'CR' ? TransactionType.INFLOW : TransactionType.OUTFLOW;

      const dedupRaw = `${txnDate.toISOString()}_${description}_${amount}_${type}`;
      const dedupHash = crypto
        .createHash('sha256')
        .update(dedupRaw)
        .digest('hex');

      parsed.push({
        txnDate,
        amount,
        type,
        description,
        externalRef: null,
        dedupHash,
      });
    }

    return Promise.resolve(parsed);
  }
}
