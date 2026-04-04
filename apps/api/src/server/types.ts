/**
 * Shared types for API server and request handling.
 */

/**
 * Application user principal, extracted from JWT claims.
 */
export interface Principal {
  /** User ID from identity provider */
  userId: string
  /** Organization/tenant identifier */
  orgId: string
  /** JWT token for downstream service calls (optional) */
  token?: string
}

/**
 * Standard API success response envelope.
 */
export interface ApiSuccessResponse<T> {
  success: true
  data: T
  meta?: {
    requestId: string
    pagination?: {
      page: number
      perPage: number
      total: number
      totalPages: number
    }
  }
}

/**
 * Standard API error response envelope.
 */
export interface ApiErrorResponse {
  success: false
  error: {
    code: string
    message: string
    details?: Record<string, unknown>
  }
  meta?: {
    requestId: string
  }
}

/**
 * API response type (success or error).
 */
export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse

/**
 * Authorization result for resource access checks.
 */
export interface AuthorizationResult {
  allowed: boolean
  reason?: string
}

/**
 * Resource ownership and share metadata.
 */
export interface Owned {
  ownerId: string
  createdAt: Date
  updatedAt: Date
}
