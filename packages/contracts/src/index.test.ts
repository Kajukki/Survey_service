/**
 * Tests for contract schemas.
 */
import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import {
  ConnectionSchema,
  CreateConnectionSchema,
  FormSchema,
  SyncJobSchema,
  CreateSyncJobSchema,
  ShareSchema,
  CreateShareSchema,
  ExportJobSchema,
  PaginationQuerySchema,
  DateRangeSchema,
} from './index'

describe('Connection Schemas', () => {
  describe('CreateConnectionSchema', () => {
    it('should validate valid connection input', () => {
      const input = {
        type: 'google',
        name: 'My Google Forms',
        externalId: 'form-123',
        credentialToken: 'token-abc',
      }

      const result = CreateConnectionSchema.safeParse(input)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.type).toBe('google')
      }
    })

    it('should reject invalid type', () => {
      const input = {
        type: 'invalid',
        name: 'My Forms',
        externalId: 'form-123',
        credentialToken: 'token-abc',
      }

      const result = CreateConnectionSchema.safeParse(input)

      expect(result.success).toBe(false)
    })

    it('should reject missing required fields', () => {
      const input = {
        type: 'google',
        name: 'My Forms',
      }

      const result = CreateConnectionSchema.safeParse(input)

      expect(result.success).toBe(false)
    })

    it('should validate microsoft type', () => {
      const input = {
        type: 'microsoft',
        name: 'My Microsoft Forms',
        externalId: 'form-456',
        credentialToken: 'token-xyz',
      }

      const result = CreateConnectionSchema.safeParse(input)

      expect(result.success).toBe(true)
    })
  })

  describe('ConnectionSchema', () => {
    it('should validate full connection object', () => {
      const connection = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        ownerId: 'user-123',
        type: 'google',
        name: 'My Forms',
        externalId: 'form-123',
        credentialToken: 'token-abc',
        createdAt: new Date(),
        updatedAt: new Date(),
        syncStatus: 'idle',
      }

      const result = ConnectionSchema.safeParse(connection)

      expect(result.success).toBe(true)
    })
  })
})

describe('Job Schemas', () => {
  describe('CreateSyncJobSchema', () => {
    it('should validate minimal sync job', () => {
      const input = {
        connectionId: '550e8400-e29b-41d4-a716-446655440000',
      }

      const result = CreateSyncJobSchema.safeParse(input)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.forceFullSync).toBe(false)
      }
    })

    it('should validate full sync job', () => {
      const input = {
        connectionId: '550e8400-e29b-41d4-a716-446655440000',
        formId: '550e8400-e29b-41d4-a716-446655440001',
        forceFullSync: true,
      }

      const result = CreateSyncJobSchema.safeParse(input)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.formId).toBe(input.formId)
        expect(result.data.forceFullSync).toBe(true)
      }
    })

    it('should reject invalid UUID', () => {
      const input = {
        connectionId: 'not-a-uuid',
      }

      const result = CreateSyncJobSchema.safeParse(input)

      expect(result.success).toBe(false)
    })
  })

  describe('SyncJobSchema', () => {
    it('should validate completed job', () => {
      const job = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        type: 'sync',
        status: 'succeeded',
        requestedBy: 'user-123',
        connectionId: '550e8400-e29b-41d4-a716-446655440001',
        trigger: 'manual',
        createdAt: new Date(),
        completedAt: new Date(),
      }

      const result = SyncJobSchema.safeParse(job)

      expect(result.success).toBe(true)
    })

    it('should validate failed job with error', () => {
      const job = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        type: 'sync',
        status: 'failed',
        requestedBy: 'user-123',
        connectionId: '550e8400-e29b-41d4-a716-446655440001',
        trigger: 'scheduled',
        error: 'Connection timeout',
        createdAt: new Date(),
      }

      const result = SyncJobSchema.safeParse(job)

      expect(result.success).toBe(true)
    })
  })
})

describe('Share Schemas', () => {
  describe('CreateShareSchema', () => {
    it('should validate share creation', () => {
      const input = {
        granteeId: 'user-456',
        permission: 'read',
      }

      const result = CreateShareSchema.safeParse(input)

      expect(result.success).toBe(true)
    })

    it('should accept admin permission', () => {
      const input = {
        granteeId: 'user-456',
        permission: 'admin',
      }

      const result = CreateShareSchema.safeParse(input)

      expect(result.success).toBe(true)
    })

    it('should reject invalid permission', () => {
      const input = {
        granteeId: 'user-456',
        permission: 'superadmin',
      }

      const result = CreateShareSchema.safeParse(input)

      expect(result.success).toBe(false)
    })
  })
})

describe('Pagination Schemas', () => {
  describe('PaginationQuerySchema', () => {
    it('should parse valid pagination', () => {
      const input = { page: 2, perPage: 50 }

      const result = PaginationQuerySchema.safeParse(input)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.page).toBe(2)
        expect(result.data.perPage).toBe(50)
      }
    })

    it('should use defaults', () => {
      const input = {}

      const result = PaginationQuerySchema.safeParse(input)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.page).toBe(1)
        expect(result.data.perPage).toBe(20)
      }
    })

    it('should reject invalid page', () => {
      const input = { page: 0 }

      const result = PaginationQuerySchema.safeParse(input)

      expect(result.success).toBe(false)
    })

    it('should cap perPage at 100', () => {
      const input = { perPage: 500 }

      const result = PaginationQuerySchema.safeParse(input)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.perPage).toBe(100)
      }
    })
  })
})
