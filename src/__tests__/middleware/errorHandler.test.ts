import request from 'supertest';
import express from 'express';
import { errorHandler } from '../../middleware/errorHandler';
import { ValidationError, NotFoundError } from '../../common/errors';

jest.mock('../../common/logger', () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  logFor: jest.fn().mockReturnValue({ error: jest.fn(), info: jest.fn(), warn: jest.fn() }),
}));

function buildApp(thrower: () => never) {
  const app = express();
  app.get('/test', () => {
    thrower();
  });
  app.use(errorHandler);
  return app;
}

describe('errorHandler', () => {
  test('maps ValidationError to 400 with error message', async () => {
    const app = buildApp(() => {
      throw new ValidationError('bad input');
    });
    const res = await request(app).get('/test');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'bad input', success: false });
  });

  test('maps NotFoundError to 404 with error message', async () => {
    const app = buildApp(() => {
      throw new NotFoundError('thing not found');
    });
    const res = await request(app).get('/test');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'thing not found', success: false });
  });

  test('maps unknown Error to 500 without leaking message', async () => {
    const app = buildApp(() => {
      throw new Error('secret internal detail');
    });
    const res = await request(app).get('/test');
    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
    expect(res.body.error).not.toContain('secret internal detail');
  });

  test('calls logFor(req).error for unhandled errors', async () => {
    const { logFor } = jest.requireMock('../../common/logger') as {
      logFor: jest.Mock;
    };
    logFor.mockClear();
    const mockErrorFn = jest.fn();
    logFor.mockReturnValue({ error: mockErrorFn });

    const app = buildApp(() => {
      throw new Error('boom');
    });
    await request(app).get('/test');
    expect(logFor).toHaveBeenCalled();
    expect(mockErrorFn).toHaveBeenCalled();
  });
});
