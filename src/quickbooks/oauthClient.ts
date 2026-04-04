import OAuthClient from 'intuit-oauth';
import { config } from '../common/config';
import { logger } from '../common/logger';

export interface TokenData {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresAt: Date;
  refreshTokenExpiresAt: Date;
  realmId: string;
}

interface QBToken {
  access_token: string;
  refresh_token: string;
  token_type?: string;
  expires_in?: number;
  x_refresh_token_expires_in?: number;
  realmId?: string;
}

interface QBAuthResponse {
  getToken(): QBToken;
}

interface QBError {
  originalMessage?: string;
  error?: string;
  error_description?: string;
  intuit_tid?: string;
}

function createClient(): OAuthClient {
  return new OAuthClient({
    clientId: config.qbClientId,
    clientSecret: config.qbClientSecret,
    environment: config.qbEnvironment as 'sandbox' | 'production',
    redirectUri: config.qbRedirectUri,
  });
}

function parseTokenData(authResponse: QBAuthResponse): TokenData {
  const token = authResponse.getToken();
  const now = Date.now();
  return {
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    tokenType: token.token_type ?? 'Bearer',
    expiresAt: new Date(now + (token.expires_in ?? 3600) * 1000),
    refreshTokenExpiresAt: new Date(now + (token.x_refresh_token_expires_in ?? 15552000) * 1000),
    realmId: token.realmId ?? '',
  };
}

function logQBError(context: string, err: unknown): void {
  const e = err as QBError;
  logger.error(
    {
      error: e.error,
      error_description: e.error_description,
      intuit_tid: e.intuit_tid,
      message: e.originalMessage ?? (err instanceof Error ? err.message : String(err)),
    },
    `oauthClient.${context}: QuickBooks API error`,
  );
}

export function getAuthorizationUrl(): string {
  const client = createClient();
  const url = client.authorizeUri({
    scope: [OAuthClient.scopes.Accounting],
    state: 'qb-connect',
  });
  logger.info({ redirectUri: config.qbRedirectUri }, 'oauthClient.getAuthorizationUrl: authorization URL generated');
  return url;
}

// callbackUrl is req.url from the OAuth callback — the SDK parses code and realmId from it
export async function exchangeCode(callbackUrl: string): Promise<TokenData> {
  const client = createClient();
  try {
    logger.info('oauthClient.exchangeCode: exchanging authorization code');
    const authResponse = await client.createToken(callbackUrl);
    const tokenData = parseTokenData(authResponse as QBAuthResponse);
    logger.info({ realmId: tokenData.realmId, expiresAt: tokenData.expiresAt }, 'oauthClient.exchangeCode: token exchange successful');
    return tokenData;
  } catch (err) {
    logQBError('exchangeCode', err);
    throw err;
  }
}

export async function refreshAccessToken(refreshToken: string): Promise<TokenData> {
  const client = createClient();
  try {
    logger.info('oauthClient.refreshAccessToken: refreshing access token');
    const authResponse = await client.refreshUsingToken(refreshToken);
    const tokenData = parseTokenData(authResponse as QBAuthResponse);
    logger.info(
      { expiresAt: tokenData.expiresAt, refreshTokenExpiresAt: tokenData.refreshTokenExpiresAt },
      'oauthClient.refreshAccessToken: token refresh successful',
    );
    return tokenData;
  } catch (err) {
    logQBError('refreshAccessToken', err);
    throw err;
  }
}

export async function revokeToken(refreshToken: string): Promise<void> {
  const client = createClient();
  try {
    logger.info('oauthClient.revokeToken: revoking token');
    await (client as any).revoke({ token: refreshToken }); // revoke() exists in JS but is missing from the TS declaration
    logger.info('oauthClient.revokeToken: token revoked');
  } catch (err) {
    logQBError('revokeToken', err);
    throw err;
  }
}
