import { exchangeCode, getAuthorizationUrl, refreshAccessToken, revokeToken } from '../../quickbooks/oauthClient';

jest.mock('../../common/config', () => ({
  config: {
    qbClientId: 'test-client-id',
    qbClientSecret: 'test-client-secret',
    qbEnvironment: 'sandbox',
    qbRedirectUri: 'http://localhost/callback',
  },
}));

const mockAuthorizeUri = jest.fn();
const mockCreateToken = jest.fn();
const mockRefreshUsingToken = jest.fn();
const mockRevoke = jest.fn();

jest.mock('intuit-oauth', () => {
  const ctor = jest.fn().mockImplementation(() => ({
    authorizeUri: mockAuthorizeUri,
    createToken: mockCreateToken,
    refreshUsingToken: mockRefreshUsingToken,
    revoke: mockRevoke,
  }));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (ctor as any).scopes = { Accounting: 'com.intuit.quickbooks.accounting' };
  return ctor;
});

function makeAuthResponse(overrides: {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  x_refresh_token_expires_in?: number;
  realmId?: string;
}) {
  const token = {
    access_token: 'at',
    refresh_token: 'rt',
    token_type: 'Bearer',
    expires_in: 3600,
    x_refresh_token_expires_in: 8726400,
    ...overrides,
  };
  return { getToken: () => token };
}

describe('getAuthorizationUrl', () => {
  test('returns a non-empty URL string', () => {
    mockAuthorizeUri.mockReturnValue('https://appcenter.intuit.com/connect?scope=...');
    const url = getAuthorizationUrl();
    expect(typeof url).toBe('string');
    expect(url.length).toBeGreaterThan(0);
    expect(mockAuthorizeUri).toHaveBeenCalledWith({
      scope: ['com.intuit.quickbooks.accounting'],
      state: 'qb-connect',
    });
  });
});

describe('exchangeCode', () => {
  beforeEach(() => jest.clearAllMocks());

  test('returns realmId from the token response', async () => {
    mockCreateToken.mockResolvedValue(makeAuthResponse({ realmId: 'realm-from-token' }));

    const callbackUrl = 'http://localhost/callback?code=auth_code&realmId=realm-from-url&state=qb-connect';
    const result = await exchangeCode(callbackUrl);

    expect(result.realmId).toBe('realm-from-token');
  });

  test('calculates expiry dates from expires_in fields', async () => {
    const before = Date.now();
    mockCreateToken.mockResolvedValue(
      makeAuthResponse({ expires_in: 3600, x_refresh_token_expires_in: 8726400 }),
    );

    const result = await exchangeCode('http://localhost/callback?code=abc&realmId=123');
    const after = Date.now();

    expect(result.expiresAt.getTime()).toBeGreaterThanOrEqual(before + 3600 * 1000);
    expect(result.expiresAt.getTime()).toBeLessThanOrEqual(after + 3600 * 1000);

    expect(result.refreshTokenExpiresAt.getTime()).toBeGreaterThanOrEqual(before + 8726400 * 1000);
  });

  test('returns parsed token fields', async () => {
    mockCreateToken.mockResolvedValue(
      makeAuthResponse({ access_token: 'my-access', refresh_token: 'my-refresh' }),
    );

    const result = await exchangeCode('http://localhost/callback?code=abc&realmId=123');
    expect(result.accessToken).toBe('my-access');
    expect(result.refreshToken).toBe('my-refresh');
    expect(result.tokenType).toBe('Bearer');
  });
});

describe('refreshAccessToken', () => {
  beforeEach(() => jest.clearAllMocks());

  test('calls refreshUsingToken and returns parsed token data', async () => {
    mockRefreshUsingToken.mockResolvedValue(makeAuthResponse({ access_token: 'fresh-at' }));

    const result = await refreshAccessToken('old-refresh-token');

    expect(mockRefreshUsingToken).toHaveBeenCalledWith('old-refresh-token');
    expect(result.accessToken).toBe('fresh-at');
  });
});

describe('revokeToken', () => {
  beforeEach(() => jest.clearAllMocks());

  test('calls revoke with the refresh token', async () => {
    mockRevoke.mockResolvedValue(undefined);

    await revokeToken('my-refresh-token');

    expect(mockRevoke).toHaveBeenCalledWith({ token: 'my-refresh-token' });
  });

  test('throws when Intuit revocation fails', async () => {
    mockRevoke.mockRejectedValue(new Error('revocation failed'));

    await expect(revokeToken('my-refresh-token')).rejects.toThrow('revocation failed');
  });
});
