/**
 * Structured error types and mapping for consistent API error responses.
 */

/**
 * Error codes used in API responses.
 */
export enum ErrorCode {
  VALIDATION_ERROR = 'validation_error',
  UNAUTHORIZED = 'unauthorized',
  FORBIDDEN = 'forbidden',
  NOT_FOUND = 'not_found',
  CONFLICT = 'conflict',
  INTERNAL_ERROR = 'internal_error',
  SERVICE_UNAVAILABLE = 'service_unavailable',
  BAD_REQUEST = 'bad_request',
}

/**
 * Application error with code and optional details.
 */
export class AppError extends Error {
  constructor(
    public code: ErrorCode,
    public statusCode: number,
    message: string,
    public details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

/**
 * Validation error with field-level details.
 */
export class ValidationError extends AppError {
  constructor(
    message: string,
    public fieldErrors: Array<{
      field: string;
      message: string;
      code?: string;
    }>,
  ) {
    super(ErrorCode.VALIDATION_ERROR, 400, message);
    this.name = 'ValidationError';
  }
}

/**
 * Unauthorized access (missing or invalid credentials).
 */
export class UnauthorizedError extends AppError {
  constructor(message: string = 'Unauthorized') {
    super(ErrorCode.UNAUTHORIZED, 401, message);
    this.name = 'UnauthorizedError';
  }
}

/**
 * Forbidden access (authenticated but not authorized).
 */
export class ForbiddenError extends AppError {
  constructor(message: string = 'Forbidden') {
    super(ErrorCode.FORBIDDEN, 403, message);
    this.name = 'ForbiddenError';
  }
}

/**
 * Resource not found.
 */
export class NotFoundError extends AppError {
  constructor(resourceType: string = 'Resource') {
    super(ErrorCode.NOT_FOUND, 404, `${resourceType} not found`);
    this.name = 'NotFoundError';
  }
}

/**
 * Conflict (e.g., duplicate entry, state conflict).
 */
export class ConflictError extends AppError {
  constructor(message: string = 'Conflict') {
    super(ErrorCode.CONFLICT, 409, message);
    this.name = 'ConflictError';
  }
}

/**
 * Map a thrown error to an AppError or return as-is if already AppError.
 */
export function toAppError(error: unknown, message?: string): AppError {
  if (error instanceof AppError) {
    return error;
  }

  if (error instanceof Error) {
    return new AppError(ErrorCode.INTERNAL_ERROR, 500, message || error.message);
  }

  return new AppError(ErrorCode.INTERNAL_ERROR, 500, message || 'An unexpected error occurred');
}
