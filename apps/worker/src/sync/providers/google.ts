import { GoogleFormsConnector } from '@survey-service/connectors';
import type { WorkerConfig } from '../../config.js';
import { createFetchHttpClient } from '../http-client.js';

export function createGoogleFormsConnector(config: WorkerConfig): GoogleFormsConnector {
  return new GoogleFormsConnector(
    {
      clientId: config.GOOGLE_OAUTH_CLIENT_ID,
      clientSecret: config.GOOGLE_OAUTH_CLIENT_SECRET,
      authBaseUrl: config.GOOGLE_OAUTH_AUTH_BASE_URL,
      tokenUrl: config.GOOGLE_OAUTH_TOKEN_URL,
      formsApiBaseUrl: config.GOOGLE_FORMS_API_BASE_URL,
    },
    createFetchHttpClient(),
  );
}
