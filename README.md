# vh-srv-accounting

Accounting integrations service. Currently integrates **QuickBooks Online** via OAuth 2.0.
Built to extend: future providers (Priority ERP, etc.) follow the same pattern under `/v1/<provider>`.

## Stack

| Layer | Library |
|---|---|
| HTTP | Express 4 |
| Auth (incoming) | Keycloak (`keycloak-connect`, bearer-only) |
| Auth (outbound QB) | `intuit-oauth` — token lifecycle managed by `TokenManager` |
| Database | PostgreSQL via `pg` (raw SQL, no ORM) |
| Migrations | `node-pg-migrate` (auto-run on startup) |
| Logging | `pino` + `pino-http` |
| Error tracking | Sentry |
| Testing | Jest + `ts-jest` + `supertest` |
| Runtime | Node 22 / TypeScript strict |

## Prerequisites

- Node 22+
- [go-task](https://taskfile.dev) (`brew install go-task`)
- Docker (for the dev database)
- A QuickBooks developer app — [developer.intuit.com](https://developer.intuit.com)

## Getting started

```sh
cp env.dev .env        # then fill in QB_CLIENT_ID, QB_CLIENT_SECRET, Keycloak vars
task dev               # init .env, ensure DB, run with tsx watch
```

`task dev` connects to a shared `vh-dev-db` Docker container. Use `task dev:standalone` to spin up a local Postgres instead.

## Common tasks

```sh
task dev                  # run against shared dev DB
task dev:standalone       # run with standalone Postgres (docker-compose.dev.yml)
task test                 # run Jest tests
task test COVERAGE=true   # with coverage report
task lint                 # ESLint
task build                # tsc → dist/
task docker:build         # build Docker image
task db:shell             # psql into dev DB
task db:drop              # drop service DB (careful)
```

## API

All routes are prefixed `/v1/quickbooks`. Protected routes require a Keycloak bearer token.

### Auth

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/auth/connect` | admin | Returns QB OAuth authorization URL |
| `GET` | `/auth/callback` | public | OAuth callback — exchanges code, stores tokens |
| `GET` | `/auth/status` | admin | Token health for all connected companies |

### Companies

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/companies` | admin | List connected QB companies |
| `GET` | `/companies/:id` | admin | Get single company |
| `PATCH` | `/companies/:id` | admin | Update `companyName` or `enabled` |
| `DELETE` | `/companies/:id` | admin | Disconnect company |
| `GET` | `/companies/:company_id/fetch?query=...` | admin | Forward raw QB query (debug) |

### Contributions

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/contributions?email=...` | email owner or admin | Get last 12-month contributions by currency |

### Health

```
GET /health   — DB connectivity check, no auth
```

## Environment variables

See `env.dev` for the full list with descriptions. Required vars:

```
PGHOST, PGUSER, PGPASSWORD, PGDATABASE
KEYCLOAK_SERVER_URL, KEYCLOAK_REALM, KEYCLOAK_CLIENT_ID, KEYCLOAK_CLIENT_SECRET
QB_CLIENT_ID, QB_CLIENT_SECRET, QB_REDIRECT_URI
```

Optional: `QB_ENVIRONMENT` (default: `sandbox`), `SENTRY_DSN`, `APP_PORT` (default: `8190`).

## Database

Single table: `oauth_tokens` — one row per `(provider, company_id)`.
Migrations run automatically on startup from `src/db/migrations/`.

Tokens are never returned in API responses. `enabled=false` pauses a company's token refresh and excludes it from contribution aggregation.

## Development REPL

An interactive Node REPL for exploring the QB API directly:

```sh
# Via VS Code / Cursor task:
# Terminal > Run Task > QB REPL

# Or from the shell:
npx tsx scripts/repl.ts
```

Pre-loaded globals: `pool`, `store`, `manager`, `apiClient`, `qb(companyId)`, `fetch(companyId, path, params)`, `companies()`.
