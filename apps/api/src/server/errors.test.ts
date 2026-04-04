/**
 * Tests for error handling and mapping.
 */
import { describe, it, expect } from 'vitest'
import {
  AppError,
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  ErrorCode,
  toAppError,
} from '../server/errors'

describe('AppError', () => {
  it('should create an app error with correct properties', () => {
    const error = new AppError(ErrorCode.INTERNAL_ERROR, 500, 'Something went wrong')

    expect(error.code).toBe(ErrorCode.INTERNAL_ERROR)
    expect(error.statusCode).toBe(500)
    expect(error.message).toBe('Something went wrong')
    expect(error.name).toBe('AppError')
  })

  it('should support optional details', () => {
    const details = { field: 'email', value: 'invalid' }
    const error = new AppError(ErrorCode.VALIDATION_ERROR, 400, 'Invalid', details)

    expect(error.details).toEqual(details)
  })
})

describe('ValidationError', () => {
  it('should create validation error with field errors', () => {
    const fieldErrors = [
      { field: 'email', message: 'Invalid email', code: 'invalid_format' },
      { field: 'age', message: 'Must be positive', code: 'out_of_range' },
    ]
    const error = new ValidationError('Validation failed', fieldErrors)

    expect(error.code).toBe(ErrorCode.VALIDATION_ERROR)
    expect(error.statusCode).toBe(400)
    expect(error.fieldErrors).toEqual(fieldErrors)
  })
})

describe('UnauthorizedError', () => {
  it('should have 401 status', () => {
    const error = new UnauthorizedError('Invalid token')

    expect(error.statusCode).toBe(401)
    expect(error.code).toBe(ErrorCode.UNAUTHORIZED)
    expect(error.message).toBe('Invalid token')
  })

  it('should have default message', () => {
    const error = new UnauthorizedError()

    expect(error.message).toBe('Unauthorized')
  })
})

describe('ForbiddenError', () => {
  it('should have 403 status', () => {
    const error = new ForbiddenError('Access denied')

    expect(error.statusCode).toBe(403)
    expect(error.code).toBe(ErrorCode.FORBIDDEN)
    expect(error.message).toBe('Access denied')
  })
})

describe('NotFoundError', () => {
  it('should have 404 status', () => {
    const error = new NotFoundError('User')

    expect(error.statusCode).toBe(404)
    expect(error.code).toBe(ErrorCode.NOT_FOUND)
    expect(error.message).toBe('User not found')
  })
})

describe('ConflictError', () => {
  it('should have 409 status', () => {
    const error = new ConflictError('Email already in use')

    expect(error.statusCode).toBe(409)
    expect(error.code).toBe(ErrorCode.CONFLICT)
    expect(error.message).toBe('Email already in use')
  })
})

describe('toAppError', () => {
  it('should return AppError as-is', () => {
    const original = new ForbiddenError('Access denied')
    const result = toAppError(original)

    expect(result).toBe(original)
  })

  it('should convert Error to AppError', () => {
    const original = new Error('Database error')
    const result = toAppError(original)

    expect(result).toBeInstanceOf(AppError)
    expect(result.statusCode).toBe(500)
    expect(result.message).toBe('Database error')
  })

  it('should use custom message if provided', () => {
    const result = toAppError(new Error('Original'), 'Custom message')

    expect(result.message).toBe('Custom message')
  })

  it('should handle non-Error objects', () => {
    const result = toAppError('Not an error')

    expect(result).toBeInstanceOf(AppError)
    expect(result.statusCode).toBe(500)
  })
})
