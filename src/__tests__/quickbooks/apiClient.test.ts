import OAuthClient from 'intuit-oauth';
import { QbApiClient } from '../../quickbooks/apiClient';
import { TokenManager } from '../../quickbooks/tokenManager';

jest.mock('intuit-oauth');
jest.mock('../../quickbooks/tokenManager');

describe('QbApiClient.query', () => {
  let client: QbApiClient;
  let mockMakeApiCall: jest.Mock;
  let mockManager: jest.Mocked<Pick<TokenManager, 'getAccessToken'>>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockMakeApiCall = jest.fn();
    (OAuthClient as unknown as jest.Mock).mockImplementation(() => ({
      setToken: jest.fn(),
      makeApiCall: mockMakeApiCall,
    }));

    mockManager = { getAccessToken: jest.fn().mockResolvedValue('test-access-token') };
    client = new QbApiClient(mockManager as unknown as TokenManager);
  });

  test('returns the entity array from QueryResponse', async () => {
    mockMakeApiCall.mockResolvedValue({
      json: {
        QueryResponse: {
          Customer: [{ Id: '1' }, { Id: '2' }],
          startPosition: 1,
          maxResults: 2,
        },
      },
    });
    const result = await client.query('company1', 'SELECT * FROM Customer');
    expect(result).toEqual([{ Id: '1' }, { Id: '2' }]);
  });

  test('returns [] when QueryResponse has no entity array (empty result)', async () => {
    mockMakeApiCall.mockResolvedValue({ json: { QueryResponse: {} } });
    const result = await client.query('company1', 'SELECT * FROM Customer WHERE Active = false');
    expect(result).toEqual([]);
  });

  test('throws with QB error detail on Fault response', async () => {
    mockMakeApiCall.mockResolvedValue({
      json: {
        Fault: {
          Error: [{ Detail: "QueryValidationError: property 'BillEmail' is not queryable", code: '4001' }],
        },
      },
    });
    await expect(client.query('company1', 'bad query')).rejects.toThrow(
      "QueryValidationError: property 'BillEmail' is not queryable",
    );
  });

  test('throws generic message on Fault with no error detail', async () => {
    mockMakeApiCall.mockResolvedValue({ json: { Fault: {} } });
    await expect(client.query('company1', 'bad query')).rejects.toThrow('QB API error');
  });

  test('builds URL with correct company, minorversion, and encoded query', async () => {
    mockMakeApiCall.mockResolvedValue({ json: { QueryResponse: {} } });
    await client.query('9130353260751136', 'SELECT * FROM SalesReceipt');

    const { url, method } = mockMakeApiCall.mock.calls[0][0];
    expect(method).toBe('GET');
    expect(url).toContain('/v3/company/9130353260751136/query');
    expect(url).toContain('minorversion=70');
    expect(url).toContain('query=SELECT');
  });
});
