/**
 * Structured logging setup using Pino.
 */
import pino, { Logger } from 'pino';
import type { Config } from './config';

/**
 * Create a logger instance configured with the appropriate level and transport.
 */
export function createLogger(config: Config): Logger {
  const isDevelopment = config.NODE_ENV === 'development';

  return pino(
    {
      level: config.LOG_LEVEL,
      timestamp: !isDevelopment,
      transport: isDevelopment
        ? {
            target: 'pino-pretty',
            options: {
              colorize: true,
              singleLine: false,
              translateTime: 'SYS:standard',
            },
          }
        : undefined,
    },
    pino.destination({
      sync: isDevelopment,
    }),
  );
}

/**
 * Create a child logger with additional context (e.g., request ID).
 */
export function createChildLogger(logger: Logger, context: Record<string, unknown>): Logger {
  return logger.child(context);
}
