import request from 'supertest';
import { createCompaniesRouter } from '../../api/quickbooks/companiesHandler';
import { TokenStore, OAuthToken } from '../../quickbooks/tokenStore';
import { createTestApp } from '../setup';

jest.mock('keycloak-connect');

function makeToken(id: number, companyId = '123'): OAuthToken {
  return {
    id,
    provider: 'quickbooks',
    companyId,
    companyName: 'Acme Corp',
    enabled: true,
    accessToken: 'secret-access-token',
    refreshToken: 'secret-refresh-token',
    tokenType: 'Bearer',
    expiresAt: new Date(Date.now() + 3600 * 1000),
    refreshTokenExpiresAt: new Date(Date.now() + 180 * 24 * 3600 * 1000),
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe('GET /companies', () => {
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

  test('returns sanitized list without token fields', async () => {
    mockStore.getAllTokens.mockResolvedValue([makeToken(1), makeToken(2, '456')]);
    const app = createTestApp('/companies', (kc) => createCompaniesRouter(kc, mockStore));
    const res = await request(app).get('/companies');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(2);

    for (const item of res.body.data) {
      expect(item).not.toHaveProperty('accessToken');
      expect(item).not.toHaveProperty('refreshToken');
      expect(item).toHaveProperty('companyId');
      expect(item).toHaveProperty('enabled');
    }
  });

  test('GET /:id returns company by id', async () => {
    mockStore.getAllTokens.mockResolvedValue([makeToken(42)]);
    const app = createTestApp('/companies', (kc) => createCompaniesRouter(kc, mockStore));
    const res = await request(app).get('/companies/42');

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(42);
  });

  test('GET /:id returns 400 for non-numeric id', async () => {
    const app = createTestApp('/companies', (kc) => createCompaniesRouter(kc, mockStore));
    const res = await request(app).get('/companies/abc');
    expect(res.status).toBe(400);
  });

  test('GET /:id returns 404 when company not found', async () => {
    mockStore.getAllTokens.mockResolvedValue([]);
    const app = createTestApp('/companies', (kc) => createCompaniesRouter(kc, mockStore));
    const res = await request(app).get('/companies/999');
    expect(res.status).toBe(404);
  });

  test('PATCH /:id updates companyName', async () => {
    const updated = makeToken(1);
    updated.companyName = 'New Name';
    mockStore.updateCompany.mockResolvedValue(updated);

    const app = createTestApp('/companies', (kc) => createCompaniesRouter(kc, mockStore));
    const res = await request(app).patch('/companies/1').send({ companyName: 'New Name' });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Updated!');
    expect(mockStore.updateCompany).toHaveBeenCalledWith(1, { companyName: 'New Name', enabled: undefined });
  });

  test('PATCH /:id updates enabled', async () => {
    const updated = { ...makeToken(1), enabled: false };
    mockStore.updateCompany.mockResolvedValue(updated);

    const app = createTestApp('/companies', (kc) => createCompaniesRouter(kc, mockStore));
    const res = await request(app).patch('/companies/1').send({ enabled: false });

    expect(res.status).toBe(200);
    expect(mockStore.updateCompany).toHaveBeenCalledWith(1, { companyName: undefined, enabled: false });
  });

  test('PATCH /:id returns 400 when no fields provided', async () => {
    const app = createTestApp('/companies', (kc) => createCompaniesRouter(kc, mockStore));
    const res = await request(app).patch('/companies/1').send({});
    expect(res.status).toBe(400);
  });

  test('PATCH /:id returns 400 for non-numeric id', async () => {
    const app = createTestApp('/companies', (kc) => createCompaniesRouter(kc, mockStore));
    const res = await request(app).patch('/companies/abc').send({ enabled: true });
    expect(res.status).toBe(400);
  });

  test('PATCH /:id returns 404 when company not found', async () => {
    mockStore.updateCompany.mockResolvedValue(null);
    const app = createTestApp('/companies', (kc) => createCompaniesRouter(kc, mockStore));
    const res = await request(app).patch('/companies/999').send({ enabled: false });
    expect(res.status).toBe(404);
  });

  test('DELETE /:id removes company', async () => {
    mockStore.deleteToken.mockResolvedValue(true);
    const app = createTestApp('/companies', (kc) => createCompaniesRouter(kc, mockStore));
    const res = await request(app).delete('/companies/1');
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Deleted!');
  });

  test('DELETE /:id returns 400 for non-numeric id', async () => {
    const app = createTestApp('/companies', (kc) => createCompaniesRouter(kc, mockStore));
    const res = await request(app).delete('/companies/abc');
    expect(res.status).toBe(400);
  });

  test('DELETE /:id returns 404 when company not found', async () => {
    mockStore.deleteToken.mockResolvedValue(false);
    const app = createTestApp('/companies', (kc) => createCompaniesRouter(kc, mockStore));
    const res = await request(app).delete('/companies/999');
    expect(res.status).toBe(404);
  });

  test('returns 403 when user lacks admin role', async () => {
    mockStore.getAllTokens.mockResolvedValue([makeToken(1)]);
    const app = createTestApp('/companies', (kc) => createCompaniesRouter(kc, mockStore), { roles: [] });
    const res = await request(app).get('/companies');
    expect(res.status).toBe(403);
  });
});
