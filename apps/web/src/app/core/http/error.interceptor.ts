import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, from, switchMap, throwError } from 'rxjs';

import { AuthApiService } from '../auth/auth-api.service';
import type { AuthSessionPayload } from '../auth/session.service';
import { SessionService } from '../auth/session.service';

let refreshInFlight: Promise<AuthSessionPayload> | null = null;

function refreshSession(authApi: AuthApiService, token: string) {
  if (!refreshInFlight) {
    refreshInFlight = authApi.refresh(token).finally(() => {
      refreshInFlight = null;
    });
  }

  return refreshInFlight;
}

export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const session = inject(SessionService);
  const authApi = inject(AuthApiService);

  return next(req).pipe(
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse && error.status === 401) {
        const refreshToken = session.refreshToken();
        if (refreshToken && !req.url.endsWith('/auth/refresh')) {
          return from(refreshSession(authApi, refreshToken)).pipe(
            switchMap((payload) => {
              session.updateTokens(payload);
              const retryRequest = req.clone({
                setHeaders: {
                  Authorization: `${payload.tokenType} ${payload.accessToken}`,
                },
              });
              return next(retryRequest);
            }),
            catchError((refreshError: unknown) => {
              session.logout();
              return throwError(() => mapApiError(refreshError));
            }),
          );
        }

        session.logout();
      }

      return throwError(() => mapApiError(error));
    }),
  );
};

function mapApiError(error: unknown): Error {
  if (!(error instanceof HttpErrorResponse)) {
    return new Error('Unexpected request failure');
  }

  let apiMessage: string | undefined;

  if (typeof error.error === 'object' && error.error !== null) {
    if ('message' in error.error) {
      apiMessage = String(error.error.message);
    }

    if (!apiMessage && 'error' in error.error) {
      const nestedError = (error.error as { error?: { message?: unknown } }).error;
      if (nestedError && typeof nestedError.message === 'string') {
        apiMessage = nestedError.message;
      }
    }
  }

  return new Error(apiMessage ?? `Request failed with status ${error.status}`);
}
