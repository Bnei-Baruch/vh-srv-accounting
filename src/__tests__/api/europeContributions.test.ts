import request from 'supertest';
import { createEuropeContributionsRouter } from '../../api/europe/contributionsHandler';
import { createEuropeRouter } from '../../api/europe/router';
import * as contributions from '../../europe/contributions';
import { EuropeApiClient } from '../../europe/paymentTotalsClient';
import { ValidationError } from '../../common/errors';
import { createTestApp, TestClaims } from '../setup';

jest.mock('../../europe/contributions');
jest.mock('keycloak-connect');

function buildApp(mockClient: EuropeApiClient, claims: TestClaims = {}) {
  return createTestApp('/v1/europe', (kc) => createEuropeContributionsRouter(kc, mockClient), claims);
}

function mockClientWith(getPaymentTotals: jest.Mock): EuropeApiClient {
  return { getPaymentTotals } as unknown as EuropeApiClient;
}

describe('GET /v1/europe/contributions', () => {
  let getLast: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    getLast = contributions.getLastContributions as jest.Mock;
  });

  test('returns 400 when no identifier is provided', async () => {
    const res = await request(buildApp(mockClientWith(jest.fn()))).get('/v1/europe/contributions');
    expect(res.status).toBe(400);
  });

  test('returns 400 when both email and keycloak_id are provided', async () => {
    const res = await request(buildApp(mockClientWith(jest.fn()))).get(
      '/v1/europe/contributions?email=a@b.com&keycloak_id=sub-1',
    );
    expect(res.status).toBe(400);
  });

  test('admin can query any email and gets the QB-style envelope with a single europe source', async () => {
    getLast.mockResolvedValue({ found: true, contributions: { EUR: 1758 } });

    const res = await request(buildApp(mockClientWith(jest.fn()), { roles: ['vh_admin'] })).get(
      '/v1/europe/contributions?email=someone@else.com',
    );

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual({
      found: true,
      total: { EUR: 1758 },
      sources: [{ source: 'europe', found: true, contributions: { EUR: 1758 } }],
    });
  });

  test('non-admin owner can query their own email', async () => {
    getLast.mockResolvedValue({ found: true, contributions: { USD: 10 } });
    const res = await request(
      buildApp(mockClientWith(jest.fn()), { email: 'me@test.com', roles: [] }),
    ).get('/v1/europe/contributions?email=me@test.com');
    expect(res.status).toBe(200);
  });

  test('non-admin cannot query another email', async () => {
    const res = await request(
      buildApp(mockClientWith(jest.fn()), { email: 'me@test.com', roles: [] }),
    ).get('/v1/europe/contributions?email=other@test.com');
    expect(res.status).toBe(403);
    expect(getLast).not.toHaveBeenCalled();
  });

  test('non-admin owner can query their own keycloak_id', async () => {
    getLast.mockResolvedValue({ found: false, contributions: {} });
    const res = await request(
      buildApp(mockClientWith(jest.fn()), { sub: 'sub-1', roles: [] }),
    ).get('/v1/europe/contributions?keycloak_id=sub-1');
    expect(res.status).toBe(200);
  });

  test('non-admin cannot query another keycloak_id', async () => {
    const res = await request(
      buildApp(mockClientWith(jest.fn()), { sub: 'sub-1', roles: [] }),
    ).get('/v1/europe/contributions?keycloak_id=sub-2');
    expect(res.status).toBe(403);
  });

  test('forwards lookback_months to the domain layer', async () => {
    getLast.mockResolvedValue({ found: true, contributions: {} });
    await request(buildApp(mockClientWith(jest.fn()))).get(
      '/v1/europe/contributions?email=a@b.com&lookback_months=24',
    );
    expect(getLast).toHaveBeenCalledWith(expect.anything(), { email: 'a@b.com', keycloakId: undefined }, 24);
  });

  test('returns 400 for a non-integer lookback_months', async () => {
    const res = await request(buildApp(mockClientWith(jest.fn()))).get(
      '/v1/europe/contributions?email=a@b.com&lookback_months=abc',
    );
    expect(res.status).toBe(400);
  });
});

describe('POST /v1/europe/contributions/batch', () => {
  let mapResult: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mapResult = contributions.mapResult as jest.Mock;
  });

  test('non-admin is forbidden', async () => {
    const getPaymentTotals = jest.fn();
    const res = await request(buildApp(mockClientWith(getPaymentTotals), { roles: [] }))
      .post('/v1/europe/contributions/batch')
      .send({ emails: ['a@b.com'] });
    expect(res.status).toBe(403);
    expect(getPaymentTotals).not.toHaveBeenCalled();
  });

  test('admin gets per-identifier results in upstream order', async () => {
    const getPaymentTotals = jest.fn().mockResolvedValue({
      lookback_months: 12,
      cutoff_date: '2025-06-09T02:58:43.380862Z',
      results: [
        { identifier_type: 'email', identifier: 'a@b.com' },
        { identifier_type: 'keycloak_id', identifier: 'sub-1' },
      ],
    });
    mapResult
      .mockReturnValueOnce({ found: true, contributions: { EUR: 100 } })
      .mockReturnValueOnce({ found: false, contributions: {} });

    const res = await request(buildApp(mockClientWith(getPaymentTotals), { roles: ['vh_admin'] }))
      .post('/v1/europe/contributions/batch')
      .send({ emails: ['a@b.com'], keycloak_ids: ['sub-1'], lookback_months: 12 });

    expect(res.status).toBe(200);
    expect(getPaymentTotals).toHaveBeenCalledWith({
      emails: ['a@b.com'],
      keycloakIds: ['sub-1'],
      lookbackMonths: 12,
    });
    expect(res.body.data).toEqual({
      cutoffDate: '2025-06-09T02:58:43.380862Z',
      lookbackMonths: 12,
      results: [
        { identifierType: 'email', identifier: 'a@b.com', found: true, contributions: { EUR: 100 } },
        { identifierType: 'keycloak_id', identifier: 'sub-1', found: false, contributions: {} },
      ],
    });
  });

  test('createEuropeRouter mounts the contributions routes', async () => {
    (contributions.getLastContributions as jest.Mock).mockResolvedValue({ found: false, contributions: {} });
    const app = createTestApp('/v1/europe', (kc) => createEuropeRouter(kc, mockClientWith(jest.fn())));
    const res = await request(app).get('/v1/europe/contributions?email=user@test.com');
    expect(res.status).toBe(200);
  });

  test('propagates a client ValidationError as 400', async () => {
    const getPaymentTotals = jest.fn().mockRejectedValue(new ValidationError('at most 100 identifiers'));
    const res = await request(buildApp(mockClientWith(getPaymentTotals), { roles: ['vh_admin'] }))
      .post('/v1/europe/contributions/batch')
      .send({ emails: [] });
    expect(res.status).toBe(400);
  });
});
