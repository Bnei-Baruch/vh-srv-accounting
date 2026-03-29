import 'dotenv/config';

function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val) throw new Error(`Missing required environment variable: ${name}`);
  return val;
}

function optionalEnv(name: string, defaultVal = ''): string {
  return process.env[name] ?? defaultVal;
}

export const config = {
  port: optionalEnv('APP_PORT', '8190'),
  env: optionalEnv('APP_ENV', 'development'),
  gitSha: optionalEnv('GIT_SHA', 'local'),

  pgHost: requireEnv('PGHOST'),
  pgPort: optionalEnv('PGPORT', '5432'),
  pgUser: requireEnv('PGUSER'),
  pgPassword: requireEnv('PGPASSWORD'),
  pgDatabase: requireEnv('PGDATABASE'),

  keycloakServerUrl: requireEnv('KEYCLOAK_SERVER_URL'),
  keycloakRealm: requireEnv('KEYCLOAK_REALM'),
  keycloakClientId: requireEnv('KEYCLOAK_CLIENT_ID'),
  keycloakClientSecret: requireEnv('KEYCLOAK_CLIENT_SECRET'),

  qbClientId: requireEnv('QB_CLIENT_ID'),
  qbClientSecret: requireEnv('QB_CLIENT_SECRET'),
  qbEnvironment: optionalEnv('QB_ENVIRONMENT', 'sandbox'),
  qbRedirectUri: requireEnv('QB_REDIRECT_URI'),

  sentryDsn: optionalEnv('SENTRY_DSN'),
} as const;

export type Config = typeof config;
