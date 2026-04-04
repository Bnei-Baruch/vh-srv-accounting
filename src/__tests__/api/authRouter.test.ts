import request from 'supertest';
import { createAuthRouter } from '../../api/quickbooks/authRouter';
import { TokenStore, OAuthToken } from '../../quickbooks/tokenStore';
import { TokenManager } from '../../quickbooks/tokenManager';
import * as oauthClient from '../../quickbooks/oauthClient';
import { createTestApp } from '../setup';

jest.mock('keycloak-connect');
jest.mock('../../quickbooks/oauthClient');

function makeTokenData(realmId = '123'): oauthClient.TokenData {
  return {
    accessToken: 'at',
    refreshToken: 'rt',
    tokenType: 'Bearer',
    expiresAt: new Date(Date.now() + 3600 * 1000),
    refreshTokenExpiresAt: new Date(Date.now() + 180 * 24 * 3600 * 1000),
    realmId,
  };
}

describe('GET /auth/connect', () => {
  test('redirects admin to Intuit auth URL', async () => {
    (oauthClient.getAuthorizationUrl as jest.Mock).mockReturnValue('https://appcenter.intuit.com/connect');
    const mockStore = {} as jest.Mocked<TokenStore>;
    const mockManager = {} as jest.Mocked<TokenManager>;

    const app = createTestApp('/auth', (kc) => createAuthRouter(kc, mockStore, mockManager));
    const res = await request(app).get('/auth/connect');

    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('appcenter.intuit.com');
  });

  test('returns 403 when user lacks admin role', async () => {
    const mockStore = {} as jest.Mocked<TokenStore>;
    const mockManager = {} as jest.Mocked<TokenManager>;

    const app = createTestApp(
      '/auth',
      (kc) => createAuthRouter(kc, mockStore, mockManager),
      { roles: [] },
    );
    const res = await request(app).get('/auth/connect');
    expect(res.status).toBe(403);
  });
});

describe('GET /auth/callback', () => {
  let mockStore: jest.Mocked<TokenStore>;

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
  });

  test('saves token and returns 200 on valid callback', async () => {
    (oauthClient.exchangeCode as jest.Mock).mockResolvedValue(makeTokenData('realm-123'));
    mockStore.upsertToken.mockResolvedValue({} as OAuthToken);

    const app = createTestApp('/auth', (kc) => createAuthRouter(kc, mockStore, {} as jest.Mocked<TokenManager>));
    const res = await request(app).get('/auth/callback?code=abc&realmId=realm-123&state=qb-connect');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.companyId).toBe('realm-123');
    expect(mockStore.upsertToken).toHaveBeenCalled();
  });

  test('returns 400 when realmId is missing from token data', async () => {
    (oauthClient.exchangeCode as jest.Mock).mockResolvedValue(makeTokenData(''));

    const app = createTestApp('/auth', (kc) => createAuthRouter(kc, mockStore, {} as jest.Mocked<TokenManager>));
    const res = await request(app).get('/auth/callback?code=abc');

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('returns 500 when exchangeCode throws', async () => {
    (oauthClient.exchangeCode as jest.Mock).mockRejectedValue(new Error('Intuit API error'));

    const app = createTestApp('/auth', (kc) => createAuthRouter(kc, mockStore, {} as jest.Mocked<TokenManager>));
    const res = await request(app).get('/auth/callback?code=abc&realmId=123');

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });
});

describe('DELETE /auth/disconnect/:companyId', () => {
  let mockStore: jest.Mocked<TokenStore>;
  let mockManager: jest.Mocked<TokenManager>;

  const storedToken: OAuthToken = {
    id: 7,
    provider: 'quickbooks',
    companyId: 'realm-abc',
    companyName: 'Acme',
    enabled: true,
    accessToken: 'at',
    refreshToken: 'rt',
    tokenType: 'Bearer',
    expiresAt: new Date(Date.now() + 3600 * 1000),
    refreshTokenExpiresAt: new Date(Date.now() + 180 * 24 * 3600 * 1000),
    createdAt: new Date(),
    updatedAt: new Date(),
  };

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
    mockManager = {
      removeCompany: jest.fn(),
    } as unknown as jest.Mocked<TokenManager>;
  });

  test('revokes token, deletes from DB, and returns 200', async () => {
    mockStore.getToken.mockResolvedValue(storedToken);
    (oauthClient.revokeToken as jest.Mock).mockResolvedValue(undefined);
    mockStore.deleteToken.mockResolvedValue(true);

    const app = createTestApp('/auth', (kc) => createAuthRouter(kc, mockStore, mockManager));
    const res = await request(app).delete('/auth/disconnect/realm-abc');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: 'Disconnected!', success: true });
    expect(oauthClient.revokeToken).toHaveBeenCalledWith('rt');
    expect(mockStore.deleteToken).toHaveBeenCalledWith(7);
    expect(mockManager.removeCompany).toHaveBeenCalledWith('realm-abc');
  });

  test('returns 404 when company is not connected', async () => {
    mockStore.getToken.mockResolvedValue(null);

    const app = createTestApp('/auth', (kc) => createAuthRouter(kc, mockStore, mockManager));
    const res = await request(app).delete('/auth/disconnect/realm-abc');

    expect(res.status).toBe(404);
    expect(oauthClient.revokeToken).not.toHaveBeenCalled();
    expect(mockStore.deleteToken).not.toHaveBeenCalled();
  });

  test('still disconnects locally when Intuit revocation fails', async () => {
    mockStore.getToken.mockResolvedValue(storedToken);
    (oauthClient.revokeToken as jest.Mock).mockRejectedValue(new Error('Intuit unavailable'));
    mockStore.deleteToken.mockResolvedValue(true);

    const app = createTestApp('/auth', (kc) => createAuthRouter(kc, mockStore, mockManager));
    const res = await request(app).delete('/auth/disconnect/realm-abc');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(mockStore.deleteToken).toHaveBeenCalledWith(7);
    expect(mockManager.removeCompany).toHaveBeenCalledWith('realm-abc');
  });

  test('returns 500 when DB delete fails', async () => {
    mockStore.getToken.mockResolvedValue(storedToken);
    (oauthClient.revokeToken as jest.Mock).mockResolvedValue(undefined);
    mockStore.deleteToken.mockRejectedValue(new Error('DB error'));

    const app = createTestApp('/auth', (kc) => createAuthRouter(kc, mockStore, mockManager));
    const res = await request(app).delete('/auth/disconnect/realm-abc');

    expect(res.status).toBe(500);
    expect(mockManager.removeCompany).not.toHaveBeenCalled();
  });

  test('returns 403 when user lacks admin role', async () => {
    const app = createTestApp(
      '/auth',
      (kc) => createAuthRouter(kc, mockStore, mockManager),
      { roles: [] },
    );
    const res = await request(app).delete('/auth/disconnect/realm-abc');

    expect(res.status).toBe(403);
    expect(mockStore.getToken).not.toHaveBeenCalled();
  });
});

describe('GET /auth/status', () => {
  test('returns health map for all companies', async () => {
    const mockManager = {
      getHealth: jest.fn().mockResolvedValue([
        { companyId: '111', status: 'ok', enabled: true, refreshTokenDaysLeft: 90 },
        { companyId: '222', status: 'token_expiring', enabled: true, refreshTokenDaysLeft: 15 },
      ]),
    } as unknown as jest.Mocked<TokenManager>;

    const app = createTestApp('/auth', (kc) => createAuthRouter(kc, {} as jest.Mocked<TokenStore>, mockManager));
    const res = await request(app).get('/auth/status');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data['111'].status).toBe('ok');
    expect(res.body.data['222'].status).toBe('token_expiring');
  });

  test('returns 403 when user lacks admin role', async () => {
    const app = createTestApp(
      '/auth',
      (kc) => createAuthRouter(kc, {} as jest.Mocked<TokenStore>, {} as jest.Mocked<TokenManager>),
      { roles: [] },
    );
    const res = await request(app).get('/auth/status');
    expect(res.status).toBe(403);
  });
});
