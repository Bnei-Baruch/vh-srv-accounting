import { logger } from '../common/logger';
import { QbProvider } from '../common/consts';
import { TokenStore, OAuthToken } from './tokenStore';
import { refreshAccessToken } from './oauthClient';

const REFRESH_INTERVAL_MS = 30 * 60 * 1000;        // 30 minutes
const PROACTIVE_REFRESH_THRESHOLD_MS = 10 * 60 * 1000; // refresh when < 10 min left
const REFRESH_TOKEN_WARN_DAYS = 150;               // warn when refresh token > 150 days old

export type TokenHealthStatus = 'ok' | 'token_expiring' | 'not_connected' | 'error';

export interface CompanyHealth {
  companyId: string;
  companyName: string | null;
  enabled: boolean;
  status: TokenHealthStatus;
  accessTokenExpiresAt?: Date;
  refreshTokenExpiresAt?: Date;
  refreshTokenDaysLeft?: number;
}

export class TokenManager {
  private refreshTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private refreshLocks = new Map<string, Promise<void>>();
  private backgroundInterval: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly store: TokenStore) {}

  async start(): Promise<void> {
    const tokens = await this.store.getAllTokens(QbProvider);
    logger.info({ count: tokens.length }, 'TokenManager: loaded companies');

    this.backgroundInterval = setInterval(() => {
      this.refreshAll().catch((err) => {
        logger.error({ err }, 'TokenManager: background refresh failed');
      });
    }, REFRESH_INTERVAL_MS);

    // Immediate refresh attempt for any expired access tokens
    await this.refreshAll();
  }

  stop(): void {
    if (this.backgroundInterval) {
      clearInterval(this.backgroundInterval);
      this.backgroundInterval = null;
    }
  }

  async getAccessToken(companyId: string): Promise<string> {
    const token = await this.store.getToken(QbProvider, companyId);
    if (!token) throw new Error(`tokenManager.getAccessToken: no token for company ${companyId}`);

    if (this.needsRefresh(token)) {
      await this.refreshCompany(token);
      const refreshed = await this.store.getToken(QbProvider, companyId);
      if (!refreshed) throw new Error(`tokenManager.getAccessToken: token disappeared after refresh`);
      return refreshed.accessToken;
    }

    return token.accessToken;
  }

  removeCompany(companyId: string): void {
    const key = `${QbProvider}:${companyId}`;
    this.refreshLocks.delete(key);
  }

  async getHealth(): Promise<CompanyHealth[]> {
    const tokens = await this.store.getAllTokens(QbProvider);

    return tokens.map((token) => {
      const now = new Date();
      const refreshDaysLeft = Math.floor(
        (token.refreshTokenExpiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
      );

      let status: TokenHealthStatus = 'ok';
      if (token.refreshTokenExpiresAt <= now) {
        status = 'error';
      } else if (refreshDaysLeft < 30) {
        status = 'token_expiring';
      }

      return {
        companyId: token.companyId,
        companyName: token.companyName,
        enabled: token.enabled,
        status,
        accessTokenExpiresAt: token.expiresAt,
        refreshTokenExpiresAt: token.refreshTokenExpiresAt,
        refreshTokenDaysLeft: refreshDaysLeft,
      };
    });
  }

  private async refreshAll(): Promise<void> {
    const tokens = await this.store.getAllTokens(QbProvider);
    const enabled = tokens.filter((t) => t.enabled);

    await Promise.allSettled(
      enabled.map((token) => {
        if (this.needsRefresh(token)) {
          return this.refreshCompany(token);
        }
        return Promise.resolve();
      }),
    );
  }

  private needsRefresh(token: OAuthToken): boolean {
    const timeLeft = token.expiresAt.getTime() - Date.now();
    return timeLeft < PROACTIVE_REFRESH_THRESHOLD_MS;
  }

  private refreshCompany(token: OAuthToken): Promise<void> {
    const key = `${token.provider}:${token.companyId}`;

    // Per-company mutex: if already refreshing, wait for it
    const existing = this.refreshLocks.get(key);
    if (existing) return existing;

    const refreshPromise = this.doRefresh(token).finally(() => {
      this.refreshLocks.delete(key);
    });

    this.refreshLocks.set(key, refreshPromise);
    return refreshPromise;
  }

  private async doRefresh(token: OAuthToken): Promise<void> {
    try {
      logger.info({ companyId: token.companyId }, 'TokenManager: refreshing token');

      const newTokenData = await refreshAccessToken(token.refreshToken);

      await this.store.updateTokens(
        token.provider,
        token.companyId,
        newTokenData.accessToken,
        newTokenData.refreshToken,
        newTokenData.expiresAt,
        newTokenData.refreshTokenExpiresAt,
      );

      const daysLeft = Math.floor(
        (newTokenData.refreshTokenExpiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
      );

      if (daysLeft < REFRESH_TOKEN_WARN_DAYS) {
        logger.warn(
          { companyId: token.companyId, daysLeft },
          'TokenManager: refresh token approaching expiry',
        );
      }

      logger.info({ companyId: token.companyId }, 'TokenManager: token refreshed');
    } catch (err) {
      logger.error({ err, companyId: token.companyId }, 'TokenManager: refresh failed');
      throw err;
    }
  }
}
