import { Router } from 'express';
import KeycloakConnect from 'keycloak-connect';
import { EuropeApiClient } from '../../europe/paymentTotalsClient';
import { createEuropeContributionsRouter } from './contributionsHandler';

export function createEuropeRouter(
  keycloak: KeycloakConnect.Keycloak,
  europeClient: EuropeApiClient,
): Router {
  const router = Router();

  router.use('/', createEuropeContributionsRouter(keycloak, europeClient));

  return router;
}
