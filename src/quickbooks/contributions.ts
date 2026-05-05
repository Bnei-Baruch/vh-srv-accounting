import { QbApiClient } from './apiClient';

export type ContributionsMap = Record<string, number>;

interface QbCustomer {
  Id: string;
}

interface QbSalesReceipt {
  CurrencyRef: { value: string };
  Line: Array<{
    DetailType: string;
    Amount: number;
    SalesItemLineDetail?: {
      ItemAccountRef?: { name: string };
    };
  }>;
}

const DONATION_ACCOUNT_MARKER = 'Donations/Maaser';

export async function getLastContributions(
  client: QbApiClient,
  companyId: string,
  email: string,
): Promise<ContributionsMap> {
  const customers = await client.query<QbCustomer>(
    companyId,
    `SELECT * FROM Customer WHERE PrimaryEmailAddr = '${email}' AND Active = true`,
  );

  if (customers.length === 0) return {};

  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - 1);
  const cutoffDate = cutoff.toISOString().slice(0, 10);

  const maps = await Promise.all(
    customers.map((c) => fetchDonationsByCustomer(client, companyId, c.Id, cutoffDate)),
  );
  return mergeContributions(maps);
}

async function fetchDonationsByCustomer(
  client: QbApiClient,
  companyId: string,
  customerId: string,
  cutoffDate: string,
): Promise<ContributionsMap> {
  const totals: ContributionsMap = {};
  let startPosition = 1;

  while (true) {
    const receipts = await client.query<QbSalesReceipt>(
      companyId,
      `SELECT * FROM SalesReceipt WHERE CustomerRef = '${customerId}' AND TxnDate >= '${cutoffDate}' MAXRESULTS 1000 STARTPOSITION ${startPosition}`,
    );

    for (const receipt of receipts) {
      const currency = receipt.CurrencyRef.value;
      for (const line of receipt.Line) {
        if (line.DetailType !== 'SalesItemLineDetail') continue;
        const account = line.SalesItemLineDetail?.ItemAccountRef?.name ?? '';
        if (!account.includes(DONATION_ACCOUNT_MARKER)) continue;
        totals[currency] = (totals[currency] ?? 0) + line.Amount;
      }
    }

    if (receipts.length < 1000) break;
    startPosition += 1000;
  }

  return totals;
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
