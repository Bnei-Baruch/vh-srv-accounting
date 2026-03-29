import { createApp } from './api/app';
import { logger } from './common/logger';

process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'Uncaught exception');
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.fatal({ err: reason }, 'Unhandled rejection');
  process.exit(1);
});

async function main() {
  const app = await createApp();

  process.on('SIGTERM', async () => {
    logger.info('SIGTERM received, shutting down...');
    await app.shutdown();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    logger.info('SIGINT received, shutting down...');
    await app.shutdown();
    process.exit(0);
  });

  await app.start();
}

main().catch((err) => {
  logger.fatal({ err }, 'Fatal startup error');
  process.exit(1);
});
