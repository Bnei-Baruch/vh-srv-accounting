/**
 * Interactive REPL for exploring the QuickBooks API.
 *
 * Usage:
 *   npx tsx scripts/repl.ts
 *
 * With Cursor / VS Code debugger (attach mode):
 *   node --inspect -r tsx/cjs scripts/repl.ts
 *   Then "Attach to Node Process" in your IDE.
 *
 * Available globals in the REPL:
 *   pool          — pg Pool (raw queries)
 *   store         — TokenStore
 *   manager       — TokenManager (getAccessToken, getHealth, etc.)
 *   apiClient     — QbApiClient
 *   qb(companyId) — resolves to a ready OAuthClient with token set
 *   fetch(companyId, path, params?) — GET helper against QB REST API
 *   companies()   — list all connected companies from the DB
 *   config        — app config object
 *
 * Example session:
 *   > const cos = await companies()
 *   > const id = cos[0].companyId
 *   > const client = await qb(id)
 *   > const res = await fetch(id, '/query', { query: "SELECT * FROM Customer MAXRESULTS 5" })
 *   > console.dir(res, { depth: null })
 */

import repl from 'node:repl';
import { createPool } from '../src/db/pool';
import { TokenStore } from '../src/quickbooks/tokenStore';
import { TokenManager } from '../src/quickbooks/tokenManager';
import { QbApiClient } from '../src/quickbooks/apiClient';
import { config } from '../src/common/config';
import { QbProvider } from '../src/common/consts';

async function main() {
  // Wire up the stack (same as app.ts, minus express/keycloak/sentry)
  const pool = createPool();
  const store = new TokenStore(pool);
  const manager = new TokenManager(store);

  // Start manager so tokens are proactively refreshed (same as prod)
  await manager.start();

  const apiClient = new QbApiClient(manager);

  // Convenience: get a ready OAuthClient for a company
  async function qb(companyId: string) {
    return apiClient.getClient(companyId);
  }

  // Convenience: GET against QB REST API, returns parsed JSON body
  async function fetch(
    companyId: string,
    path: string,
    params: Record<string, string> = {},
  ) {
    const client = await apiClient.getClient(companyId);
    const base = apiClient.getBaseUrl(companyId);
    const url = new URL(base + path);
    url.searchParams.set('minorversion', '70');
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
    console.log('url', url.toString());
    const response = await client.makeApiCall({
      url: url.toString(),
      method: 'GET',
    });
    console.log('response', response);
    return response;
  }

  // Convenience: list all companies from the DB
  async function companies() {
    return store.getAllTokens(QbProvider);
  }

  console.log('\n=== QB REPL ===');
  console.log('Globals: pool, store, manager, apiClient, qb(), fetch(), companies(), config');
  console.log('Type .exit to quit.\n');

  // Print connected companies as a quick sanity check
  const cos = await companies();
  if (cos.length === 0) {
    console.log('No companies in DB yet.\n');
  } else {
    console.log('Connected companies:');
    for (const c of cos) {
      console.log(`  ${c.companyId}  ${c.companyName ?? '(unnamed)'}  enabled=${c.enabled}`);
    }
    console.log();
  }

  const r = repl.start({ prompt: 'qb> ', useGlobal: false });

  // Inject globals into the REPL context
  Object.assign(r.context, {
    pool,
    store,
    manager,
    apiClient,
    qb,
    fetch,
    companies,
    config,
  });

  r.on('exit', async () => {
    manager.stop();
    await pool.end();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
