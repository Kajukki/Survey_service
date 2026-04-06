import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';

import { SessionService } from '../auth/session.service';

export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const session = inject(SessionService);

  return next(req).pipe(
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse && error.status === 401) {
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
