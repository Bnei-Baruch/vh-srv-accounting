import { TokenStore } from '../../quickbooks/tokenStore';
import { createTestPool, runTestMigrations } from '../setup';
import { Pool } from 'pg';

let pool: Pool;
let store: TokenStore;

beforeAll(async () => {
  pool = await createTestPool();
  await runTestMigrations();
  store = new TokenStore(pool);
});

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await pool.query('DELETE FROM oauth_tokens');
});

const makeToken = (companyId: string) => ({
  accessToken: 'access-' + companyId,
  refreshToken: 'refresh-' + companyId,
  tokenType: 'Bearer',
  expiresAt: new Date(Date.now() + 3600 * 1000),
  refreshTokenExpiresAt: new Date(Date.now() + 180 * 24 * 3600 * 1000),
});

describe('TokenStore', () => {
  test('upserts and retrieves a token', async () => {
    const t = makeToken('123');
    await store.upsertToken('quickbooks', '123', 'Acme Corp', t.accessToken, t.refreshToken, t.tokenType, t.expiresAt, t.refreshTokenExpiresAt);

    const fetched = await store.getToken('quickbooks', '123');
    expect(fetched).not.toBeNull();
    expect(fetched!.companyId).toBe('123');
    expect(fetched!.companyName).toBe('Acme Corp');
    expect(fetched!.enabled).toBe(true);
    expect(fetched!.accessToken).toBe(t.accessToken);
  });

  test('upsert updates on conflict', async () => {
    const t = makeToken('123');
    await store.upsertToken('quickbooks', '123', null, t.accessToken, t.refreshToken, t.tokenType, t.expiresAt, t.refreshTokenExpiresAt);
    await store.upsertToken('quickbooks', '123', null, 'new-access', 'new-refresh', t.tokenType, t.expiresAt, t.refreshTokenExpiresAt);

    const fetched = await store.getToken('quickbooks', '123');
    expect(fetched!.accessToken).toBe('new-access');
  });

  test('getAllTokens returns all companies for provider', async () => {
    const t1 = makeToken('111');
    const t2 = makeToken('222');
    await store.upsertToken('quickbooks', '111', null, t1.accessToken, t1.refreshToken, t1.tokenType, t1.expiresAt, t1.refreshTokenExpiresAt);
    await store.upsertToken('quickbooks', '222', null, t2.accessToken, t2.refreshToken, t2.tokenType, t2.expiresAt, t2.refreshTokenExpiresAt);

    const all = await store.getAllTokens('quickbooks');
    expect(all).toHaveLength(2);
  });

  test('updateCompany sets enabled to false', async () => {
    const t = makeToken('123');
    const created = await store.upsertToken('quickbooks', '123', 'Acme', t.accessToken, t.refreshToken, t.tokenType, t.expiresAt, t.refreshTokenExpiresAt);

    const updated = await store.updateCompany(created.id, { enabled: false });
    expect(updated!.enabled).toBe(false);
  });

  test('deleteToken removes the row', async () => {
    const t = makeToken('123');
    const created = await store.upsertToken('quickbooks', '123', null, t.accessToken, t.refreshToken, t.tokenType, t.expiresAt, t.refreshTokenExpiresAt);

    const deleted = await store.deleteToken(created.id);
    expect(deleted).toBe(true);

    const fetched = await store.getToken('quickbooks', '123');
    expect(fetched).toBeNull();
  });

  test('returns null for unknown company', async () => {
    const result = await store.getToken('quickbooks', 'does-not-exist');
    expect(result).toBeNull();
  });
});
