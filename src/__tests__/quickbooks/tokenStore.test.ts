import { TokenStore } from '../../quickbooks/tokenStore';
import { createTestPool, runTestMigrations } from '../setup';
import { Pool } from 'pg';

const TEST_KEY = 'a'.repeat(64); // 32 bytes of 0xaa — fixed key for deterministic tests

let pool: Pool;
let store: TokenStore;

beforeAll(async () => {
  pool = await createTestPool();
  await runTestMigrations();
  store = new TokenStore(pool, TEST_KEY);
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

  describe('at-rest encryption', () => {
    test('tokens are not stored as plaintext in the database', async () => {
      const t = makeToken('enc-test');
      await store.upsertToken('quickbooks', 'enc-test', null, t.accessToken, t.refreshToken, t.tokenType, t.expiresAt, t.refreshTokenExpiresAt);

      // Read raw bytes directly — bypassing TokenStore decryption
      const raw = await pool.query(`SELECT access_token, refresh_token FROM oauth_tokens WHERE company_id = $1`, ['enc-test']);
      expect(raw.rows[0].access_token).not.toBe(t.accessToken);
      expect(raw.rows[0].refresh_token).not.toBe(t.refreshToken);
    });

    test('raw DB values decrypt back to the original tokens', async () => {
      const { decrypt } = await import('../../quickbooks/tokenCrypto');
      const t = makeToken('enc-roundtrip');
      await store.upsertToken('quickbooks', 'enc-roundtrip', null, t.accessToken, t.refreshToken, t.tokenType, t.expiresAt, t.refreshTokenExpiresAt);

      const raw = await pool.query(`SELECT access_token, refresh_token FROM oauth_tokens WHERE company_id = $1`, ['enc-roundtrip']);
      expect(decrypt(raw.rows[0].access_token, TEST_KEY)).toBe(t.accessToken);
      expect(decrypt(raw.rows[0].refresh_token, TEST_KEY)).toBe(t.refreshToken);
    });

    test('updateTokens also stores encrypted values', async () => {
      const { decrypt } = await import('../../quickbooks/tokenCrypto');
      const t = makeToken('enc-update');
      const created = await store.upsertToken('quickbooks', 'enc-update', null, t.accessToken, t.refreshToken, t.tokenType, t.expiresAt, t.refreshTokenExpiresAt);

      await store.updateTokens('quickbooks', created.companyId, 'updated-access', 'updated-refresh', t.expiresAt, t.refreshTokenExpiresAt);

      const raw = await pool.query(`SELECT access_token, refresh_token FROM oauth_tokens WHERE company_id = $1`, ['enc-update']);
      expect(decrypt(raw.rows[0].access_token, TEST_KEY)).toBe('updated-access');
      expect(decrypt(raw.rows[0].refresh_token, TEST_KEY)).toBe('updated-refresh');
    });

    test('store with wrong key cannot read tokens written by the correct key', async () => {
      const t = makeToken('enc-wrongkey');
      await store.upsertToken('quickbooks', 'enc-wrongkey', null, t.accessToken, t.refreshToken, t.tokenType, t.expiresAt, t.refreshTokenExpiresAt);

      const wrongKeyStore = new TokenStore(pool, 'b'.repeat(64));
      await expect(wrongKeyStore.getToken('quickbooks', 'enc-wrongkey')).rejects.toThrow();
    });
  });
});
