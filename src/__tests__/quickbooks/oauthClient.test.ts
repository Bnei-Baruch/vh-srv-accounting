import { exchangeCode, getAuthorizationUrl, refreshAccessToken } from '../../quickbooks/oauthClient';

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
const mockSetToken = jest.fn();
const mockRefresh = jest.fn();

jest.mock('intuit-oauth', () =>
  jest.fn().mockImplementation(() => ({
    authorizeUri: mockAuthorizeUri,
    createToken: mockCreateToken,
    setToken: mockSetToken,
    refresh: mockRefresh,
  })),
);

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

  test('extracts realmId from callback URL', async () => {
    mockCreateToken.mockResolvedValue(makeAuthResponse({ realmId: 'from-token' }));

    const callbackUrl = 'http://localhost/callback?code=auth_code&realmId=realm-from-url&state=qb-connect';
    const result = await exchangeCode(callbackUrl);

    // realmId from URL searchParams takes priority (passed as second arg to parseTokenData)
    expect(result.realmId).toBe('realm-from-url');
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

  test('sets the refresh token and calls refresh()', async () => {
    mockRefresh.mockResolvedValue(makeAuthResponse({ access_token: 'fresh-at' }));

    const result = await refreshAccessToken('old-refresh-token');

    expect(mockSetToken).toHaveBeenCalledWith({ refresh_token: 'old-refresh-token' });
    expect(mockRefresh).toHaveBeenCalled();
    expect(result.accessToken).toBe('fresh-at');
  });
});
