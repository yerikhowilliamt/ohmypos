import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { AllocationExceededError } from '../errors/allocation-exceeded.error';
import {
  PG_RAISE_EXCEPTION,
  extractPostgresError,
} from '../errors/postgres-error';

/**
 * Error dari `body-parser` saat body melewati batas ukuran. Ia bukan
 * `HttpException`, jadi tanpa penanganan khusus ia jatuh ke cabang 500 di
 * bawah — klien diberi tahu "an unexpected error occurred" untuk sesuatu yang
 * sepenuhnya salah dari sisi klien, dan setiap percobaan menulis satu baris
 * log level error.
 *
 * Dicocokkan lewat `type`, bukan `instanceof`: `body-parser` tidak mengekspor
 * kelasnya, dan `err.type === 'entity.too.large'` adalah kontrak yang memang
 * didokumentasikannya.
 */
function isPayloadTooLarge(exception: unknown): boolean {
  return (
    typeof exception === 'object' &&
    exception !== null &&
    (exception as { type?: unknown }).type === 'entity.too.large'
  );
}

/**
 * Translates database-trigger rejections into proper HTTP responses.
 *
 * Adapted from Kasync rather than ported verbatim: Kasync matched Prisma 5's
 * P2010/P2034 codes with the message inlined in `meta`, but Prisma 7 raises
 * P2039 and nests the PostgreSQL error under `meta.driverAdapterError.cause`
 * (see `postgres-error.ts`). Matching on the old shape would have let an
 * allocation-sum violation escape as a 500.
 */
@Catch()
export class PostgresTriggerExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(PostgresTriggerExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();

    if (exception instanceof HttpException) {
      return response
        .status(exception.getStatus())
        .json(exception.getResponse());
    }

    if (isPayloadTooLarge(exception)) {
      // Level warn, bukan error: body kebesaran adalah klien yang salah, bukan
      // server yang rusak. Body parsing berjalan di middleware Express sebelum
      // ThrottlerGuard, jadi pemanggil tanpa kredensial bisa memicu ini
      // sesering yang ia mau — mencatatnya di level error berarti menyerahkan
      // kendali kebisingan log (dan kuota Sentry) kepada siapa pun di internet.
      this.logger.warn(
        {
          correlationId: (
            host.switchToHttp().getRequest<{ id?: string }>() ?? {}
          ).id,
        },
        'Rejected an oversized request body',
      );
      return response.status(HttpStatus.PAYLOAD_TOO_LARGE).json({
        statusCode: HttpStatus.PAYLOAD_TOO_LARGE,
        error: 'Payload Too Large',
        message: 'Ukuran data yang dikirim melebihi batas yang diizinkan.',
      });
    }

    if (exception instanceof AllocationExceededError) {
      return response.status(HttpStatus.BAD_REQUEST).json({
        statusCode: HttpStatus.BAD_REQUEST,
        error: exception.name,
        message: exception.message,
      });
    }

    const pgError = extractPostgresError(exception);

    if (pgError?.code === PG_RAISE_EXCEPTION) {
      // A domain invariant enforced in the database — the client's request was
      // invalid, not the server. Currently only the allocation-sum trigger.
      const error = new AllocationExceededError({ message: pgError.message });
      return response.status(HttpStatus.BAD_REQUEST).json({
        statusCode: HttpStatus.BAD_REQUEST,
        error: error.name,
        message: error.message,
      });
    }

    const request = host.switchToHttp().getRequest<{
      method?: string;
      url?: string;
      id?: string;
    }>();

    // Log the entity/operation, never the payload (Playbook §9 — no PII in logs).
    this.logger.error(
      {
        err: exception,
        correlationId: request?.id,
        method: request?.method,
        url: request?.url,
      },
      `Unhandled exception: ${exception instanceof Error ? exception.name : typeof exception} — ${exception instanceof Error ? exception.message : ''}`,
    );

    return response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      error: 'Internal Server Error',
      message: 'An unexpected error occurred. Please try again later.',
    });
  }
}
