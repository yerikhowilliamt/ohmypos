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
    const signatureCounts = new Map<string, number>();

    for (const record of records) {
      if (record.length < 5) continue;

      const dateStr = (record[0] ?? '').trim();
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

      let description = (record[1] ?? '').trim();
      const branchRef = (record[2] ?? '').trim();
      if (branchRef && branchRef.length > 0 && branchRef !== '0000') {
        description += ` - ${branchRef}`;
      }

      const rawAmount = (record[3] ?? '').replace(/,/g, '').trim();
      let amount: string;
      try {
        const dec = new Decimal(rawAmount);
        if (dec.isNaN() || !dec.isFinite() || dec.lessThanOrEqualTo(0)) {
          continue;
        }
        amount = dec.toFixed(2);
      } catch {
        continue;
      }

      const typeStr = (record[4] ?? '').trim().toUpperCase();
      let type: TransactionType;
      if (typeStr === 'CR') {
        type = TransactionType.INFLOW;
      } else if (typeStr === 'DB') {
        type = TransactionType.OUTFLOW;
      } else {
        // Skip unrecognised / malformed transaction types (e.g. 'CREDIT', empty string)
        continue;
      }

      const baseSignature = `${txnDate.toISOString()}_${description}_${amount}_${type}`;
      const count = signatureCounts.get(baseSignature) ?? 0;
      signatureCounts.set(baseSignature, count + 1);

      const dedupRaw =
        count === 0 ? baseSignature : `${baseSignature}_${count}`;
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
