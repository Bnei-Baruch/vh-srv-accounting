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

  async query<T>(companyId: string, qbql: string): Promise<T[]> {
    const client = await this.getClient(companyId);
    const url = new URL(this.getBaseUrl(companyId) + '/query');
    url.searchParams.set('minorversion', '70');
    url.searchParams.set('query', qbql);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response = await (client as any).makeApiCall({ url: url.toString(), method: 'GET' }) as { json: any };

    if (response.json?.Fault) {
      const detail = response.json.Fault.Error?.[0]?.Detail ?? 'QB API error';
      throw new Error(`qbApiClient.query: ${detail}`);
    }

    const qr = response.json?.QueryResponse ?? {};
    // QueryResponse contains one entity array plus metadata (startPosition, maxResults)
    const entities = Object.values(qr).find(Array.isArray) as T[] | undefined;
    return entities ?? [];
  }
}
