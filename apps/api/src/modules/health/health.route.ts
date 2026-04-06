/**
 * Health check route for liveness and readiness probes.
 */
import type { FastifyInstance } from 'fastify';
import type { Logger } from 'pino';
import { sql } from 'kysely';
import type { Kysely } from 'kysely';
import type { Database } from '@survey-service/db';
import type { RabbitMQClient } from '../../infra/rabbitmq';

/**
 * Health check response.
 */
export interface HealthResponse {
  status: 'ok' | 'degraded';
  service: string;
  timestamp: string;
  checks: {
    database: boolean;
    rabbitmq: boolean;
  };
}

/**
 * Register health routes.
 */
export async function registerHealthRoutes(
  app: FastifyInstance,
  logger: Logger,
  db: Kysely<Database>,
  rabbitmq: RabbitMQClient,
): Promise<void> {
  app.get('/health', async (request, reply) => {
    logger.debug({ requestId: request.id }, 'Running health check');

    let dbOk = false;
    let rmqOk = false;

    try {
      await sql`SELECT 1`.execute(db);
      dbOk = true;
    } catch (err) {
      logger.error({ err }, 'Database health check failed');
    }

    try {
      rmqOk = rabbitmq.isConnected();
    } catch (err) {
      logger.error({ err }, 'RabbitMQ health check failed');
    }

    const health: HealthResponse = {
      status: dbOk && rmqOk ? 'ok' : 'degraded',
      service: 'api',
      timestamp: new Date().toISOString(),
      checks: {
        database: dbOk,
        rabbitmq: rmqOk,
      },
    };

    return reply.code(health.status === 'ok' ? 200 : 503).send(health);
  });

  logger.info('Health routes registered');
}
