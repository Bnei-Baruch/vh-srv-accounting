export type ContributionsMap = Record<string, number>;

export interface ContributionsResult {
  found: boolean;
  contributions: ContributionsMap;
}

/**
 * Sums a set of currency→amount maps into a single map.
 * Shared across providers (QuickBooks, Europe) so the contributions
 * aggregation logic lives in one place.
 */
export function mergeContributions(maps: ContributionsMap[]): ContributionsMap {
  const result: ContributionsMap = {};
  for (const map of maps) {
    for (const [currency, amount] of Object.entries(map)) {
      result[currency] = (result[currency] ?? 0) + amount;
    }
  }
  return result;
}
