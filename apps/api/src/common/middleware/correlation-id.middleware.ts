import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { NextFunction, Request, Response } from 'express';

/**
 * Ported from Kasync (Playbook §9 — structured logging, correlation IDs).
 * Phase 14 (E-7) adds echoing the id back on the response: previously it was
 * only ever generated/read for the log line, so a caller had no way to quote
 * it back when reporting an error — the log and the caller had no shared key.
 */
@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const correlationId =
      (req.headers['x-correlation-id'] as string) || randomUUID();
    req.headers['x-correlation-id'] = correlationId;
    res.setHeader('x-correlation-id', correlationId);
    next();
  }
}
