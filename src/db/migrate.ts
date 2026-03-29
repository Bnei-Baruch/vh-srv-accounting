import { resolve } from 'path';
import runner from 'node-pg-migrate';
import { config } from '../common/config';
import { logger } from '../common/logger';

export async function runMigrations(): Promise<void> {
  logger.info('Running database migrations...');

  await runner({
    databaseUrl: {
      host: config.pgHost,
      port: parseInt(config.pgPort, 10),
      user: config.pgUser,
      password: config.pgPassword,
      database: config.pgDatabase,
    },
    migrationsTable: 'pgmigrations',
    dir: resolve(__dirname, 'migrations'),
    direction: 'up',
    log: (msg) => logger.info(msg),
  });

  logger.info('Migrations complete');
}
