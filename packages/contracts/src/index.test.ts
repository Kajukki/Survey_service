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
  AuthLoginSchema,
  AuthRegisterSchema,
  AuthTokenRefreshSchema,
  AuthSessionSchema,
  ConnectorProviderSchema,
  ProviderAuthStartInputSchema,
  ProviderAuthStartResultSchema,
  ProviderTokenSetSchema,
  ProviderFormSummarySchema,
  ProviderFormResponsePageSchema,
  ProviderErrorSchema,
  FormStructureSchema,
  FormQuestionSchema,
  FormResponsesListQuerySchema,
  FormResponseDetailSchema,
  FormAnalyticsOverviewSchema,
  FormAnalyticsSegmentsQuerySchema,
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

describe('Authentication Schemas', () => {
  it('validates login payload', () => {
    const result = AuthLoginSchema.safeParse({
      username: 'userOne',
      password: 'passwordOne',
    })

    expect(result.success).toBe(true)
  })

  it('rejects weak registration password', () => {
    const result = AuthRegisterSchema.safeParse({
      username: 'userOne',
      password: 'short',
    })

    expect(result.success).toBe(false)
  })

  it('validates token refresh payload', () => {
    const result = AuthTokenRefreshSchema.safeParse({
      refreshToken: 'refresh-token-value',
    })

    expect(result.success).toBe(true)
  })

  it('validates auth session payload', () => {
    const result = AuthSessionSchema.safeParse({
      accessToken: 'access-token-value',
      refreshToken: 'refresh-token-value',
      tokenType: 'Bearer',
      expiresIn: 900,
      user: {
        id: '550e8400-e29b-41d4-a716-446655440000',
        username: 'userOne',
        orgId: 'default-org',
      },
    })

    expect(result.success).toBe(true)
  })
})

describe('Provider Connector Schemas', () => {
  it('validates provider auth start input', () => {
    const result = ProviderAuthStartInputSchema.safeParse({
      provider: 'google',
      redirectUri: 'https://app.example.com/api/v1/providers/google/callback',
      state: 'opaque-state',
      codeChallenge: 'pkce-challenge',
      codeChallengeMethod: 'S256',
      scopes: ['forms.body.readonly', 'forms.responses.readonly'],
    })

    expect(result.success).toBe(true)
  })

  it('validates provider auth start result', () => {
    const result = ProviderAuthStartResultSchema.safeParse({
      provider: 'google',
      authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth?client_id=abc',
      state: 'opaque-state',
      codeChallengeMethod: 'S256',
    })

    expect(result.success).toBe(true)
  })

  it('validates provider token set with expiry', () => {
    const result = ProviderTokenSetSchema.safeParse({
      provider: 'google',
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      expiresAt: new Date().toISOString(),
      scope: 'forms.body.readonly forms.responses.readonly',
      tokenType: 'Bearer',
    })

    expect(result.success).toBe(true)
  })

  it('validates provider form summary payload', () => {
    const result = ProviderFormSummarySchema.safeParse({
      provider: 'google',
      externalFormId: 'form-ext-123',
      title: 'Customer Survey',
      description: 'Quarterly survey',
      lastModifiedAt: new Date().toISOString(),
      responseCount: 42,
    })

    expect(result.success).toBe(true)
  })

  it('validates provider form response page payload', () => {
    const result = ProviderFormResponsePageSchema.safeParse({
      provider: 'google',
      externalFormId: 'form-ext-123',
      nextPageToken: 'page-2',
      responses: [
        {
          externalResponseId: 'resp-1',
          submittedAt: new Date().toISOString(),
          answers: {
            q1: 'yes',
          },
        },
      ],
    })

    expect(result.success).toBe(true)
  })

  it('validates provider error payload', () => {
    const result = ProviderErrorSchema.safeParse({
      provider: 'google',
      code: 'rate_limited',
      message: 'Too many requests',
      retryable: true,
      status: 429,
    })

    expect(result.success).toBe(true)
  })

  it('rejects unsupported connector provider', () => {
    const result = ConnectorProviderSchema.safeParse('typeform')

    expect(result.success).toBe(false)
  })
})

describe('Form Structure Schemas', () => {
  it('validates form structure with sectioned questions', () => {
    const result = FormStructureSchema.safeParse({
      form: {
        id: '550e8400-e29b-41d4-a716-446655440000',
        ownerId: 'user-123',
        title: 'Customer Satisfaction Survey',
        description: 'Q2 CSAT collection',
        responseCount: 128,
        updatedAt: new Date().toISOString(),
      },
      sections: [
        {
          id: 'section-1',
          title: 'General',
          order: 0,
          questions: [
            {
              id: 'question-1',
              sectionId: 'section-1',
              type: 'single_choice',
              label: 'How satisfied are you?',
              order: 0,
              options: [
                { value: 'very_satisfied', label: 'Very satisfied' },
                { value: 'satisfied', label: 'Satisfied' },
              ],
            },
          ],
        },
      ],
      questionCount: 1,
    })

    expect(result.success).toBe(true)
  })

  it('rejects invalid question discriminators', () => {
    const result = FormQuestionSchema.safeParse({
      id: 'q-invalid',
      type: 'unsupported',
      label: 'Invalid question',
      order: 1,
    })

    expect(result.success).toBe(false)
  })
})

describe('Form Responses Schemas', () => {
  it('validates response list query filters', () => {
    const result = FormResponsesListQuerySchema.safeParse({
      page: 2,
      perPage: 25,
      from: '2026-01-01T00:00:00.000Z',
      to: '2026-01-31T23:59:59.999Z',
      questionId: 'question-1',
      completion: 'completed',
    })

    expect(result.success).toBe(true)
  })

  it('rejects inverted response date ranges', () => {
    const result = FormResponsesListQuerySchema.safeParse({
      from: '2026-02-01T00:00:00.000Z',
      to: '2026-01-01T00:00:00.000Z',
    })

    expect(result.success).toBe(false)
  })

  it('validates detailed response payloads', () => {
    const result = FormResponseDetailSchema.safeParse({
      id: 'response-1',
      submittedAt: new Date().toISOString(),
      completion: 'completed',
      answers: [
        {
          questionId: 'question-1',
          questionLabel: 'How satisfied are you?',
          questionType: 'single_choice',
          value: 'very_satisfied',
        },
        {
          questionId: 'question-2',
          questionLabel: 'Comment',
          questionType: 'text',
          value: 'Great experience overall',
        },
      ],
    })

    expect(result.success).toBe(true)
  })
})

describe('Form Analytics Schemas', () => {
  it('validates analytics overview payload with filter metadata', () => {
    const now = new Date().toISOString()
    const result = FormAnalyticsOverviewSchema.safeParse({
      kpis: [
        { label: 'Responses', value: '128', delta: '+8%' },
        { label: 'Completion rate', value: '0.92' },
      ],
      series: [
        { date: '2026-01-01', count: 10 },
        { date: '2026-01-02', count: 12 },
      ],
      appliedFilters: {
        from: now,
        to: now,
        granularity: 'day',
      },
      dataFreshness: {
        generatedAt: now,
        lastSuccessfulSyncAt: now,
      },
    })

    expect(result.success).toBe(true)
  })

  it('rejects invalid segment query date windows', () => {
    const result = FormAnalyticsSegmentsQuerySchema.safeParse({
      from: '2026-04-01T00:00:00.000Z',
      to: '2026-03-01T00:00:00.000Z',
      granularity: 'week',
      segmentBy: 'completion',
    })

    expect(result.success).toBe(false)
  })
})
