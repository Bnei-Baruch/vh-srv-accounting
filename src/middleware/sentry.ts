import * as Sentry from '@sentry/node';
import { Request, Response, NextFunction } from 'express';
import { config } from '../common/config';
import { ServiceName } from '../common/consts';

export function initSentry(): void {
  if (!config.sentryDsn) return;

  Sentry.init({
    dsn: config.sentryDsn,
    release: config.gitSha,
    environment: config.env,
    integrations: [Sentry.httpIntegration()],
    tracesSampleRate: 0,
  });
}

export function sentryErrorHandler() {
  return (err: Error, req: Request, res: Response, next: NextFunction): void => {
    if (res.statusCode >= 500) {
      Sentry.captureException(err);
    }
    next(err);
  };
}
