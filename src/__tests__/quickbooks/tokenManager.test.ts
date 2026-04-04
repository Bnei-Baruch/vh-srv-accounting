import { TokenManager } from '../../quickbooks/tokenManager';
import { TokenStore, OAuthToken } from '../../quickbooks/tokenStore';
import * as oauthClient from '../../quickbooks/oauthClient';

jest.mock('../../quickbooks/oauthClient');

function makeToken(companyId: string, expiresInMs = 3600 * 1000): OAuthToken {
  return {
    id: 1,
    provider: 'quickbooks',
    companyId,
    companyName: 'Test Corp',
    enabled: true,
    accessToken: 'access-token',
    refreshToken: 'refresh-token',
    tokenType: 'Bearer',
    expiresAt: new Date(Date.now() + expiresInMs),
    refreshTokenExpiresAt: new Date(Date.now() + 180 * 24 * 3600 * 1000),
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe('TokenManager', () => {
  let mockStore: jest.Mocked<TokenStore>;
  let manager: TokenManager;

  beforeEach(() => {
    jest.clearAllMocks();
    mockStore = {
      getToken: jest.fn(),
      getAllTokens: jest.fn(),
      upsertToken: jest.fn(),
      updateTokens: jest.fn(),
      updateCompany: jest.fn(),
      deleteToken: jest.fn(),
    } as unknown as jest.Mocked<TokenStore>;

    manager = new TokenManager(mockStore);
  });

  afterEach(() => {
    manager.stop();
  });

  test('getAccessToken returns token when valid', async () => {
    const token = makeToken('123', 20 * 60 * 1000); // 20 min left — no refresh needed
    mockStore.getToken.mockResolvedValue(token);

    const result = await manager.getAccessToken('123');
    expect(result).toBe('access-token');
    expect(oauthClient.refreshAccessToken).not.toHaveBeenCalled();
  });

  test('getAccessToken refreshes when token is expiring soon', async () => {
    const expiredToken = makeToken('123', 5 * 60 * 1000); // 5 min left — needs refresh
    const freshToken = makeToken('123', 3600 * 1000);
    freshToken.accessToken = 'fresh-access-token';

    mockStore.getToken
      .mockResolvedValueOnce(expiredToken)   // first call — needs refresh
      .mockResolvedValueOnce(freshToken);    // after refresh — fetch new token

    (oauthClient.refreshAccessToken as jest.Mock).mockResolvedValue({
      accessToken: 'fresh-access-token',
      refreshToken: 'fresh-refresh-token',
      tokenType: 'Bearer',
      expiresAt: new Date(Date.now() + 3600 * 1000),
      refreshTokenExpiresAt: new Date(Date.now() + 180 * 24 * 3600 * 1000),
      realmId: '123',
    });
    mockStore.updateTokens.mockResolvedValue(undefined);

    const result = await manager.getAccessToken('123');
    expect(result).toBe('fresh-access-token');
    expect(oauthClient.refreshAccessToken).toHaveBeenCalledWith('refresh-token');
    expect(mockStore.updateTokens).toHaveBeenCalled();
  });

  test('getHealth returns status for all companies', async () => {
    const token = makeToken('123');
    mockStore.getAllTokens.mockResolvedValue([token]);

    const health = await manager.getHealth();
    expect(health).toHaveLength(1);
    expect(health[0].companyId).toBe('123');
    expect(health[0].status).toBe('ok');
  });

  test('getHealth reports token_expiring when refresh token near expiry', async () => {
    const token = makeToken('123');
    token.refreshTokenExpiresAt = new Date(Date.now() + 20 * 24 * 3600 * 1000); // 20 days
    mockStore.getAllTokens.mockResolvedValue([token]);

    const health = await manager.getHealth();
    expect(health[0].status).toBe('token_expiring');
  });

  test('start refreshes all enabled tokens on startup', async () => {
    const expiredToken = makeToken('123', 0); // already expired
    mockStore.getAllTokens.mockResolvedValue([expiredToken]);
    mockStore.getToken.mockResolvedValue(expiredToken);
    mockStore.updateTokens.mockResolvedValue(undefined);

    (oauthClient.refreshAccessToken as jest.Mock).mockResolvedValue({
      accessToken: 'new',
      refreshToken: 'new-refresh',
      tokenType: 'Bearer',
      expiresAt: new Date(Date.now() + 3600 * 1000),
      refreshTokenExpiresAt: new Date(Date.now() + 180 * 24 * 3600 * 1000),
      realmId: '123',
    });

    await manager.start();
    expect(mockStore.updateTokens).toHaveBeenCalled();
  });

  test('disabled companies are skipped during refresh', async () => {
    const disabledToken = makeToken('123', 0);
    disabledToken.enabled = false;
    mockStore.getAllTokens.mockResolvedValue([disabledToken]);

    await manager.start();
    expect(oauthClient.refreshAccessToken).not.toHaveBeenCalled();
  });

  describe('removeCompany', () => {
    test('does not throw for a connected company', () => {
      expect(() => manager.removeCompany('123')).not.toThrow();
    });

    test('is idempotent — does not throw for an unknown company', () => {
      expect(() => manager.removeCompany('never-existed')).not.toThrow();
    });

    test('clears an in-flight refresh lock so a new refresh can start independently', async () => {
      // Simulate a long-running refresh by never resolving
      let resolveLock!: () => void;
      const slowRefresh = new Promise<void>((resolve) => { resolveLock = resolve; });
      (oauthClient.refreshAccessToken as jest.Mock).mockReturnValue(slowRefresh);

      const token = makeToken('abc', 0); // expired — triggers refresh
      mockStore.getToken.mockResolvedValue(token);
      mockStore.updateTokens.mockResolvedValue(undefined);

      // Kick off first refresh (lock is now held)
      const firstRefresh = manager.getAccessToken('abc');

      // Remove the company — should clear the lock
      manager.removeCompany('abc');

      // Now mock a fast refresh for the next call
      (oauthClient.refreshAccessToken as jest.Mock).mockResolvedValue({
        accessToken: 'new-at',
        refreshToken: 'new-rt',
        tokenType: 'Bearer',
        expiresAt: new Date(Date.now() + 3600 * 1000),
        refreshTokenExpiresAt: new Date(Date.now() + 180 * 24 * 3600 * 1000),
        realmId: 'abc',
      });
      const freshToken = makeToken('abc', 3600 * 1000);
      freshToken.accessToken = 'new-at';
      mockStore.getToken.mockResolvedValue(freshToken);

      const secondRefresh = await manager.getAccessToken('abc');
      expect(secondRefresh).toBe('new-at');

      // Let the first refresh settle to avoid unhandled promise rejection
      resolveLock();
      await firstRefresh.catch(() => undefined);
    });
  });
});
