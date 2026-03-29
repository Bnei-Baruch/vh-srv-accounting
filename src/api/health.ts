import { RequestHandler } from 'express';
import { checkDb } from '../db/pool';

export const healthHandler: RequestHandler = async (_req, res) => {
  await checkDb();
  res.json({ status: 'ok' });
};
