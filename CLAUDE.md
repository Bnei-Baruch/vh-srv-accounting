# vh-srv-accounting

Node.js 24 / TypeScript service for accounting integrations. Currently: QuickBooks Online.
Future: Priority ERP and other providers will be added as `/v1/priority`, `/v1/...`.

## Project Structure

```
src/
  index.ts               Entry: load config → createApp() → start
  common/
    config.ts            Typed config from env vars (dotenv). Fatal if required vars missing.
    consts.ts            Roles (vh_root, vh_admin), QbProvider, ServiceName
    errors.ts            Custom error classes (NotFoundError, ValidationError)
    logger.ts            pino structured logger. Use logFor(req) in request handlers.
  db/
    pool.ts              pg Pool creation and checkDb() for health
    migrate.ts           Runs node-pg-migrate on startup
    migrations/          SQL files: NNN_name.up.sql / NNN_name.down.sql
  middleware/
    logging.ts           pino-http request logging with request IDs
    auth.ts              Creates Keycloak instance (bearer-only mode). No manual JWT parsing.
    sentry.ts            Sentry init + error handler middleware
    errorHandler.ts      Central Express error handler
  api/
    app.ts               Express app factory. Init chain: sentry→db→keycloak→tokenManager→routes→errors
    health.ts            GET /health — DB check only
    permissions.ts       hasAnyRole(), isEmailOwnerOrHasAnyRole() — port of orders' permissions.go
    quickbooks/
      router.ts          Mounts auth, companies, contributions under /v1/quickbooks
      authRouter.ts      GET /auth/connect (admin), GET /auth/callback (public), GET /auth/status (admin) — QB token health per company
      companiesHandler.ts CRUD /companies (admin only)
      contributionsHandler.ts GET /contributions?email=x (email owner or admin)
  quickbooks/
    oauthClient.ts       Thin wrapper around intuit-oauth library
    tokenStore.ts        Raw SQL CRUD on oauth_tokens table (no ORM)
    tokenManager.ts      Proactive token refresh, background job, per-company mutex, health
    apiClient.ts         QB API client skeleton — uses tokenManager for auth
    contributions.ts     STUB: getLastContributions() returns {} until QB entity is mapped
```

## Best Practices

- No ORM — raw SQL with `pg` library (same philosophy as orders service)
- No DI framework — dependencies wired manually in `api/app.ts`
- Errors: wrap with method name prefix: `throw new Error('tokenStore.getToken: ' + err.message)`
- Logging: always use `logFor(req)` in request handlers, `logger` elsewhere
- No `console.log` — use `logger`
- Context keys in `common/consts.ts`
- TypeScript strict mode — no `any` without comment explaining why

## Auth

**Incoming requests (Keycloak)**:
- Configured in bearer-only mode via `@keycloak/keycloak-nodejs-connect`
- `keycloak.protect()` on any route requiring auth
- `keycloak.protect('realm:vh_admin')` for admin-only routes
- Claims via `req.kauth.grant.access_token.content` (email, sub, realm_access.roles)
- Permission helpers in `src/api/permissions.ts` — never inline role checks

**Outgoing (QuickBooks OAuth)**:
- TokenManager handles all token lifecycle
- Never call `oauthClient.refreshAccessToken()` directly from handlers
- Always use `tokenManager.getAccessToken(companyId)` — it handles proactive refresh

## Database

Single table: `oauth_tokens`. One row per `(provider, company_id)`.
- `enabled=false`: excluded from contributions aggregation; token refresh paused
- Tokens (access_token, refresh_token) are **never** returned in API responses

Migrations in `src/db/migrations/`. Run automatically on startup via `runMigrations()`.
Format: `YYYYMMDDHHmmssSSS_description.up.sql` / `YYYYMMDDHHmmssSSS_description.down.sql` (17-digit timestamp, node-pg-migrate requirement).

## API Conventions

Response envelope (same as orders service):
```json
{ "message": "Fetched!", "data": ..., "success": true }
{ "message": "Updated!", "success": true }
{ "message": "Deleted!", "success": true }
{ "error": "...", "success": false }
```

HTTP status codes:
- 400: ValidationError
- 403: Unauthorized (keycloak.protect or permissions helpers)
- 404: NotFoundError
- 500: everything else (no body detail — logged + Sentry)

## QuickBooks Contributions (STUB)

`src/quickbooks/contributions.ts` currently returns `{}` for any email.

When the QB entity mapping is determined:
1. Find customer by email in QB
2. Fetch their transactions for the last 12 months
3. Sum amounts by currency (ISO code)
4. Return `Record<string, number>` — matches Priority's `GetLastContributions` contract

## Build and Run

Uses [go-task](https://taskfile.dev). Run `task --list` to see all tasks.

```sh
task dev                  # init .env, ensure DB (shared vh-dev-db), run service
task dev:standalone       # start standalone Postgres, run service
task test                 # run jest tests
task test COVERAGE=true   # with coverage report
task lint                 # eslint
task build                # tsc
task docker:build         # build Docker image
task db:shell             # psql into dev DB
task db:drop              # drop service DB
```

## Tech Stack

| Component     | Library                              |
|---------------|--------------------------------------|
| HTTP          | express ^4                           |
| Auth          | @keycloak/keycloak-nodejs-connect    |
| Database      | pg (raw SQL, no ORM)                 |
| Migrations    | node-pg-migrate (SQL files)          |
| QB OAuth      | intuit-oauth (official Intuit SDK)   |
| Logging       | pino + pino-http                     |
| Error tracking| @sentry/node                         |
| Config        | dotenv + typed config object         |
| Testing       | jest + ts-jest + supertest           |
| Dev runner    | tsx                                  |
| Build         | tsc                                  |

No ORMs. No gRPC. No NestJS. No dependency injection framework.
