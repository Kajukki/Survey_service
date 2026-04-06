import type { GoogleAuthStartInput, GoogleAuthStartResult } from './provider-auth-api.service';
import {
  buildGoogleCallbackRedirectUri,
  createCodeVerifier,
  deriveS256CodeChallenge,
  savePendingGoogleOAuth,
} from './provider-oauth.util';

interface StartGoogleOAuthFlowInput {
  origin: string;
  storage: Storage;
  startGoogleAuth: (input: GoogleAuthStartInput) => Promise<GoogleAuthStartResult>;
  createVerifier?: () => string;
}

export async function startGoogleOAuthFlow(
  input: StartGoogleOAuthFlowInput,
): Promise<{ authorizationUrl: string }> {
  const codeVerifier = input.createVerifier ? input.createVerifier() : createCodeVerifier();
  const codeChallenge = await deriveS256CodeChallenge(codeVerifier);
  const redirectUri = buildGoogleCallbackRedirectUri(input.origin);

  const authStart = await input.startGoogleAuth({
    redirectUri,
    codeChallenge,
    codeChallengeMethod: 'S256',
  });

  savePendingGoogleOAuth(input.storage, {
    state: authStart.state,
    codeVerifier,
    redirectUri,
  });

  return {
    authorizationUrl: authStart.authorizationUrl,
  };
}
