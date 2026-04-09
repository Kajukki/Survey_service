/**
 * Prometheus metrics instrumentation for observability.
 */
import { Counter, Histogram, Registry } from 'prom-client';

/**
 * Metrics collection with standard naming convention.
 */
export interface Metrics {
  registry: Registry;
  // HTTP metrics
  httpRequestDuration: Histogram;
  httpRequestCount: Counter;
  httpErrorCount: Counter;
  // Auth metrics
  authFailureCount: Counter;
  authzFailureCount: Counter;
  // Queue metrics
  queuePublishDuration: Histogram;
  queuePublishErrorCount: Counter;
  // Sync/outbox metrics
  syncEnqueueDuration: Histogram;
  outboxLagSeconds: Histogram;
  outboxPublishFailureCount: Counter;
}

/**
 * Create and initialize metrics collectors.
 */
export function createMetrics(): Metrics {
  const registry = new Registry();

  const httpRequestDuration = new Histogram({
    name: 'http_request_duration_seconds',
    help: 'HTTP request duration in seconds',
    labelNames: ['method', 'path', 'status'],
    registers: [registry],
  });

  const httpRequestCount = new Counter({
    name: 'http_requests_total',
    help: 'Total HTTP requests',
    labelNames: ['method', 'path', 'status'],
    registers: [registry],
  });

  const httpErrorCount = new Counter({
    name: 'http_errors_total',
    help: 'Total HTTP errors',
    labelNames: ['method', 'path', 'error_code'],
    registers: [registry],
  });

  const authFailureCount = new Counter({
    name: 'auth_failures_total',
    help: 'Total authentication failures',
    labelNames: ['reason'],
    registers: [registry],
  });

  const authzFailureCount = new Counter({
    name: 'authz_failures_total',
    help: 'Total authorization failures',
    labelNames: ['resource', 'operation'],
    registers: [registry],
  });

  const queuePublishDuration = new Histogram({
    name: 'queue_publish_duration_seconds',
    help: 'Message publish duration in seconds',
    labelNames: ['queue', 'status'],
    registers: [registry],
  });

  const queuePublishErrorCount = new Counter({
    name: 'queue_publish_errors_total',
    help: 'Total message publish errors',
    labelNames: ['queue', 'error_code'],
    registers: [registry],
  });

  const syncEnqueueDuration = new Histogram({
    name: 'sync_enqueue_duration_seconds',
    help: 'End-to-end API command latency to enqueue a sync job',
    labelNames: ['trigger', 'target'],
    registers: [registry],
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
  });

  const outboxLagSeconds = new Histogram({
    name: 'outbox_lag_seconds',
    help: 'Lag between command enqueue time and outbox publish attempt',
    labelNames: ['event_type'],
    registers: [registry],
    buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60, 120, 300],
  });

  const outboxPublishFailureCount = new Counter({
    name: 'outbox_publish_failures_total',
    help: 'Total outbox publish attempts that failed',
    labelNames: ['event_type', 'error_code'],
    registers: [registry],
  });

  return {
    registry,
    httpRequestDuration,
    httpRequestCount,
    httpErrorCount,
    authFailureCount,
    authzFailureCount,
    queuePublishDuration,
    queuePublishErrorCount,
    syncEnqueueDuration,
    outboxLagSeconds,
    outboxPublishFailureCount,
  };
}
