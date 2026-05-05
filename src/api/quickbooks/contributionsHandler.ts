import { Router, RequestHandler } from 'express';
import KeycloakConnect from 'keycloak-connect';
import { isEmailOwnerOrHasAnyRole } from '../permissions';
import { AdminRoles } from '../../common/consts';
import { getLastContributions, mergeContributions, ContributionsMap } from '../../quickbooks/contributions';
import { TokenStore } from '../../quickbooks/tokenStore';
import { QbProvider } from '../../common/consts';
import { QbApiClient } from '../../quickbooks/apiClient';
import { ValidationError } from '../../common/errors';
import { logFor } from '../../common/logger';

interface CompanyContributions {
  companyId: string;
  companyName: string | null;
  found: boolean;
  contributions: ContributionsMap;
}

interface ContributionsResponse {
  found: boolean;
  total: ContributionsMap;
  companies: CompanyContributions[];
}

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
          const token = await tokenStore.getToken(QbProvider, companyId);
          if (!token) {
            res.status(404).json({ error: `Company ${companyId} not connected`, success: false });
            return;
          }

          const result = await getLastContributions(qbClient, companyId, email);
          const data: ContributionsResponse = {
            found: result.found,
            total: result.contributions,
            companies: [{ companyId: token.companyId, companyName: token.companyName, found: result.found, contributions: result.contributions }],
          };
          res.json({ message: 'Fetched!', data, success: true });
        } else {
          const tokens = await tokenStore.getAllTokens(QbProvider);
          const enabled = tokens.filter((t) => t.enabled);

          if (enabled.length === 0) {
            const data: ContributionsResponse = { found: false, total: {}, companies: [] };
            res.json({ message: 'Fetched!', data, success: true });
            return;
          }

          const settled = await Promise.allSettled(
            enabled.map(async (t) => {
              const result = await getLastContributions(qbClient, t.companyId, email);
              return { companyId: t.companyId, companyName: t.companyName, ...result };
            }),
          );

          settled
            .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
            .forEach((r) => logFor(req).warn({ err: r.reason }, 'contributions: partial failure'));

          const companies = settled
            .filter((r): r is PromiseFulfilledResult<CompanyContributions> => r.status === 'fulfilled')
            .map((r) => r.value);

          const data: ContributionsResponse = {
            found: companies.some((c) => c.found),
            total: mergeContributions(companies.map((c) => c.contributions)),
            companies,
          };
          res.json({ message: 'Fetched!', data, success: true });
        }
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
