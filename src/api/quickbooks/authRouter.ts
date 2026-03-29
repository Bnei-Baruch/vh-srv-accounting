import { Router, RequestHandler, Request, Response, NextFunction } from 'express';
import KeycloakConnect from 'keycloak-connect';
import { getAuthorizationUrl, exchangeCode } from '../../quickbooks/oauthClient';
import { TokenStore } from '../../quickbooks/tokenStore';
import { TokenManager } from '../../quickbooks/tokenManager';
import { QbProvider, AdminRoles } from '../../common/consts';
import { logFor } from '../../common/logger';
import { hasAnyRole } from '../permissions';

export function createAuthRouter(keycloak: KeycloakConnect.Keycloak, tokenStore: TokenStore, tokenManager: TokenManager): Router {
  const router = Router();

  const requireAdmin = (req: Request, res: Response, next: NextFunction) => {
    if (hasAnyRole(req, res, ...AdminRoles)) next();
  };

  // Admin-only: redirect to Intuit OAuth consent screen
  router.get('/connect', keycloak.protect() as RequestHandler, requireAdmin, (_req, res) => {
    const url = getAuthorizationUrl();
    res.redirect(url);
  });

  // OAuth callback — no JWT required (browser redirect from Intuit)
  router.get('/callback', async (req, res) => {
    try {
      const { code, realmId } = req.query as { code?: string; realmId?: string };

      if (!code || !realmId) {
        res.status(400).json({ error: 'Missing code or realmId in OAuth callback', success: false });
        return;
      }

      const tokenData = await exchangeCode(req.url);

      await tokenStore.upsertToken(
        QbProvider,
        tokenData.realmId,
        null, // company name — not available from OAuth, admin can set it via PATCH
        tokenData.accessToken,
        tokenData.refreshToken,
        tokenData.tokenType,
        tokenData.expiresAt,
        tokenData.refreshTokenExpiresAt,
      );

      logFor(req).info({ companyId: tokenData.realmId }, 'QuickBooks company connected');
      res.json({ message: 'QuickBooks connected!', data: { companyId: tokenData.realmId }, success: true });
    } catch (err) {
      logFor(req).error({ err }, 'QuickBooks OAuth callback failed');
      res.status(500).json({ error: 'OAuth callback failed', success: false });
    }
  });

  // Admin-only: token health per company
  router.get('/status', keycloak.protect() as RequestHandler, requireAdmin, async (_req, res) => {
    const companies = await tokenManager.getHealth();
    const data: Record<string, unknown> = {};
    for (const c of companies) {
      data[c.companyId] = { status: c.status, enabled: c.enabled, refreshTokenDaysLeft: c.refreshTokenDaysLeft };
    }
    res.json({ data, success: true });
  });

  return router;
}
