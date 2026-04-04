/**
 * Prometheus metrics instrumentation for observability.
 */
import { Counter, Histogram, Registry } from 'prom-client'

/**
 * Metrics collection with standard naming convention.
 */
export interface Metrics {
  registry: Registry
  // HTTP metrics
  httpRequestDuration: Histogram
  httpRequestCount: Counter
  httpErrorCount: Counter
  // Auth metrics
  authFailureCount: Counter
  authzFailureCount: Counter
  // Queue metrics
  queuePublishDuration: Histogram
  queuePublishErrorCount: Counter
}

/**
 * Create and initialize metrics collectors.
 */
export function createMetrics(): Metrics {
  const registry = new Registry()

  const httpRequestDuration = new Histogram({
    name: 'http_request_duration_seconds',
    help: 'HTTP request duration in seconds',
    labelNames: ['method', 'path', 'status'],
    registers: [registry],
  })

  const httpRequestCount = new Counter({
    name: 'http_requests_total',
    help: 'Total HTTP requests',
    labelNames: ['method', 'path', 'status'],
    registers: [registry],
  })

  const httpErrorCount = new Counter({
    name: 'http_errors_total',
    help: 'Total HTTP errors',
    labelNames: ['method', 'path', 'error_code'],
    registers: [registry],
  })

  const authFailureCount = new Counter({
    name: 'auth_failures_total',
    help: 'Total authentication failures',
    labelNames: ['reason'],
    registers: [registry],
  })

  const authzFailureCount = new Counter({
    name: 'authz_failures_total',
    help: 'Total authorization failures',
    labelNames: ['resource', 'operation'],
    registers: [registry],
  })

  const queuePublishDuration = new Histogram({
    name: 'queue_publish_duration_seconds',
    help: 'Message publish duration in seconds',
    labelNames: ['queue', 'status'],
    registers: [registry],
  })

  const queuePublishErrorCount = new Counter({
    name: 'queue_publish_errors_total',
    help: 'Total message publish errors',
    labelNames: ['queue', 'error_code'],
    registers: [registry],
  })

  return {
    registry,
    httpRequestDuration,
    httpRequestCount,
    httpErrorCount,
    authFailureCount,
    authzFailureCount,
    queuePublishDuration,
    queuePublishErrorCount,
  }
}
