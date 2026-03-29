import request from 'supertest';
import { createContributionsRouter } from '../../api/quickbooks/contributionsHandler';
import * as contributions from '../../quickbooks/contributions';
import { TokenStore, OAuthToken } from '../../quickbooks/tokenStore';
import { QbApiClient } from '../../quickbooks/apiClient';
import { createTestApp } from '../setup';

jest.mock('../../quickbooks/contributions');
jest.mock('keycloak-connect');

function makeToken(companyId: string): OAuthToken {
  return {
    id: 1,
    provider: 'quickbooks',
    companyId,
    companyName: 'Test Corp',
    enabled: true,
    accessToken: 'at',
    refreshToken: 'rt',
    tokenType: 'Bearer',
    expiresAt: new Date(Date.now() + 3600 * 1000),
    refreshTokenExpiresAt: new Date(Date.now() + 180 * 24 * 3600 * 1000),
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function buildApp(mockStore: jest.Mocked<TokenStore>) {
  const mockQbClient = {} as QbApiClient;
  return createTestApp('/v1/quickbooks', (kc) => createContributionsRouter(kc, mockStore, mockQbClient));
}

describe('GET /v1/quickbooks/contributions', () => {
  let mockStore: jest.Mocked<TokenStore>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockStore = {
      getToken: jest.fn(),
      getAllTokens: jest.fn(),
      upsertToken: jest.fn(),
      updateTokens: jest.fn(),
      updateCompany: jest.fn(),
      deleteToken: jest.fn(),
    } as unknown as jest.Mocked<TokenStore>;
  });

  test('returns 400 when email is missing', async () => {
    const res = await request(buildApp(mockStore)).get('/v1/quickbooks/contributions');
    expect(res.status).toBe(400);
  });

  test('aggregates across enabled companies', async () => {
    mockStore.getAllTokens.mockResolvedValue([makeToken('111'), makeToken('222')]);
    (contributions.getLastContributions as jest.Mock)
      .mockResolvedValueOnce({ USD: 100 })
      .mockResolvedValueOnce({ USD: 200, ILS: 500 });
    (contributions.mergeContributions as jest.Mock).mockReturnValue({ USD: 300, ILS: 500 });

    const res = await request(buildApp(mockStore)).get('/v1/quickbooks/contributions?email=user@test.com');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual({ USD: 300, ILS: 500 });
  });

  test('filters by company_id when provided', async () => {
    mockStore.getToken.mockResolvedValue(makeToken('111'));
    (contributions.getLastContributions as jest.Mock).mockResolvedValue({ USD: 500 });

    const res = await request(buildApp(mockStore)).get(
      '/v1/quickbooks/contributions?email=user@test.com&company_id=111',
    );
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ USD: 500 });
  });

  test('returns 404 for unknown company_id', async () => {
    mockStore.getToken.mockResolvedValue(null);

    const res = await request(buildApp(mockStore)).get(
      '/v1/quickbooks/contributions?email=user@test.com&company_id=999',
    );
    expect(res.status).toBe(404);
  });
});

describe('mergeContributions', () => {
  // Use the real implementation, not the mocked version
  const { mergeContributions } = jest.requireActual(
    '../../quickbooks/contributions',
  ) as typeof import('../../quickbooks/contributions');

  test('returns empty object for empty array', () => {
    expect(mergeContributions([])).toEqual({});
  });

  test('returns the map unchanged for a single input', () => {
    expect(mergeContributions([{ USD: 100, ILS: 500 }])).toEqual({ USD: 100, ILS: 500 });
  });

  test('sums amounts for the same currency across maps', () => {
    expect(mergeContributions([{ USD: 100 }, { USD: 200 }])).toEqual({ USD: 300 });
  });

  test('merges different currencies across maps', () => {
    expect(mergeContributions([{ USD: 100 }, { ILS: 500 }])).toEqual({ USD: 100, ILS: 500 });
  });

  test('handles one empty map and one non-empty map', () => {
    expect(mergeContributions([{}, { EUR: 75 }])).toEqual({ EUR: 75 });
  });

  test('sums correctly across three maps with mixed currencies', () => {
    expect(mergeContributions([{ USD: 50 }, { USD: 50, ILS: 100 }, { ILS: 100, EUR: 25 }])).toEqual({
      USD: 100,
      ILS: 200,
      EUR: 25,
    });
  });
});
