import { Router } from 'express';
import KeycloakConnect from 'keycloak-connect';
import { TokenStore } from '../../quickbooks/tokenStore';
import { TokenManager } from '../../quickbooks/tokenManager';
import { QbApiClient } from '../../quickbooks/apiClient';
import { createAuthRouter } from './authRouter';
import { createCompaniesRouter } from './companiesHandler';
import { createContributionsRouter } from './contributionsHandler';

export function createQuickBooksRouter(
  keycloak: KeycloakConnect.Keycloak,
  tokenStore: TokenStore,
  tokenManager: TokenManager,
  qbClient: QbApiClient,
): Router {
  const router = Router();

  router.use('/auth', createAuthRouter(keycloak, tokenStore, tokenManager));
  router.use('/companies', createCompaniesRouter(keycloak, tokenStore, qbClient));
  router.use('/', createContributionsRouter(keycloak, tokenStore, qbClient));

  return router;
}
