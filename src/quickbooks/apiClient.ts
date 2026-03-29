import OAuthClient from 'intuit-oauth';
import { config } from '../common/config';
import { TokenManager } from './tokenManager';

export class QbApiClient {
  constructor(private readonly tokenManager: TokenManager) {}

  async getClient(companyId: string): Promise<OAuthClient> {
    const accessToken = await this.tokenManager.getAccessToken(companyId);

    const client = new OAuthClient({
      clientId: config.qbClientId,
      clientSecret: config.qbClientSecret,
      environment: config.qbEnvironment as 'sandbox' | 'production',
      redirectUri: config.qbRedirectUri,
    });

    client.setToken({ access_token: accessToken, realmId: companyId });
    return client;
  }

  getBaseUrl(companyId: string): string {
    const base =
      config.qbEnvironment === 'production'
        ? 'https://quickbooks.api.intuit.com'
        : 'https://sandbox-quickbooks.api.intuit.com';
    return `${base}/v3/company/${companyId}`;
  }
}
