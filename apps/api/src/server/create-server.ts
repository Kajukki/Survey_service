/**
 * Fastify server creation and bootstrap.
 */
import Fastify, { FastifyInstance } from 'fastify';
import fastifyHelmet from '@fastify/helmet';
import fastifyCors from '@fastify/cors';
import fastifyRateLimit from '@fastify/rate-limit';
import { randomUUID } from 'node:crypto';
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from 'fastify-type-provider-zod';
import type { Logger } from 'pino';
import type { Kysely } from 'kysely';
import type { Database } from '@survey-service/db';
import type { Config } from './config';
import type { RabbitMQClient } from '../infra/rabbitmq';
import type { Metrics } from '../infra/metrics';
import { registerHealthRoutes } from '../modules/health/health.route';
import { authRoutes } from '../modules/auth/auth.route';
import { connectionsRoutes } from '../modules/connections/connections.route';
import { formsRoutes } from '../modules/forms/forms.route';
import { sharingRoutes } from '../modules/sharing/sharing.route';
import { jobsRoutes } from '../modules/jobs/jobs.route';
import { exportsRoutes } from '../modules/exports/exports.route';
import { dashboardRoutes } from '../modules/dashboard/dashboard.route';
import { registerGoogleAuthRoutes } from '../modules/providers/google/google-auth.route';
import { registerPrincipalPlugin } from './principal';

/**
 * Application context shared across modules.
 */
export interface AppContext {
  config: Config;
  logger: Logger;
  db: Kysely<Database>;
  rabbitmq: RabbitMQClient;
  metrics: Metrics;
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
    genReqId: () => randomUUID(),
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  // Register plugins
  await app.register(fastifyHelmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
      },
    },
  });

  await app.register(fastifyCors, {
    origin: context.config.ALLOWED_ORIGINS,
    credentials: true,
  });

  if (context.config.ENABLE_RATE_LIMITING) {
    await app.register(fastifyRateLimit, {
      max: context.config.RATE_LIMIT_MAX,
      timeWindow: `${context.config.RATE_LIMIT_TTL}s`,
    });
  }

  await registerPrincipalPlugin(app, context.config);

  // Add correlation ID to logger context
  app.addHook('onRequest', async (request) => {
    context.logger.debug(
      {
        requestId: request.id,
        method: request.method,
        url: request.url,
      },
      'Incoming request',
    );
  });

  // Register route modules
  // Infrastructure routes (probes/metrics)
  await registerHealthRoutes(app, context.logger, context.db, context.rabbitmq);

  // Business logic routes prefixed with /api/v1
  app.register(
    async (_api) => {
      // Add domain modules here
      await authRoutes(_api, {
        db: context.db,
        config: context.config,
      });
      await registerGoogleAuthRoutes(_api, {
        db: context.db,
        config: context.config,
      });
      await connectionsRoutes(_api, {
        db: context.db,
        config: context.config,
      });
      await formsRoutes(_api, {
        db: context.db,
        logger: context.logger,
        metrics: context.metrics,
      });
      await sharingRoutes(_api, {
        db: context.db,
      });
      await jobsRoutes(_api, {
        db: context.db,
        logger: context.logger,
        metrics: context.metrics,
      });
      await exportsRoutes(_api, {
        db: context.db,
      });
      await dashboardRoutes(_api, {
        db: context.db,
      });
    },
    { prefix: '/api/v1' },
  );

  // Add metrics endpoint
  app.get('/metrics', async (_request, reply) => {
    reply.type('text/plain');
    return context.metrics.registry.metrics();
  });

  // Global error handler
  app.setErrorHandler((error, request, reply) => {
    context.logger.error(
      {
        requestId: request.id,
        method: request.method,
        url: request.url,
        err: {
          name: error.name,
          message: error.message,
          code: error.code,
          statusCode: error.statusCode,
          stack: error.stack,
        },
      },
      'Request error',
    );

    const statusCode = error.statusCode || 500;
    const code = error.code || 'internal_error';
    const message =
      statusCode >= 500 ? 'Internal Server Error' : error.message || 'An unexpected error occurred';

    context.metrics.httpErrorCount.labels(request.method, request.url, code).inc();

    return reply.code(statusCode).send({
      success: false,
      error: {
        code,
        message,
      },
      meta: {
        requestId: request.id,
      },
    });
  });

  return app;
}

/**
 * Start server and listen on configured port.
 */
export async function startServer(
  app: FastifyInstance,
  config: Config,
  logger: Logger,
): Promise<void> {
  try {
    await app.listen({ port: config.PORT, host: '0.0.0.0' });
    logger.info({ port: config.PORT }, 'Server started');
  } catch (error) {
    logger.error({ error }, 'Failed to start server');
    throw error;
  }
}

/**
 * Graceful shutdown.
 */
export async function closeServer(app: FastifyInstance, logger: Logger): Promise<void> {
  logger.info('Shutting down server...');
  await app.close();
  logger.info('Server closed');
}
