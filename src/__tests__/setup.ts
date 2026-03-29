import 'dotenv/config';
import { Pool } from 'pg';
import runner from 'node-pg-migrate';
import { resolve } from 'path';
import express, { Router } from 'express';
import session from 'express-session';
import KeycloakConnect from 'keycloak-connect';
import { errorHandler } from '../middleware/errorHandler';

// Test DB is the same host/user/pass as dev, but database name gets a _test suffix
const testDatabase = process.env.PGDATABASE_TEST ?? `${process.env.PGDATABASE ?? 'accounting'}_test`;

function dbConfig() {
  return {
    host: process.env.PGHOST ?? 'localhost',
    port: parseInt(process.env.PGPORT ?? '5432', 10),
    user: process.env.PGUSER ?? 'user',
    password: process.env.PGPASSWORD ?? 'password',
    database: testDatabase,
  };
}

export function getTestDatabase(): string {
  return testDatabase;
}

export async function createTestPool(): Promise<Pool> {
  return new Pool({
    ...dbConfig(),
    connectionTimeoutMillis: 3000,
  });
}

export async function runTestMigrations(): Promise<void> {
  await runner({
    databaseUrl: dbConfig(),
    migrationsTable: 'pgmigrations',
    dir: resolve(__dirname, '../db/migrations'),
    direction: 'up',
    log: () => undefined,
  });
}

export interface TestClaims {
  email?: string;
  roles?: string[];
}

/**
 * Builds a minimal Express app for API handler tests.
 * Handles the keycloak mock boilerplate (session, mocked protect/middleware, req.kauth injection)
 * so each test file only needs to wire its own router and mocked dependencies.
 *
 * Requires `jest.mock('keycloak-connect')` in the calling test file.
 */
export function createTestApp(
  mountPath: string,
  makeRouter: (keycloak: KeycloakConnect.Keycloak) => Router,
  claims: TestClaims = {},
): express.Application {
  const email = claims.email ?? 'user@test.com';
  const roles = claims.roles ?? ['vh_admin'];

  const app = express();
  app.use(express.json());
  app.use(session({ secret: 'test', resave: false, saveUninitialized: false }));

  // KeycloakConnect is mocked by the test file via jest.mock('keycloak-connect').
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const keycloak = new (KeycloakConnect as any)({}, {}) as KeycloakConnect.Keycloak;
  (keycloak.protect as jest.Mock).mockReturnValue(
    (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
  );
  (keycloak as unknown as { middleware: jest.Mock }).middleware = jest
    .fn()
    .mockReturnValue((_req: express.Request, _res: express.Response, next: express.NextFunction) => next());

  // Inject Keycloak claims so permission helpers (hasAnyRole, isEmailOwnerOrHasAnyRole) can read them.
  // Cast via unknown: keycloak-connect's Token typings don't expose 'content'.
  app.use((req: express.Request, _res: express.Response, next: express.NextFunction) => {
    (req as express.Request & { kauth: unknown }).kauth = {
      grant: {
        access_token: {
          content: { email, sub: 'user-123', realm_access: { roles } },
        } as unknown as KeycloakConnect.Token,
      } as unknown as KeycloakConnect.Grant,
    };
    next();
  });

  app.use(keycloak.middleware());
  app.use(mountPath, makeRouter(keycloak));
  app.use(errorHandler);

  return app;
}
