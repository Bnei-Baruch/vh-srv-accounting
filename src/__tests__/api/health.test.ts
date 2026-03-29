import request from 'supertest';
import express from 'express';
import { healthHandler } from '../../api/health';
import { errorHandler } from '../../middleware/errorHandler';

jest.mock('../../db/pool', () => ({
  checkDb: jest.fn(),
}));

import { checkDb } from '../../db/pool';

function buildApp() {
  const app = express();
  app.get('/health', healthHandler);
  app.use(errorHandler);
  return app;
}

describe('GET /health', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns 200 with status ok when DB is reachable', async () => {
    (checkDb as jest.Mock).mockResolvedValue(undefined);
    const res = await request(buildApp()).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});
