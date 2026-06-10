import { getLastContributions, mapResult } from '../../europe/contributions';
import { EuropeApiClient } from '../../europe/paymentTotalsClient';
import { PaymentTotalsResponse, PaymentTotalsResult } from '../../europe/types';

function makeResult(overrides: Partial<PaymentTotalsResult> = {}): PaymentTotalsResult {
  return {
    identifier_type: 'email',
    identifier: 'alice@example.com',
    customer_id: 67571,
    resolved_emails: ['alice@example.com'],
    totals_by_currency: [],
    ...overrides,
  };
}

function makeResponse(results: PaymentTotalsResult[]): PaymentTotalsResponse {
  return { lookback_months: 12, cutoff_date: '2025-06-09T02:58:43.380862Z', results };
}

describe('mapResult', () => {
  test('parses string-decimal totals into numbers, keyed by currency', () => {
    const result = makeResult({
      totals_by_currency: [
        { currency: 'EUR', total: '1758.00', transaction_count: 18 },
        { currency: 'USD', total: '120.50', transaction_count: 2 },
      ],
    });
    expect(mapResult(result)).toEqual({ found: true, contributions: { EUR: 1758, USD: 120.5 } });
  });

  test('found is true with empty contributions for a recognised person with no payments', () => {
    expect(mapResult(makeResult({ totals_by_currency: [] }))).toEqual({ found: true, contributions: {} });
  });

  test('found is false when the upstream did not recognise the person (customer_id null)', () => {
    const result = makeResult({ customer_id: null, totals_by_currency: [] });
    expect(mapResult(result)).toEqual({ found: false, contributions: {} });
  });

  test('preserves negative totals (refund larger than payment in window)', () => {
    const result = makeResult({
      totals_by_currency: [{ currency: 'EUR', total: '-5.00', transaction_count: 2 }],
    });
    expect(mapResult(result).contributions).toEqual({ EUR: -5 });
  });
});

describe('getLastContributions', () => {
  let mockGet: jest.Mock;
  let mockClient: EuropeApiClient;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGet = jest.fn();
    mockClient = { getPaymentTotals: mockGet } as unknown as EuropeApiClient;
  });

  test('queries by email and maps the first result', async () => {
    mockGet.mockResolvedValue(
      makeResponse([makeResult({ totals_by_currency: [{ currency: 'EUR', total: '50.00', transaction_count: 1 }] })]),
    );
    const result = await getLastContributions(mockClient, { email: 'alice@example.com' });
    expect(result).toEqual({ found: true, contributions: { EUR: 50 } });
    expect(mockGet).toHaveBeenCalledWith({ emails: ['alice@example.com'], keycloakIds: [], lookbackMonths: undefined });
  });

  test('queries by keycloak_id', async () => {
    mockGet.mockResolvedValue(makeResponse([makeResult({ identifier_type: 'keycloak_id' })]));
    await getLastContributions(mockClient, { keycloakId: 'sub-1' }, 24);
    expect(mockGet).toHaveBeenCalledWith({ emails: [], keycloakIds: ['sub-1'], lookbackMonths: 24 });
  });

  test('returns found: false when the upstream returns no results', async () => {
    mockGet.mockResolvedValue(makeResponse([]));
    const result = await getLastContributions(mockClient, { email: 'nobody@example.com' });
    expect(result).toEqual({ found: false, contributions: {} });
  });
});
