import { EuropeApiClient } from './paymentTotalsClient';
import { PaymentTotalsResult } from './types';
import { ContributionsMap, ContributionsResult } from '../common/contributions';

export interface ContributionsIdentifier {
  email?: string;
  keycloakId?: string;
}

/**
 * Fetches the last contributions for a single person from the European API.
 * Exactly one of `email` / `keycloakId` is expected (the handler enforces this);
 * if both are set, both are forwarded and the first upstream result is used.
 */
export async function getLastContributions(
  client: EuropeApiClient,
  identifier: ContributionsIdentifier,
  lookbackMonths?: number,
): Promise<ContributionsResult> {
  const response = await client.getPaymentTotals({
    emails: identifier.email ? [identifier.email] : [],
    keycloakIds: identifier.keycloakId ? [identifier.keycloakId] : [],
    lookbackMonths,
  });

  const result = response.results[0];
  if (!result) return { found: false, contributions: {} };
  return mapResult(result);
}

/**
 * Maps a single upstream per-identifier result to our contributions contract.
 * `found` reflects whether the upstream recognised the person (customer_id),
 * independent of whether they have any payments in the window.
 */
export function mapResult(result: PaymentTotalsResult): ContributionsResult {
  const contributions: ContributionsMap = {};
  for (const row of result.totals_by_currency) {
    // Upstream sends a string-decimal (2dp). One row per currency, so no summation here.
    contributions[row.currency] = Number(row.total);
  }
  return { found: result.customer_id !== null, contributions };
}
