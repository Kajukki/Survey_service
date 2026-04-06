import type { GoogleAuthCallbackInput, LinkedGoogleConnection } from './provider-auth.client';
import {
  buildGoogleCallbackRedirectUri,
  buildProviderCallbackUrl,
  consumePendingGoogleOAuth,
  parseAuthCallback,
} from './provider-oauth.util';

interface CallbackSessionApi {
  handleAuthCallback(url: string): void;
}

interface CallbackProviderApi {
  completeGoogleAuthCallback(
    input: GoogleAuthCallbackInput,
  ): Promise<LinkedGoogleConnection | unknown>;
}

export async function resolveAuthCallbackNavigation(input: {
  callbackUrl: string;
  origin: string;
  storage: Storage;
  session: CallbackSessionApi;
  providerAuthApi: CallbackProviderApi;
}): Promise<string> {
  const parsed = parseAuthCallback(input.callbackUrl);

  if (parsed.kind === 'session-token') {
    input.session.handleAuthCallback(input.callbackUrl);
    return '/dashboard';
  }

  if (parsed.kind === 'provider-error') {
    return buildProviderCallbackUrl('error', parsed.error);
  }

  if (parsed.kind === 'provider-callback') {
    const pending = consumePendingGoogleOAuth(input.storage, {
      expectedState: parsed.state,
    });

    if (!pending) {
      return buildProviderCallbackUrl('error', 'state_mismatch');
    }

    try {
      await input.providerAuthApi.completeGoogleAuthCallback({
        code: parsed.code,
        state: parsed.state,
        codeVerifier: pending.codeVerifier,
        redirectUri: pending.redirectUri || buildGoogleCallbackRedirectUri(input.origin),
      });

      return buildProviderCallbackUrl('linked');
    } catch {
      return buildProviderCallbackUrl('error', 'exchange_failed');
    }
  }

  return buildProviderCallbackUrl('error', 'invalid_callback');
}
