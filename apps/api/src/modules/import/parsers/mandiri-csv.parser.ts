import {
  BankParser,
  ParsedTransaction,
} from '../interfaces/bank-parser.interface';
import { parse } from 'csv-parse/sync';
import * as crypto from 'crypto';
import { TransactionType } from '../../../generated/prisma/enums';
import Decimal from 'decimal.js';

export class MandiriCsvParser implements BankParser {
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

      const description = (record[1] ?? '').trim();
      const rawRef = (record[2] ?? '').trim();
      const externalRef = rawRef.length > 0 ? rawRef : null;

      const inflowRaw = (record[3] ?? '').replace(/,/g, '').trim();
      const outflowRaw = (record[4] ?? '').replace(/,/g, '').trim();

      let amount = '0.00';
      let type: TransactionType = TransactionType.OUTFLOW;

      try {
        const inflowVal = new Decimal(inflowRaw || 0);
        const outflowVal = new Decimal(outflowRaw || 0);

        if (
          !inflowVal.isNaN() &&
          inflowVal.isFinite() &&
          inflowVal.greaterThan(0)
        ) {
          amount = inflowVal.toFixed(2);
          type = TransactionType.INFLOW;
        } else if (
          !outflowVal.isNaN() &&
          outflowVal.isFinite() &&
          outflowVal.greaterThan(0)
        ) {
          amount = outflowVal.toFixed(2);
          type = TransactionType.OUTFLOW;
        } else {
          continue;
        }
      } catch {
        continue;
      }

      let dedupHash: string | null = null;
      if (!externalRef) {
        const baseSignature = `${txnDate.toISOString()}_${description}_${amount}_${type}`;
        const count = signatureCounts.get(baseSignature) ?? 0;
        signatureCounts.set(baseSignature, count + 1);

        const dedupRaw =
          count === 0 ? baseSignature : `${baseSignature}_${count}`;
        dedupHash = crypto.createHash('sha256').update(dedupRaw).digest('hex');
      }

      parsed.push({
        txnDate,
        amount,
        type,
        description,
        externalRef,
        dedupHash,
      });
    }

    return Promise.resolve(parsed);
  }
}
