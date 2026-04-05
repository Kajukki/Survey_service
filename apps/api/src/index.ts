/**
 * Main entry point for the Survey Service API.
 * Bootstraps configuration, logger, database, and starts the server.
 */
import 'dotenv/config';
import { loadConfig } from './server/config';
import { createLogger } from './server/logging';
import { createMetrics } from './infra/metrics';
import { createDb } from './infra/db';
import { createRabbitMQClient } from './infra/rabbitmq';
import { createServer, startServer, closeServer } from './server/create-server';

/**
 * Application entry point with full initialization sequence.
 */
async function main(): Promise<void> {
  // 1. Load and validate configuration
  const config = loadConfig();

  // 2. Create logger
  const logger = createLogger(config);
  logger.info({ env: config.NODE_ENV }, 'Starting API server');

  try {
    // 3. Initialize infrastructure
    const db = createDb(config, logger);
    const rabbitmq = await createRabbitMQClient(config, logger);
    const metrics = createMetrics();

    // 4. Create server
    const app = await createServer({
      config,
      logger,
      db,
      rabbitmq,
      metrics,
    });

    // 5. Start listening
    await startServer(app, config, logger);

    // 6. Graceful shutdown on signals
    const signals = ['SIGINT', 'SIGTERM'];
    for (const signal of signals) {
      process.on(signal, async () => {
        logger.info({ signal }, 'Received shutdown signal');

        try {
          await closeServer(app, logger);
          await rabbitmq.close();
          await db.destroy();
          process.exit(0);
        } catch (error) {
          logger.error({ error }, 'Error during shutdown');
          process.exit(1);
        }
      });
    }
  } catch (error) {
    logger.error({ error }, 'Fatal initialization error');
    process.exit(1);
  }
}

// Start the application
main();
