import KeycloakConnect from 'keycloak-connect';
import { config } from '../common/config';

export function createKeycloak(): KeycloakConnect.Keycloak {
  return new KeycloakConnect(
    {},
    {
      'auth-server-url': config.keycloakServerUrl,
      realm: config.keycloakRealm,
      resource: config.keycloakClientId,
      'bearer-only': true,
      'confidential-port': 0,
      'ssl-required': 'external',
    },
  );
}
