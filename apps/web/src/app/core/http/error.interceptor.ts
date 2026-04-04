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

  const apiMessage =
    typeof error.error === 'object' && error.error !== null && 'message' in error.error
      ? String(error.error.message)
      : undefined;

  return new Error(apiMessage ?? `Request failed with status ${error.status}`);
}
