declare module 'intuit-oauth' {
  interface OAuthClientConfig {
    clientId: string;
    clientSecret: string;
    environment: 'sandbox' | 'production';
    redirectUri: string;
  }

  interface QBTokenData {
    access_token: string;
    refresh_token: string;
    token_type?: string;
    expires_in?: number;
    x_refresh_token_expires_in?: number;
    realmId?: string;
    [key: string]: unknown;
  }

  interface AuthResponse {
    getToken(): QBTokenData;
  }

  class OAuthClient {
    static scopes: {
      Accounting: string;
      Payment: string;
    };

    constructor(config: OAuthClientConfig);

    setToken(token: Partial<QBTokenData>): void;

    authorizeUri(params: { scope: string[]; state?: string }): string;

    createToken(url: string): Promise<AuthResponse>;

    refresh(): Promise<AuthResponse>;

    refreshUsingToken(refreshToken: string): Promise<AuthResponse>;

    isAccessTokenValid(): boolean;

    getToken(): QBTokenData;
  }

  export = OAuthClient;
}
