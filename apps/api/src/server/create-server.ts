/**
 * Fastify server creation and bootstrap.
 */
import Fastify, { FastifyInstance } from 'fastify'
import fastifyHelmet from '@fastify/helmet'
import fastifyCors from '@fastify/cors'
import fastifyRateLimit from '@fastify/rate-limit'
import { v4 as uuidv4 } from 'uuid'
import type { Logger } from 'pino'
import type { Kysely } from 'kysely'
import type { Config } from './config'
import type { Database } from '../infra/db'
import type { RabbitMQClient } from '../infra/rabbitmq'
import type { Metrics } from '../infra/metrics'
import { registerHealthRoutes } from '../modules/health/health.route'

/**
 * Application context shared across modules.
 */
export interface AppContext {
  config: Config
  logger: Logger
  db: Kysely<Database>
  rabbitmq: RabbitMQClient
  metrics: Metrics
}

/**
 * Create and configure Fastify server instance.
 */
export async function createServer(context: AppContext): Promise<FastifyInstance> {
  const app = Fastify({
    trustProxy: true,
    bodyLimit: 1048576, // 1MB default
    logger: false, // Use custom pino logger
    requestIdHeader: 'x-request-id',
    requestIdLogLabel: 'requestId',
    genReqId: () => uuidv4(),
  })

  // Register plugins
  await app.register(fastifyHelmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
      },
    },
  })

  await app.register(fastifyCors, {
    origin: context.config.ALLOWED_ORIGINS,
    credentials: true,
  })

  if (context.config.ENABLE_RATE_LIMITING) {
    await app.register(fastifyRateLimit, {
      max: context.config.RATE_LIMIT_MAX,
      timeWindow: `${context.config.RATE_LIMIT_TTL}s`,
    })
  }

  // Add correlation ID to logger context
  app.addHook('onRequest', async (request, reply) => {
    request.log = context.logger.child({
      requestId: request.id,
      method: request.method,
      url: request.url,
    })
  })

  // Register route modules
  await registerHealthRoutes(app, context.logger, context.db)

  // Add metrics endpoint
  app.get('/metrics', async (request, reply) => {
    reply.type('text/plain')
    return context.metrics.registry.metrics()
  })

  // Global error handler
  app.setErrorHandler((error, request, reply) => {
    request.log.error({ err: error }, 'Request error')

    const statusCode = (error as any).statusCode || 500
    const code = (error as any).code || 'internal_error'
    const message = error.message || 'An unexpected error occurred'

    context.metrics.httpErrorCount.labels(
      request.method,
      request.url,
      code
    ).inc()

    return reply.code(statusCode).send({
      success: false,
      error: {
        code,
        message,
      },
      meta: {
        requestId: request.id,
      },
    })
  })

  return app
}

/**
 * Start server and listen on configured port.
 */
export async function startServer(
  app: FastifyInstance,
  config: Config,
  logger: Logger
): Promise<void> {
  try {
    await app.listen({ port: config.PORT, host: '0.0.0.0' })
    logger.info({ port: config.PORT }, 'Server started')
  } catch (error) {
    logger.error({ error }, 'Failed to start server')
    throw error
  }
}

/**
 * Graceful shutdown.
 */
export async function closeServer(app: FastifyInstance, logger: Logger): Promise<void> {
  logger.info('Shutting down server...')
  await app.close()
  logger.info('Server closed')
}
