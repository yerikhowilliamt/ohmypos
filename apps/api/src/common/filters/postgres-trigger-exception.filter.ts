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

/** body-parser's oversized-body error, matched by its documented `type` (ERR-046). */
function isPayloadTooLarge(exception: unknown): boolean {
  return (
    typeof exception === 'object' &&
    exception !== null &&
    (exception as { type?: unknown }).type === 'entity.too.large'
  );
}

/**
 * Global exception filter: passes `HttpException`s through, maps oversized
 * bodies to 413 and trigger rejections to 400, and logs anything else as 500.
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
      // warn, not error: anonymous callers can trigger this before the throttler.
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
      // A database-enforced invariant (currently only the allocation-sum trigger).
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

    // Never log the payload (Playbook §9).
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
