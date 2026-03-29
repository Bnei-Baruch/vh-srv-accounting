import { Request, Response, NextFunction } from 'express';
import { NotFoundError, ValidationError } from '../common/errors';
import { logFor } from '../common/logger';

export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof ValidationError) {
    res.status(400).json({ error: err.message, success: false });
    return;
  }

  if (err instanceof NotFoundError) {
    res.status(404).json({ error: err.message, success: false });
    return;
  }

  logFor(req).error({ err }, 'Unhandled error');
  res.status(500).json({ error: 'Internal server error', success: false });
}
