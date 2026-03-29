import { Router, RequestHandler, Request, Response, NextFunction } from 'express';
import KeycloakConnect from 'keycloak-connect';
import { TokenStore, OAuthToken } from '../../quickbooks/tokenStore';
import { QbApiClient } from '../../quickbooks/apiClient';
import { QbProvider, AdminRoles } from '../../common/consts';
import { NotFoundError, ValidationError } from '../../common/errors';
import { hasAnyRole } from '../permissions';

function sanitizeToken(token: OAuthToken) {
  return {
    id: token.id,
    companyId: token.companyId,
    companyName: token.companyName,
    enabled: token.enabled,
    tokenType: token.tokenType,
    accessTokenExpiresAt: token.expiresAt,
    refreshTokenExpiresAt: token.refreshTokenExpiresAt,
    createdAt: token.createdAt,
    updatedAt: token.updatedAt,
  };
}

export function createCompaniesRouter(keycloak: KeycloakConnect.Keycloak, tokenStore: TokenStore, qbClient: QbApiClient): Router {
  const router = Router();

  // All company routes require admin role
  router.use(
    keycloak.protect() as RequestHandler,
    (req: Request, res: Response, next: NextFunction) => {
      if (hasAnyRole(req, res, ...AdminRoles)) next();
    },
  );

  // List all companies
  router.get('/', async (_req, res, next) => {
    try {
      const tokens = await tokenStore.getAllTokens(QbProvider);
      res.json({
        message: 'Fetched!',
        data: tokens.map(sanitizeToken),
        success: true,
      });
    } catch (err) {
      next(err);
    }
  });

  // Get single company
  router.get('/:id', async (req, res, next) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) throw new ValidationError('Invalid company id');

      const tokens = await tokenStore.getAllTokens(QbProvider);
      const token = tokens.find((t) => t.id === id);
      if (!token) throw new NotFoundError(`Company ${id} not found`);

      res.json({ message: 'Fetched!', data: sanitizeToken(token), success: true });
    } catch (err) {
      next(err);
    }
  });

  // Update company (name, enabled)
  router.patch('/:id', async (req, res, next) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) throw new ValidationError('Invalid company id');

      const { companyName, enabled } = req.body as { companyName?: string; enabled?: boolean };

      if (companyName === undefined && enabled === undefined) {
        throw new ValidationError('Provide at least one field: companyName, enabled');
      }
      if (enabled !== undefined && typeof enabled !== 'boolean') {
        throw new ValidationError('enabled must be a boolean');
      }

      const updated = await tokenStore.updateCompany(id, { companyName, enabled });
      if (!updated) throw new NotFoundError(`Company ${id} not found`);

      res.json({ message: 'Updated!', data: sanitizeToken(updated), success: true });
    } catch (err) {
      next(err);
    }
  });

  // Debug: forward a raw QB API query for a company
  router.get('/:company_id/fetch', async (req, res, next) => {
    try {
      const { company_id } = req.params;
      const { query, path = '/query', ...rest } = req.query as Record<string, string>;
      if (!query) throw new ValidationError('query param is required');

      const client = await qbClient.getClient(company_id);
      const base = qbClient.getBaseUrl(company_id);
      const url = new URL(base + path);
      url.searchParams.set('minorversion', '70');
      url.searchParams.set('query', query);
      for (const [k, v] of Object.entries(rest)) {
        url.searchParams.set(k, v);
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await (client as any).makeApiCall({ url: url.toString(), method: 'GET' });
      res.json(response);
    } catch (err) {
      next(err);
    }
  });

  // Delete (disconnect) company
  router.delete('/:id', async (req, res, next) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) throw new ValidationError('Invalid company id');

      const deleted = await tokenStore.deleteToken(id);
      if (!deleted) throw new NotFoundError(`Company ${id} not found`);

      res.json({ message: 'Deleted!', success: true });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
