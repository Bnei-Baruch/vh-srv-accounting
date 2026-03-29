import { Router, RequestHandler } from 'express';
import KeycloakConnect from 'keycloak-connect';
import { isEmailOwnerOrHasAnyRole } from '../permissions';
import { AdminRoles } from '../../common/consts';
import { getLastContributions, mergeContributions } from '../../quickbooks/contributions';
import { TokenStore } from '../../quickbooks/tokenStore';
import { QbProvider } from '../../common/consts';
import { QbApiClient } from '../../quickbooks/apiClient';
import { ValidationError } from '../../common/errors';
import { logFor } from '../../common/logger';

export function createContributionsRouter(
  keycloak: KeycloakConnect.Keycloak,
  tokenStore: TokenStore,
  qbClient: QbApiClient,
): Router {
  const router = Router();

  router.get(
    '/contributions',
    keycloak.protect() as RequestHandler,
    async (req, res, next) => {
      try {
        const email = req.query.email as string | undefined;
        const companyId = req.query.company_id as string | undefined;

        if (!email) throw new ValidationError('email query parameter is required');

        if (!isEmailOwnerOrHasAnyRole(req, res, email, ...AdminRoles)) return;

        if (companyId) {
          // Single company
          const token = await tokenStore.getToken(QbProvider, companyId);
          if (!token) {
            res.status(404).json({ error: `Company ${companyId} not connected`, success: false });
            return;
          }

          const data = await getLastContributions(qbClient, companyId, email);
          res.json({ message: 'Fetched!', data, success: true });
        } else {
          // Aggregate across all enabled companies
          const tokens = await tokenStore.getAllTokens(QbProvider);
          const enabled = tokens.filter((t) => t.enabled);

          if (enabled.length === 0) {
            res.json({ message: 'Fetched!', data: {}, success: true });
            return;
          }

          const results = await Promise.allSettled(
            enabled.map((t) => getLastContributions(qbClient, t.companyId, email)),
          );

          const maps = results
            .filter((r): r is PromiseFulfilledResult<Record<string, number>> => r.status === 'fulfilled')
            .map((r) => r.value);

          results
            .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
            .forEach((r) => logFor(req).warn({ err: r.reason }, 'contributions: partial failure'));

          const data = mergeContributions(maps);
          res.json({ message: 'Fetched!', data, success: true });
        }
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
