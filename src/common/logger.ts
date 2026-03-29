import pino from 'pino';
import { Request } from 'express';

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level: (label) => ({ level: label }),
  },
});

export function logFor(req: Request) {
  return req.log ?? logger;
}
