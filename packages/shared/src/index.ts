/**
 * Shared utility functions and constants.
 * No database or network I/O here — purely synchronous helpers.
 */
import { randomUUID } from 'node:crypto'

/**
 * Generate a UUID.
 */
export function generateId(): string {
  return randomUUID()
}

/**
 * Result type for Railway-Oriented Programming pattern (success | error).
 */
export type Result<T, E = Error> = { ok: true; value: T } | { ok: false; error: E }

/**
 * Create a success result.
 */
export function ok<T>(value: T): Result<T> {
  return { ok: true, value }
}

/**
 * Create an error result.
 */
export function err<E>(error: E): Result<never, E> {
  return { ok: false, error }
}

/**
 * Map a result and handle success/error branches.
 */
export function mapResult<T, E, U>(
  result: Result<T, E>,
  onOk: (value: T) => U,
  onErr?: (error: E) => U
): U {
  if (result.ok) {
    return onOk(result.value)
  }
  if (onErr) {
    return onErr(result.error)
  }
  throw result.error
}

/**
 * Resolve a list of results; fail if any error.
 */
export function allResults<T, E>(results: Result<T, E>[]): Result<T[], E> {
  const values: T[] = []
  for (const result of results) {
    if (!result.ok) {
      return { ok: false, error: result.error }
    }
    values.push(result.value)
  }
  return { ok: true, value: values }
}

/**
 * Query parameter builder for pagination.
 */
export function buildPaginationQuery(
  page: number = 1,
  perPage: number = 20
): { offset: number; limit: number } {
  const offset = (page - 1) * perPage
  return {
    offset: Math.max(0, offset),
    limit: Math.max(1, Math.min(perPage, 100)),
  }
}

/**
 * Pagination metadata calculator.
 */
export function calculatePaginationMeta(
  total: number,
  page: number,
  perPage: number
): {
  total: number
  page: number
  perPage: number
  totalPages: number
} {
  const totalPages = Math.ceil(total / perPage)
  return {
    total,
    page: Math.max(1, page),
    perPage: Math.max(1, perPage),
    totalPages: Math.max(1, totalPages),
  }
}

/**
 * Retry with exponential backoff (for async operations).
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  initialDelayMs: number = 100
): Promise<T> {
  let lastError: unknown
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error
      if (attempt < maxRetries - 1) {
        const delay = initialDelayMs * Math.pow(2, attempt)
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }
  }
  throw lastError
}

/**
 * Safe JSON parsing.
 */
export function parseJSON<T>(json: string, defaultValue: T): T {
  try {
    return JSON.parse(json) as T
  } catch {
    return defaultValue
  }
}

/**
 * ISO string to Date, safe.
 */
export function parseISO(date: string | undefined): Date | null {
  if (!date) return null
  const parsed = new Date(date)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed
}
