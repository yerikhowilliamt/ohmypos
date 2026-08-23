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
