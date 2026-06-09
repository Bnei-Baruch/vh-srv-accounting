import { Router, RequestHandler } from 'express';
import KeycloakConnect from 'keycloak-connect';
import { hasAnyRole, isEmailOwnerOrHasAnyRole, isSubOwnerOrHasAnyRole } from '../permissions';
import { AdminRoles, EuropeProvider } from '../../common/consts';
import { EuropeApiClient } from '../../europe/paymentTotalsClient';
import { getLastContributions, mapResult } from '../../europe/contributions';
import { ContributionsMap } from '../../common/contributions';
import { ValidationError } from '../../common/errors';

interface SourceContributions {
  source: string;
  found: boolean;
  contributions: ContributionsMap;
}

// Mirrors the QuickBooks contributions envelope, with a provider-agnostic
// `sources` breakdown in place of QB's company-specific `companies`.
interface ContributionsResponse {
  found: boolean;
  total: ContributionsMap;
  sources: SourceContributions[];
}

interface BatchResultEntry {
  identifierType: 'email' | 'keycloak_id';
  identifier: string;
  found: boolean;
  contributions: ContributionsMap;
}

function parseLookbackMonths(raw: unknown): number | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined;
  const n = Number(raw);
  if (!Number.isInteger(n)) throw new ValidationError('lookback_months must be an integer');
  return n;
}

export function createEuropeContributionsRouter(
  keycloak: KeycloakConnect.Keycloak,
  europeClient: EuropeApiClient,
): Router {
  const router = Router();

  // Single lookup — owner-or-admin. Accepts exactly one identifier so the
  // ownership check is unambiguous.
  router.get(
    '/contributions',
    keycloak.protect() as RequestHandler,
    async (req, res, next) => {
      try {
        const email = req.query.email as string | undefined;
        const keycloakId = req.query.keycloak_id as string | undefined;
        const lookbackMonths = parseLookbackMonths(req.query.lookback_months);

        if (!email && !keycloakId) {
          throw new ValidationError('email or keycloak_id query parameter is required');
        }
        if (email && keycloakId) {
          throw new ValidationError('provide either email or keycloak_id, not both');
        }

        if (email) {
          if (!isEmailOwnerOrHasAnyRole(req, res, email, ...AdminRoles)) return;
        } else if (!isSubOwnerOrHasAnyRole(req, res, keycloakId as string, ...AdminRoles)) {
          return;
        }

        const result = await getLastContributions(europeClient, { email, keycloakId }, lookbackMonths);

        const data: ContributionsResponse = {
          found: result.found,
          total: result.contributions,
          sources: [
            { source: EuropeProvider, found: result.found, contributions: result.contributions },
          ],
        };
        res.json({ message: 'Fetched!', data, success: true });
      } catch (err) {
        next(err);
      }
    },
  );

  // Batch lookup — admin only (a caller cannot "own" up to 100 identities).
  // Maps straight onto the upstream's native batch.
  router.post(
    '/contributions/batch',
    keycloak.protect() as RequestHandler,
    async (req, res, next) => {
      try {
        if (!hasAnyRole(req, res, ...AdminRoles)) return;

        const body = (req.body ?? {}) as {
          emails?: unknown;
          keycloak_ids?: unknown;
          lookback_months?: unknown;
        };
        const emails = Array.isArray(body.emails) ? (body.emails as string[]) : [];
        const keycloakIds = Array.isArray(body.keycloak_ids) ? (body.keycloak_ids as string[]) : [];
        const lookbackMonths = parseLookbackMonths(body.lookback_months);

        const response = await europeClient.getPaymentTotals({ emails, keycloakIds, lookbackMonths });

        const results: BatchResultEntry[] = response.results.map((r) => {
          const mapped = mapResult(r);
          return {
            identifierType: r.identifier_type,
            identifier: r.identifier,
            found: mapped.found,
            contributions: mapped.contributions,
          };
        });

        res.json({
          message: 'Fetched!',
          data: {
            cutoffDate: response.cutoff_date,
            lookbackMonths: response.lookback_months,
            results,
          },
          success: true,
        });
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
