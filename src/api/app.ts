import express from 'express';
import session from 'express-session';
import helmet from 'helmet';
import cors from 'cors';
import { Pool } from 'pg';

import { config } from '../common/config';
import { logger } from '../common/logger';
import { loggingMiddleware } from '../middleware/logging';
import { createKeycloak } from '../middleware/auth';
import { initSentry, sentryErrorHandler } from '../middleware/sentry';
import { errorHandler } from '../middleware/errorHandler';
import { createPool } from '../db/pool';
import { runMigrations } from '../db/migrate';
import { TokenStore } from '../quickbooks/tokenStore';
import { TokenManager } from '../quickbooks/tokenManager';
import { QbApiClient } from '../quickbooks/apiClient';
import { healthHandler } from './health';
import { createQuickBooksRouter } from './quickbooks/router';

export interface App {
  expressApp: express.Application;
  pool: Pool;
  tokenManager: TokenManager;
  start(): Promise<void>;
  shutdown(): Promise<void>;
}

export async function createApp(): Promise<App> {
  // 1. Sentry
  initSentry();

  // 2. Database
  const pool = createPool();
  await runMigrations();

  // 3. Keycloak
  const keycloak = createKeycloak();

  // 4. QuickBooks layer
  const tokenStore = new TokenStore(pool);
  const tokenManager = new TokenManager(tokenStore);
  const qbClient = new QbApiClient(tokenManager);

  // 5. Express app
  const app = express();

  app.use(helmet());
  if (config.env === 'development') {
    app.use(cors());
  }
  app.use(express.json());
  app.use(loggingMiddleware);

  // keycloak-nodejs-connect requires a session store. It's not really used for anything, but it's required.
  app.use(
    session({
      secret: config.keycloakClientSecret,
      resave: false,
      saveUninitialized: false,
    }),
  );
  app.use(keycloak.middleware());

  // 6. Routes
  app.get('/health', healthHandler);
  app.use('/v1/quickbooks', createQuickBooksRouter(keycloak, tokenStore, tokenManager, qbClient));

  // 7. Error handling
  app.use(sentryErrorHandler());
  app.use(errorHandler);

  return {
    expressApp: app,
    pool,
    tokenManager,

    async start() {
      await tokenManager.start();
      const port = parseInt(config.port, 10);
      app.listen(port, () => {
        logger.info({ port, env: config.env, gitSha: config.gitSha }, 'vh-srv-accounting started');
      });
    },

    async shutdown() {
      tokenManager.stop();
      await pool.end();
      logger.info('vh-srv-accounting shut down');
    },
  };
}
