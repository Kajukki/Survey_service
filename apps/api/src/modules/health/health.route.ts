/**
 * Health check route for liveness and readiness probes.
 */
import type { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify'
import type { Logger } from 'pino'
import type { Kysely } from 'kysely'
import type { Database } from '../infra/db'

/**
 * Health check response.
 */
export interface HealthResponse {
  status: 'ok' | 'degraded'
  service: string
  timestamp: string
  checks: {
    database: boolean
    rabbitmq: boolean
  }
}

/**
 * Health check handler.
 */
export async function getHealth(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<HealthResponse> {
  // These would be populated with actual checks
  const health: HealthResponse = {
    status: 'ok',
    service: 'api',
    timestamp: new Date().toISOString(),
    checks: {
      database: true,
      rabbitmq: true,
    },
  }

  return reply.code(200).send(health)
}

/**
 * Register health routes.
 */
export async function registerHealthRoutes(
  app: FastifyInstance,
  logger: Logger,
  db: Kysely<Database>
): Promise<void> {
  app.get('/health', getHealth)
  
  logger.info('Health routes registered')
}
