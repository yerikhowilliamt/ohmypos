import { Injectable } from '@nestjs/common';
import {
  Counter,
  Histogram,
  Registry,
  collectDefaultMetrics,
} from 'prom-client';

@Injectable()
export class MetricsService {
  readonly registry = new Registry();

  readonly saleCreatedTotal = new Counter({
    name: 'ohmypos_sale_created_total',
    help: 'Total sales successfully created',
    registers: [this.registry],
  });

  readonly saleDurationSeconds = new Histogram({
    name: 'ohmypos_sale_duration_seconds',
    help: 'Duration of POST /sales requests, in seconds',
    buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
    registers: [this.registry],
  });

  /** Stock conflicts under ADR-007's row lock (409, never 500). */
  readonly stockConflictTotal = new Counter({
    name: 'ohmypos_stock_conflict_total',
    help: 'Total sales rejected for insufficient stock (409)',
    registers: [this.registry],
  });

  constructor() {
    collectDefaultMetrics({ register: this.registry });
  }

  metrics(): Promise<string> {
    return this.registry.metrics();
  }
}
