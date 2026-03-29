import { Pool } from 'pg';
import { config } from '../common/config';
import { logger } from '../common/logger';

export let pool: Pool;

export function createPool(): Pool {
  pool = new Pool({
    host: config.pgHost,
    port: parseInt(config.pgPort, 10),
    user: config.pgUser,
    password: config.pgPassword,
    database: config.pgDatabase,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });

  pool.on('error', (err) => {
    logger.error({ err }, 'Unexpected PostgreSQL pool error');
  });

  return pool;
}

export async function checkDb(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('SELECT 1');
  } finally {
    client.release();
  }
}
