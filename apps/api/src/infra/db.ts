/**
 * Database infrastructure: connection pool and Kysely query builder.
 */
import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import type { Logger } from 'pino';
import type { Config } from '../server/config';

/**
 * Database schema types (placeholder for actual schema).
 * Update this with the actual database types from migrations.
 */
export interface Database {
  // This will be populated by actual schema definitions
  // from packages/db
  never: never;
}

/**
 * Create a Kysely instance with PostgreSQL dialect and connection pooling.
 */
export function createDb(config: Config, logger: Logger): Kysely<Database> {
  const pool = new Pool({
    connectionString: config.DATABASE_URL,
    max: config.DATABASE_POOL_MAX,
    min: config.DATABASE_POOL_MIN,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  });

  pool.on('error', (err) => {
    logger.error({ err }, 'Unexpected connection pool error');
  });

  const db = new Kysely<Database>({
    dialect: new PostgresDialect({
      pool,
    }),
  });

  logger.info(
    {
      maxConnections: config.DATABASE_POOL_MAX,
      minConnections: config.DATABASE_POOL_MIN,
    },
    'Database pool initialized',
  );

  return db;
}

/**
 * Close database connection pool and release resources.
 */
export async function closeDb(db: Kysely<Database>): Promise<void> {
  await db.destroy();
}
