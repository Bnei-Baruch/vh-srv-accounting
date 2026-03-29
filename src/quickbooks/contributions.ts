import { QbApiClient } from './apiClient';

export type ContributionsMap = Record<string, number>;

/**
 * STUB: Returns mock contribution data.
 *
 * TODO: Replace with actual QuickBooks query once the entity mapping is determined.
 * The query should:
 *   - Find customer(s) by email in QuickBooks
 *   - Fetch their transactions (Invoice / Payment / SalesReceipt) for the last 12 months
 *   - Sum amounts by currency code
 *   - Return map[currency]amount matching the Priority GetLastContributions contract
 */
export async function getLastContributions(
  _client: QbApiClient,
  _companyId: string,
  _email: string,
): Promise<ContributionsMap> {
  // TODO: implement real QB query
  return {};
}

export function mergeContributions(maps: ContributionsMap[]): ContributionsMap {
  const result: ContributionsMap = {};
  for (const map of maps) {
    for (const [currency, amount] of Object.entries(map)) {
      result[currency] = (result[currency] ?? 0) + amount;
    }
  }
  return result;
}
