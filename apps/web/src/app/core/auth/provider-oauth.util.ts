const PENDING_GOOGLE_OAUTH_STORAGE_KEY = 'survey-service.google-oauth.pending';

interface PendingGoogleOAuthStored {
  state: string;
  codeVerifier: string;
  redirectUri: string;
  expiresAt: number;
}

export interface PendingGoogleOAuthInput {
  state: string;
  codeVerifier: string;
  redirectUri: string;
}

interface SavePendingGoogleOAuthOptions {
  now?: number;
  ttlMs?: number;
}

interface ConsumePendingGoogleOAuthOptions {
  expectedState: string;
  now?: number;
}

export type AuthCallbackParseResult =
  | {
      kind: 'session-token';
      token: string;
    }
  | {
      kind: 'provider-callback';
      code: string;
      state: string;
    }
  | {
      kind: 'provider-error';
      error: string;
      state?: string;
      errorDescription?: string;
    }
  | {
      kind: 'unknown';
    };

function base64UrlEncode(bytes: Uint8Array): string {
  const binary = Array.from(bytes)
    .map((byte) => String.fromCharCode(byte))
    .join('');

  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function createCodeVerifier(byteLength: number = 32): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);

  return base64UrlEncode(bytes);
}

export function createOAuthState(byteLength: number = 16): string {
  return createCodeVerifier(byteLength);
}

export async function deriveS256CodeChallenge(codeVerifier: string): Promise<string> {
  const verifierBytes = new TextEncoder().encode(codeVerifier);
  const digest = await crypto.subtle.digest('SHA-256', verifierBytes);
  return base64UrlEncode(new Uint8Array(digest));
}

export function buildGoogleCallbackRedirectUri(origin: string): string {
  const sanitizedOrigin = origin.endsWith('/') ? origin.slice(0, -1) : origin;
  return `${sanitizedOrigin}/auth/callback`;
}

export function savePendingGoogleOAuth(
  storage: Storage,
  input: PendingGoogleOAuthInput,
  options?: SavePendingGoogleOAuthOptions,
): void {
  const now = options?.now ?? Date.now();
  const ttlMs = options?.ttlMs ?? 10 * 60 * 1000;

  const payload: PendingGoogleOAuthStored = {
    ...input,
    expiresAt: now + ttlMs,
  };

  storage.setItem(PENDING_GOOGLE_OAUTH_STORAGE_KEY, JSON.stringify(payload));
}

export function consumePendingGoogleOAuth(
  storage: Storage,
  options: ConsumePendingGoogleOAuthOptions,
): PendingGoogleOAuthInput | null {
  const raw = storage.getItem(PENDING_GOOGLE_OAUTH_STORAGE_KEY);
  storage.removeItem(PENDING_GOOGLE_OAUTH_STORAGE_KEY);

  if (!raw) {
    return null;
  }

  let parsed: PendingGoogleOAuthStored;
  try {
    parsed = JSON.parse(raw) as PendingGoogleOAuthStored;
  } catch {
    return null;
  }

  if (
    !parsed.state ||
    !parsed.codeVerifier ||
    !parsed.redirectUri ||
    typeof parsed.expiresAt !== 'number'
  ) {
    return null;
  }

  const now = options.now ?? Date.now();
  if (parsed.expiresAt <= now) {
    return null;
  }

  if (parsed.state !== options.expectedState) {
    return null;
  }

  return {
    state: parsed.state,
    codeVerifier: parsed.codeVerifier,
    redirectUri: parsed.redirectUri,
  };
}

export function parseAuthCallback(url: string): AuthCallbackParseResult {
  const callbackUrl = new URL(url);

  const token = callbackUrl.searchParams.get('token') ?? callbackUrl.hash.replace('#token=', '');
  if (token) {
    return {
      kind: 'session-token',
      token,
    };
  }

  const providerError = callbackUrl.searchParams.get('error');
  if (providerError) {
    return {
      kind: 'provider-error',
      error: providerError,
      state: callbackUrl.searchParams.get('state') ?? undefined,
      errorDescription: callbackUrl.searchParams.get('error_description') ?? undefined,
    };
  }

  const code = callbackUrl.searchParams.get('code');
  const state = callbackUrl.searchParams.get('state');
  if (code && state) {
    return {
      kind: 'provider-callback',
      code,
      state,
    };
  }

  return {
    kind: 'unknown',
  };
}

export function buildProviderCallbackUrl(status: 'linked' | 'error', reason?: string): string {
  const query = new URLSearchParams({ oauth: status });
  if (reason) {
    query.set('reason', reason);
  }

  return `/connections?${query.toString()}`;
}
