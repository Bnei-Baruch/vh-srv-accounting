import { getLastContributions } from '../../quickbooks/contributions';
import { QbApiClient } from '../../quickbooks/apiClient';

function makeLine(accountName: string, amount: number) {
  return {
    DetailType: 'SalesItemLineDetail' as const,
    Amount: amount,
    SalesItemLineDetail: { ItemAccountRef: { name: accountName } },
  };
}

function makeReceipt(currency: string, lines: ReturnType<typeof makeLine>[]) {
  return { CurrencyRef: { value: currency }, Line: lines };
}

const DONATION_ACCOUNT = '44110 Donations/Maaser:Maaser';
const KABU_DONATIONS = '44100 Donations/Maaser:KabU Donations';
const REVENUE_ACCOUNT = '40110 KabU Revenue:KabU Retreats';

describe('getLastContributions', () => {
  let mockQuery: jest.Mock;
  let mockClient: QbApiClient;

  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery = jest.fn();
    mockClient = { query: mockQuery } as unknown as QbApiClient;
  });

  test('returns found: false when no QB customer found for email', async () => {
    mockQuery.mockResolvedValueOnce([]);
    const result = await getLastContributions(mockClient, 'company1', 'nobody@example.com');
    expect(result).toEqual({ found: false, contributions: {} });
    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(mockQuery).toHaveBeenCalledWith('company1', expect.stringContaining("PrimaryEmailAddr = 'nobody@example.com'"));
  });

  test('customer query includes Active = true filter', async () => {
    mockQuery.mockResolvedValueOnce([]);
    await getLastContributions(mockClient, 'company1', 'test@example.com');
    expect(mockQuery).toHaveBeenCalledWith('company1', expect.stringContaining('Active = true'));
  });

  test('returns found: true with empty contributions when customer has no receipts', async () => {
    mockQuery.mockResolvedValueOnce([{ Id: '123' }]).mockResolvedValueOnce([]);
    const result = await getLastContributions(mockClient, 'company1', 'user@example.com');
    expect(result).toEqual({ found: true, contributions: {} });
  });

  test('returns found: true with empty contributions when receipts have no donation lines', async () => {
    mockQuery
      .mockResolvedValueOnce([{ Id: '123' }])
      .mockResolvedValueOnce([makeReceipt('USD', [makeLine(REVENUE_ACCOUNT, 399)])]);
    const result = await getLastContributions(mockClient, 'company1', 'user@example.com');
    expect(result).toEqual({ found: true, contributions: {} });
  });

  test('sums donation lines, ignoring non-SalesItemLineDetail lines', async () => {
    mockQuery
      .mockResolvedValueOnce([{ Id: '123' }])
      .mockResolvedValueOnce([{
        CurrencyRef: { value: 'USD' },
        Line: [
          makeLine(DONATION_ACCOUNT, 100),
          { DetailType: 'SubTotalLineDetail', Amount: 100 },
        ],
      }]);
    const result = await getLastContributions(mockClient, 'company1', 'user@example.com');
    expect(result).toEqual({ found: true, contributions: { USD: 100 } });
  });

  test('filters non-donation lines in a mixed receipt', async () => {
    // Based on real case: retreat + donation + merchandise in one receipt
    mockQuery
      .mockResolvedValueOnce([{ Id: '123' }])
      .mockResolvedValueOnce([makeReceipt('USD', [
        makeLine(REVENUE_ACCOUNT, 399),
        makeLine(DONATION_ACCOUNT, 99),
        makeLine('41001 KabU Revenue:KabU Store', 60),
      ])]);
    const result = await getLastContributions(mockClient, 'company1', 'user@example.com');
    expect(result).toEqual({ found: true, contributions: { USD: 99 } });
  });

  test('sums donation lines across multiple receipts', async () => {
    mockQuery
      .mockResolvedValueOnce([{ Id: '123' }])
      .mockResolvedValueOnce([
        makeReceipt('USD', [makeLine(DONATION_ACCOUNT, 100)]),
        makeReceipt('USD', [makeLine(KABU_DONATIONS, 200)]),
      ]);
    const result = await getLastContributions(mockClient, 'company1', 'user@example.com');
    expect(result).toEqual({ found: true, contributions: { USD: 300 } });
  });

  test('groups by currency across receipts', async () => {
    mockQuery
      .mockResolvedValueOnce([{ Id: '123' }])
      .mockResolvedValueOnce([
        makeReceipt('USD', [makeLine(DONATION_ACCOUNT, 100)]),
        makeReceipt('ILS', [makeLine(DONATION_ACCOUNT, 500)]),
      ]);
    const result = await getLastContributions(mockClient, 'company1', 'user@example.com');
    expect(result).toEqual({ found: true, contributions: { USD: 100, ILS: 500 } });
  });

  test('aggregates across multiple customers sharing the same email', async () => {
    mockQuery
      .mockResolvedValueOnce([{ Id: '111' }, { Id: '222' }])
      .mockResolvedValueOnce([makeReceipt('USD', [makeLine(DONATION_ACCOUNT, 100)])])
      .mockResolvedValueOnce([makeReceipt('USD', [makeLine(DONATION_ACCOUNT, 200)])]);
    const result = await getLastContributions(mockClient, 'company1', 'shared@example.com');
    expect(result).toEqual({ found: true, contributions: { USD: 300 } });
    expect(mockQuery).toHaveBeenCalledWith('company1', expect.stringContaining("CustomerRef = '111'"));
    expect(mockQuery).toHaveBeenCalledWith('company1', expect.stringContaining("CustomerRef = '222'"));
  });

  test('paginates when a page returns exactly 1000 receipts', async () => {
    const page1 = Array.from({ length: 1000 }, () =>
      makeReceipt('USD', [makeLine(DONATION_ACCOUNT, 1)]),
    );
    const page2 = [makeReceipt('USD', [makeLine(DONATION_ACCOUNT, 50)])];

    mockQuery
      .mockResolvedValueOnce([{ Id: '123' }])
      .mockResolvedValueOnce(page1)
      .mockResolvedValueOnce(page2);

    const result = await getLastContributions(mockClient, 'company1', 'user@example.com');
    expect(result).toEqual({ found: true, contributions: { USD: 1050 } });
    expect(mockQuery).toHaveBeenCalledTimes(3);
    expect(mockQuery).toHaveBeenCalledWith('company1', expect.stringContaining('STARTPOSITION 1'));
    expect(mockQuery).toHaveBeenCalledWith('company1', expect.stringContaining('STARTPOSITION 1001'));
  });
});
