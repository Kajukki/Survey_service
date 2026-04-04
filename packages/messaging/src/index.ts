/**
 * RabbitMQ messaging topology, exchanges, queues, and routing.
 */
import { z } from 'zod'

/**
 * Exchange names.
 */
export const EXCHANGES = {
  SYNC: 'survey.sync',
  ANALYSIS: 'survey.analysis',
  DLX: 'survey.dlx', // Dead letter exchange
} as const

/**
 * Queue names.
 */
export const QUEUES = {
  SYNC_JOBS: 'survey.sync.jobs',
  ANALYSIS_JOBS: 'survey.analysis.jobs',
  DLQ: 'survey.dlq', // Dead letter queue
} as const

/**
 * Routing keys.
 */
export const ROUTING_KEYS = {
  SYNC_CONNECTION: 'sync.connection',
  SYNC_FORM: 'sync.form',
  ANALYSIS_ROLLUP: 'analysis.rollup',
} as const

/**
 * Sync job message payload schema.
 * Published by API and consumed by workers.
 */
export const SyncJobMessageSchema = z.object({
  jobId: z.string().uuid(),
  connectionId: z.string().uuid(),
  formId: z.string().uuid().optional(),
  requestedBy: z.string().min(1),
  trigger: z.enum(['manual', 'scheduled']),
  forceFullSync: z.boolean().default(false),
  timestamp: z.number(), // Unix ms
  retryCount: z.number().int().nonnegative().default(0),
})

export type SyncJobMessage = z.infer<typeof SyncJobMessageSchema>

/**
 * Analysis job message payload schema.
 */
export const AnalysisJobMessageSchema = z.object({
  jobId: z.string().uuid(),
  formId: z.string().uuid(),
  analysisType: z.enum(['rollup', 'distribution', 'timeseries']),
  requestedBy: z.string().min(1),
  timestamp: z.number(),
  retryCount: z.number().int().nonnegative().default(0),
})

export type AnalysisJobMessage = z.infer<typeof AnalysisJobMessageSchema>

/**
 * Dead letter message wrapper for failed processing.
 */
export const DeadLetterMessageSchema = z.object({
  originalMessage: z.unknown(),
  routingKey: z.string(),
  queue: z.string(),
  exchange: z.string(),
  failedAt: z.number(),
  error: z.string(),
  retries: z.number().int().nonnegative(),
})

export type DeadLetterMessage = z.infer<typeof DeadLetterMessageSchema>

/**
 * Queue configuration for creation.
 */
export const QUEUE_CONFIG = {
  [QUEUES.SYNC_JOBS]: {
    durable: true,
    arguments: {
      'x-dead-letter-exchange': EXCHANGES.DLX,
      'x-message-ttl': 86400000, // 24 hours
      'x-max-length': 1000000,
    },
  },
  [QUEUES.ANALYSIS_JOBS]: {
    durable: true,
    arguments: {
      'x-dead-letter-exchange': EXCHANGES.DLX,
      'x-message-ttl': 86400000,
      'x-max-length': 500000,
    },
  },
  [QUEUES.DLQ]: {
    durable: true,
    arguments: {
      'x-message-ttl': 604800000, // 7 days
      'x-max-length': 100000,
    },
  },
} as const

/**
 * Bindings configuration.
 */
export const BINDINGS = [
  {
    exchange: EXCHANGES.SYNC,
    queue: QUEUES.SYNC_JOBS,
    routingKey: 'sync.*',
  },
  {
    exchange: EXCHANGES.ANALYSIS,
    queue: QUEUES.ANALYSIS_JOBS,
    routingKey: 'analysis.*',
  },
] as const

/**
 * Publisher options for reliability.
 */
export const PUBLISHER_OPTIONS = {
  persistent: true,
  contentType: 'application/json',
  contentEncoding: 'utf-8',
} as const

/**
 * Consumer prefetch settings.
 */
export const CONSUMER_PREFETCH = 10
