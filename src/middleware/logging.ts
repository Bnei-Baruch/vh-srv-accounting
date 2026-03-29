import pinoHttp from 'pino-http';
import { nuid } from '@nats-io/nuid';
import { logger } from '../common/logger';

export const loggingMiddleware = pinoHttp({
  logger,
  genReqId: (req) => (req.headers['x-request-id'] as string) ?? nuid.next(),
  customLogLevel: (_req, res) => {
    if (res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  serializers: {
    req: (req) => ({
      method: req.method,
      url: req.url,
      userAgent: req.headers['user-agent'],
    }),
    res: (res) => ({ statusCode: res.statusCode, contentLength: res.headers['content-length'] }),
  },
});
