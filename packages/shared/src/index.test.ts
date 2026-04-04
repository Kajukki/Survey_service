/**
 * Tests for shared utilities.
 */
import { describe, it, expect } from 'vitest'
import {
  ok,
  err,
  mapResult,
  allResults,
  buildPaginationQuery,
  calculatePaginationMeta,
  parseJSON,
  parseISO,
} from './index'

describe('Result Type', () => {
  describe('ok and err', () => {
    it('should create success result', () => {
      const result = ok(42)

      expect(result.ok).toBe(true)
      expect(result.value).toBe(42)
    })

    it('should create error result', () => {
      const error = new Error('Something failed')
      const result = err(error)

      expect(result.ok).toBe(false)
      expect(result.error).toBe(error)
    })
  })

  describe('mapResult', () => {
    it('should map success result', () => {
      const result = ok(10)
      const mapped = mapResult(
        result,
        value => value * 2,
        () => 0
      )

      expect(mapped).toBe(20)
    })

    it('should map error result', () => {
      const result = err('Error message')
      const mapped = mapResult(
        result,
        () => 0,
        error => error.length
      )

      expect(mapped).toBe(13)
    })

    it('should throw if no error handler', () => {
      const result = err('Error')

      expect(() => {
        mapResult(result, () => 0)
      }).toThrow()
    })
  })

  describe('allResults', () => {
    it('should return all values when all ok', () => {
      const results = [ok(1), ok(2), ok(3)]
      const result = allResults(results)

      expect(result.ok).toBe(true)
      expect((result as any).value).toEqual([1, 2, 3])
    })

    it('should return first error', () => {
      const results = [ok(1), err('Error 1'), ok(3), err('Error 2')]
      const result = allResults(results)

      expect(result.ok).toBe(false)
      expect((result as any).error).toBe('Error 1')
    })

    it('should handle empty array', () => {
      const result = allResults([])

      expect(result.ok).toBe(true)
      expect((result as any).value).toEqual([])
    })
  })
})

describe('Pagination Helpers', () => {
  describe('buildPaginationQuery', () => {
    it('should build query for page 1', () => {
      const query = buildPaginationQuery(1, 20)

      expect(query.offset).toBe(0)
      expect(query.limit).toBe(20)
    })

    it('should build query for page 2', () => {
      const query = buildPaginationQuery(2, 20)

      expect(query.offset).toBe(20)
      expect(query.limit).toBe(20)
    })

    it('should cap limit at 100', () => {
      const query = buildPaginationQuery(1, 500)

      expect(query.limit).toBe(100)
    })

    it('should ensure offset is non-negative', () => {
      const query = buildPaginationQuery(0, 20)

      expect(query.offset).toBe(0)
    })

    it('should use defaults', () => {
      const query = buildPaginationQuery()

      expect(query.offset).toBe(0)
      expect(query.limit).toBe(20)
    })
  })

  describe('calculatePaginationMeta', () => {
    it('should calculate metadata for first page', () => {
      const meta = calculatePaginationMeta(100, 1, 20)

      expect(meta.total).toBe(100)
      expect(meta.page).toBe(1)
      expect(meta.perPage).toBe(20)
      expect(meta.totalPages).toBe(5)
    })

    it('should calculate metadata for middle page', () => {
      const meta = calculatePaginationMeta(100, 3, 20)

      expect(meta.totalPages).toBe(5)
      expect(meta.page).toBe(3)
    })

    it('should handle partial last page', () => {
      const meta = calculatePaginationMeta(101, 6, 20)

      expect(meta.totalPages).toBe(6)
    })

    it('should handle empty results', () => {
      const meta = calculatePaginationMeta(0, 1, 20)

      expect(meta.total).toBe(0)
      expect(meta.totalPages).toBe(1)
    })
  })
})

describe('JSON Parsing', () => {
  describe('parseJSON', () => {
    it('should parse valid JSON', () => {
      const result = parseJSON('{"key":"value"}', {})

      expect(result).toEqual({ key: 'value' })
    })

    it('should return default on invalid JSON', () => {
      const defaultValue = { fallback: true }
      const result = parseJSON('not json', defaultValue)

      expect(result).toBe(defaultValue)
    })

    it('should parse arrays', () => {
      const result = parseJSON('[1,2,3]', [])

      expect(result).toEqual([1, 2, 3])
    })

    it('should parse primitives', () => {
      expect(parseJSON('42', 0)).toBe(42)
      expect(parseJSON('"string"', '')).toBe('string')
      expect(parseJSON('true', false)).toBe(true)
    })
  })

  describe('parseISO', () => {
    it('should parse ISO date string', () => {
      const date = parseISO('2024-01-15T10:30:00Z')

      expect(date).toBeInstanceOf(Date)
      expect(date?.getFullYear()).toBe(2024)
    })

    it('should return null for invalid date', () => {
      const date = parseISO('not-a-date')

      expect(date).toBeNull()
    })

    it('should return null for undefined', () => {
      const date = parseISO(undefined)

      expect(date).toBeNull()
    })

    it('should return null for empty string', () => {
      const date = parseISO('')

      expect(date).toBeNull()
    })
  })
})
