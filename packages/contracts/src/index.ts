/**
 * Shared API and Message Schemas using Zod.
 * Single source of truth for API requests, responses, and RabbitMQ payloads.
 */
import { z } from 'zod'

/**
 * API Response envelope schemas.
 */
export const ApiResponseSchema = z.object({
  success: z.literal(true),
  data: z.unknown(),
  meta: z
    .object({
      requestId: z.string(),
      pagination: z
        .object({
          page: z.number().int().positive(),
          perPage: z.number().int().positive(),
          total: z.number().int().nonnegative(),
          totalPages: z.number().int().nonnegative(),
        })
        .optional(),
    })
    .optional(),
})

export const ApiErrorResponseSchema = z.object({
  success: z.literal(false),
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.record(z.string(), z.unknown()).optional(),
  }),
  meta: z
    .object({
      requestId: z.string().optional(),
    })
    .optional(),
})

/**
 * Inferred TypeScript types.
 */
export type ApiResponse<T> = z.infer<typeof ApiResponseSchema> & { data: T }
export type ApiErrorResponse = z.infer<typeof ApiErrorResponseSchema>

/**
 * Common input validation schemas.
 */
export const PaginationQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  perPage: z.coerce.number().int().positive().transform(v => Math.min(v, 100)).default(20),
})

export const DateRangeSchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
})

export const IdSchema = z.string().uuid()
export const UserIdSchema = z.string().min(1)
export const OrgIdSchema = z.string().min(1)

/**
 * Connection schemas (Google/Microsoft form connectors).
 */
export const ConnectionTypeSchema = z.enum(['google', 'microsoft'])

export const CreateConnectionSchema = z.object({
  type: ConnectionTypeSchema,
  name: z.string().min(1).max(255),
  externalId: z.string().min(1),
  credentialToken: z.string().min(1),
})

export const ConnectionSchema = CreateConnectionSchema.extend({
  id: IdSchema,
  ownerId: UserIdSchema,
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  lastSyncAt: z.coerce.date().optional(),
  syncStatus: z.enum(['idle', 'syncing', 'error']).default('idle'),
})

export type Connection = z.infer<typeof ConnectionSchema>
export type CreateConnectionInput = z.infer<typeof CreateConnectionSchema>

/**
 * Form schemas (surveys/forms from providers).
 */
export const FormSchema = z.object({
  id: IdSchema,
  ownerId: UserIdSchema,
  connectionId: IdSchema,
  externalFormId: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  responseCount: z.number().int().nonnegative().default(0),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
})

export type Form = z.infer<typeof FormSchema>

export const FormQuestionTypeSchema = z.enum([
  'single_choice',
  'multi_choice',
  'text',
  'rating',
  'date',
  'number',
])

export const FormQuestionOptionSchema = z.object({
  value: z.string().min(1),
  label: z.string().min(1),
})

const BaseFormQuestionSchema = z.object({
  id: z.string().min(1),
  externalQuestionId: z.string().min(1).optional(),
  sectionId: z.string().min(1).optional(),
  label: z.string().min(1),
  description: z.string().optional(),
  required: z.boolean().default(false),
  order: z.number().int().nonnegative(),
})

export const ChoiceFormQuestionSchema = BaseFormQuestionSchema.extend({
  type: z.enum(['single_choice', 'multi_choice']),
  options: z.array(FormQuestionOptionSchema).min(1),
})

export const TextFormQuestionSchema = BaseFormQuestionSchema.extend({
  type: z.literal('text'),
  multiline: z.boolean().default(true),
})

export const RatingFormQuestionSchema = BaseFormQuestionSchema.extend({
  type: z.literal('rating'),
  minScale: z.number().int().default(1),
  maxScale: z.number().int().default(5),
  step: z.number().int().positive().default(1),
})

export const DateFormQuestionSchema = BaseFormQuestionSchema.extend({
  type: z.literal('date'),
  includeTime: z.boolean().default(false),
})

export const NumberFormQuestionSchema = BaseFormQuestionSchema.extend({
  type: z.literal('number'),
  minValue: z.number().optional(),
  maxValue: z.number().optional(),
})

export const FormQuestionSchema = z.discriminatedUnion('type', [
  ChoiceFormQuestionSchema,
  TextFormQuestionSchema,
  RatingFormQuestionSchema,
  DateFormQuestionSchema,
  NumberFormQuestionSchema,
])

export const FormSectionSchema = z.object({
  id: z.string().min(1),
  externalSectionId: z.string().min(1).optional(),
  title: z.string().min(1),
  description: z.string().optional(),
  order: z.number().int().nonnegative(),
  questions: z.array(FormQuestionSchema).default([]),
})

export const FormStructureSchema = z.object({
  form: z.object({
    id: IdSchema,
    ownerId: UserIdSchema,
    title: z.string().min(1),
    description: z.string().optional(),
    responseCount: z.number().int().nonnegative().default(0),
    updatedAt: z.string().datetime(),
    lastSyncedAt: z.string().datetime().optional(),
  }),
  sections: z.array(FormSectionSchema),
  questionCount: z.number().int().nonnegative().default(0),
})

export type FormQuestionType = z.infer<typeof FormQuestionTypeSchema>
export type FormQuestionOption = z.infer<typeof FormQuestionOptionSchema>
export type FormQuestion = z.infer<typeof FormQuestionSchema>
export type FormSection = z.infer<typeof FormSectionSchema>
export type FormStructure = z.infer<typeof FormStructureSchema>

/**
 * Provider connector schemas (Google/Microsoft boundary contracts).
 */
export const ConnectorProviderSchema = z.enum(['google', 'microsoft'])

export const ProviderAuthStartInputSchema = z.object({
  provider: ConnectorProviderSchema,
  redirectUri: z.string().url(),
  state: z.string().min(1),
  codeChallenge: z.string().min(1),
  codeChallengeMethod: z.literal('S256'),
  scopes: z.array(z.string().min(1)).min(1),
})

export const ProviderAuthStartResultSchema = z.object({
  provider: ConnectorProviderSchema,
  authorizationUrl: z.string().url(),
  state: z.string().min(1),
  codeChallengeMethod: z.literal('S256'),
})

export const ProviderTokenSetSchema = z.object({
  provider: ConnectorProviderSchema,
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1).optional(),
  expiresAt: z.string().datetime(),
  scope: z.string().min(1).optional(),
  tokenType: z.string().min(1).default('Bearer'),
})

export const ProviderFormSummarySchema = z.object({
  provider: ConnectorProviderSchema,
  externalFormId: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  lastModifiedAt: z.string().datetime().optional(),
  responseCount: z.number().int().nonnegative().default(0),
})

export const ProviderFormResponseItemSchema = z.object({
  externalResponseId: z.string().min(1),
  submittedAt: z.string().datetime().optional(),
  answers: z.record(z.string(), z.unknown()),
})

export const ProviderFormResponsePageSchema = z.object({
  provider: ConnectorProviderSchema,
  externalFormId: z.string().min(1),
  nextPageToken: z.string().min(1).optional(),
  responses: z.array(ProviderFormResponseItemSchema),
})

export const ProviderErrorSchema = z.object({
  provider: ConnectorProviderSchema,
  code: z.string().min(1),
  message: z.string().min(1),
  retryable: z.boolean().default(false),
  status: z.number().int().min(100).max(599).optional(),
})

export type ConnectorProvider = z.infer<typeof ConnectorProviderSchema>
export type ProviderAuthStartInput = z.infer<typeof ProviderAuthStartInputSchema>
export type ProviderAuthStartResult = z.infer<typeof ProviderAuthStartResultSchema>
export type ProviderTokenSet = z.infer<typeof ProviderTokenSetSchema>
export type ProviderFormSummary = z.infer<typeof ProviderFormSummarySchema>
export type ProviderFormResponseItem = z.infer<typeof ProviderFormResponseItemSchema>
export type ProviderFormResponsePage = z.infer<typeof ProviderFormResponsePageSchema>
export type ProviderError = z.infer<typeof ProviderErrorSchema>

/**
 * Form response browser schemas.
 */
export const FormResponseCompletionSchema = z.enum(['completed', 'partial'])

export const FormResponseAnswerValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.string()),
  z.array(z.number()),
  z.null(),
  z.record(z.string(), z.unknown()),
])

export const FormResponseAnswerSchema = z.object({
  questionId: z.string().min(1),
  questionLabel: z.string().min(1),
  questionType: FormQuestionTypeSchema,
  value: FormResponseAnswerValueSchema,
})

export const FormResponseAnswerPreviewSchema = z.object({
  questionId: z.string().min(1),
  questionLabel: z.string().min(1),
  valuePreview: z.string().min(1),
})

export const FormResponseSummarySchema = z.object({
  id: z.string().min(1),
  submittedAt: z.string().datetime().optional(),
  completion: FormResponseCompletionSchema,
  answerPreview: z.array(FormResponseAnswerPreviewSchema).max(8).default([]),
})

export const FormResponseDetailSchema = z.object({
  id: z.string().min(1),
  submittedAt: z.string().datetime().optional(),
  completion: FormResponseCompletionSchema,
  answers: z.array(FormResponseAnswerSchema),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

export const FormResponsesFiltersSchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  questionId: z.string().min(1).optional(),
  answerContains: z.string().min(1).optional(),
  completion: FormResponseCompletionSchema.optional(),
})

export const FormResponsesListQuerySchema = PaginationQuerySchema.merge(
  z.object({
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    questionId: z.string().min(1).optional(),
    answerContains: z.string().min(1).optional(),
    completion: FormResponseCompletionSchema.optional(),
  }),
).superRefine((value, context) => {
  if (value.from && value.to && value.from > value.to) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['from'],
      message: 'from must be less than or equal to to',
    })
  }
})

export const FormResponsesListSchema = z.object({
  responses: z.array(FormResponseSummarySchema),
  appliedFilters: FormResponsesFiltersSchema.default({}),
})

export type FormResponseCompletion = z.infer<typeof FormResponseCompletionSchema>
export type FormResponseAnswerValue = z.infer<typeof FormResponseAnswerValueSchema>
export type FormResponseAnswer = z.infer<typeof FormResponseAnswerSchema>
export type FormResponseAnswerPreview = z.infer<typeof FormResponseAnswerPreviewSchema>
export type FormResponseSummary = z.infer<typeof FormResponseSummarySchema>
export type FormResponseDetail = z.infer<typeof FormResponseDetailSchema>
export type FormResponsesFilters = z.infer<typeof FormResponsesFiltersSchema>
export type FormResponsesListQuery = z.infer<typeof FormResponsesListQuerySchema>
export type FormResponsesList = z.infer<typeof FormResponsesListSchema>

/**
 * Form analytics schemas.
 */
export const FormAnalyticsGranularitySchema = z.enum(['day', 'week', 'month'])

export const FormAnalyticsAppliedFiltersSchema = z.object({
  from: z.string().datetime(),
  to: z.string().datetime(),
  granularity: FormAnalyticsGranularitySchema,
  questionId: z.string().min(1).optional(),
  segmentBy: z.string().min(1).optional(),
})

export const FormAnalyticsFreshnessSchema = z.object({
  generatedAt: z.string().datetime(),
  lastSuccessfulSyncAt: z.string().datetime().optional(),
  lastAttemptedSyncAt: z.string().datetime().optional(),
})

export const FormAnalyticsKpiSchema = z.object({
  label: z.string().min(1),
  value: z.string().min(1),
  delta: z.string().optional(),
})

export const FormAnalyticsSeriesPointSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  count: z.number().int().nonnegative(),
})

export const FormAnalyticsDistributionItemSchema = z.object({
  label: z.string().min(1),
  value: z.number().int().nonnegative(),
})

export const FormAnalyticsQuestionBreakdownSchema = z.object({
  questionId: z.string().min(1),
  questionLabel: z.string().min(1),
  questionType: FormQuestionTypeSchema,
  responses: z.number().int().nonnegative(),
  distribution: z.array(FormAnalyticsDistributionItemSchema).optional(),
  numericStats: z
    .object({
      min: z.number(),
      max: z.number(),
      avg: z.number(),
      median: z.number(),
    })
    .optional(),
  topTerms: z
    .array(
      z.object({
        term: z.string().min(1),
        count: z.number().int().nonnegative(),
      }),
    )
    .optional(),
})

export const FormAnalyticsOverviewSchema = z.object({
  kpis: z.array(FormAnalyticsKpiSchema),
  series: z.array(FormAnalyticsSeriesPointSchema),
  appliedFilters: FormAnalyticsAppliedFiltersSchema,
  dataFreshness: FormAnalyticsFreshnessSchema,
})

export const FormAnalyticsQuestionsSchema = z.object({
  questions: z.array(FormAnalyticsQuestionBreakdownSchema),
  appliedFilters: FormAnalyticsAppliedFiltersSchema,
  dataFreshness: FormAnalyticsFreshnessSchema,
})

export const FormAnalyticsSegmentMetricSchema = z.object({
  label: z.string().min(1),
  value: z.number(),
})

export const FormAnalyticsSegmentItemSchema = z.object({
  segmentKey: z.string().min(1),
  segmentLabel: z.string().min(1),
  responses: z.number().int().nonnegative(),
  completionRate: z.number().min(0).max(1).optional(),
  metrics: z.array(FormAnalyticsSegmentMetricSchema).default([]),
})

export const FormAnalyticsSegmentsSchema = z.object({
  segments: z.array(FormAnalyticsSegmentItemSchema),
  appliedFilters: FormAnalyticsAppliedFiltersSchema,
  dataFreshness: FormAnalyticsFreshnessSchema,
})

export const FormAnalyticsOverviewQuerySchema = z
  .object({
    from: z.coerce.date(),
    to: z.coerce.date(),
    granularity: FormAnalyticsGranularitySchema.default('day'),
    questionId: z.string().min(1).optional(),
  })
  .superRefine((value, context) => {
    if (value.from > value.to) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['from'],
        message: 'from must be less than or equal to to',
      })
    }
  })

export const FormAnalyticsQuestionsQuerySchema = FormAnalyticsOverviewQuerySchema

export const FormAnalyticsSegmentsQuerySchema = z
  .object({
    from: z.coerce.date(),
    to: z.coerce.date(),
    granularity: FormAnalyticsGranularitySchema.default('day'),
    segmentBy: z.string().min(1),
    questionId: z.string().min(1).optional(),
  })
  .superRefine((value, context) => {
    if (value.from > value.to) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['from'],
        message: 'from must be less than or equal to to',
      })
    }
  })

export type FormAnalyticsGranularity = z.infer<typeof FormAnalyticsGranularitySchema>
export type FormAnalyticsAppliedFilters = z.infer<typeof FormAnalyticsAppliedFiltersSchema>
export type FormAnalyticsFreshness = z.infer<typeof FormAnalyticsFreshnessSchema>
export type FormAnalyticsKpi = z.infer<typeof FormAnalyticsKpiSchema>
export type FormAnalyticsSeriesPoint = z.infer<typeof FormAnalyticsSeriesPointSchema>
export type FormAnalyticsDistributionItem = z.infer<typeof FormAnalyticsDistributionItemSchema>
export type FormAnalyticsQuestionBreakdown = z.infer<typeof FormAnalyticsQuestionBreakdownSchema>
export type FormAnalyticsOverview = z.infer<typeof FormAnalyticsOverviewSchema>
export type FormAnalyticsQuestions = z.infer<typeof FormAnalyticsQuestionsSchema>
export type FormAnalyticsSegmentMetric = z.infer<typeof FormAnalyticsSegmentMetricSchema>
export type FormAnalyticsSegmentItem = z.infer<typeof FormAnalyticsSegmentItemSchema>
export type FormAnalyticsSegments = z.infer<typeof FormAnalyticsSegmentsSchema>
export type FormAnalyticsOverviewQuery = z.infer<typeof FormAnalyticsOverviewQuerySchema>
export type FormAnalyticsQuestionsQuery = z.infer<typeof FormAnalyticsQuestionsQuerySchema>
export type FormAnalyticsSegmentsQuery = z.infer<typeof FormAnalyticsSegmentsQuerySchema>

/**
 * Job lifecycle schemas.
 */
export const JobStatusSchema = z.enum(['queued', 'running', 'succeeded', 'failed', 'cancelled'])
export const JobTypeSchema = z.enum(['sync', 'export', 'analysis'])

export const SyncJobSchema = z.object({
  id: IdSchema,
  type: z.literal('sync'),
  status: JobStatusSchema,
  requestedBy: UserIdSchema,
  connectionId: IdSchema,
  formId: IdSchema.optional(),
  trigger: z.enum(['manual', 'scheduled']),
  startedAt: z.coerce.date().optional(),
  completedAt: z.coerce.date().optional(),
  error: z.string().optional(),
  createdAt: z.coerce.date(),
})

export const CreateSyncJobSchema = z.object({
  connectionId: IdSchema,
  formId: IdSchema.optional(),
  forceFullSync: z.boolean().default(false),
})

export type SyncJob = z.infer<typeof SyncJobSchema>
export type CreateSyncJobInput = z.infer<typeof CreateSyncJobSchema>

/**
 * Share/Permission schemas.
 */
export const PermissionSchema = z.enum(['read', 'write', 'admin'])

export const ShareSchema = z.object({
  id: IdSchema,
  resourceType: z.enum(['form', 'connection']),
  resourceId: IdSchema,
  ownerId: UserIdSchema,
  granteeId: UserIdSchema,
  permission: PermissionSchema,
  createdAt: z.coerce.date(),
  revokedAt: z.coerce.date().optional(),
})

export const CreateShareSchema = z.object({
  granteeId: UserIdSchema,
  permission: PermissionSchema,
})

export type Share = z.infer<typeof ShareSchema>
export type CreateShareInput = z.infer<typeof CreateShareSchema>

/**
 * Export job schemas.
 */
export const ExportFormatSchema = z.enum(['csv', 'json', 'excel'])

export const ExportJobSchema = z.object({
  id: IdSchema,
  formId: IdSchema,
  requestedBy: UserIdSchema,
  format: ExportFormatSchema,
  status: JobStatusSchema,
  downloadUrl: z.string().url().optional(),
  error: z.string().optional(),
  createdAt: z.coerce.date(),
  completedAt: z.coerce.date().optional(),
})

export const CreateExportSchema = z.object({
  formId: IdSchema,
  format: ExportFormatSchema,
  filters: z.object({}).optional(),
})

export type ExportJob = z.infer<typeof ExportJobSchema>
export type CreateExportInput = z.infer<typeof CreateExportSchema>

/**
 * Authentication schemas.
 */
export const AuthUsernameSchema = z
  .string()
  .min(3)
  .max(64)
  .regex(/^[A-Za-z0-9_.-]+$/)

export const AuthPasswordSchema = z.string().min(8).max(128)

export const AuthLoginSchema = z.object({
  username: AuthUsernameSchema,
  password: AuthPasswordSchema,
})

export const AuthRegisterSchema = z.object({
  username: AuthUsernameSchema,
  password: AuthPasswordSchema,
})

export const AuthTokenRefreshSchema = z.object({
  refreshToken: z.string().min(1),
})

export const AuthUserSchema = z.object({
  id: IdSchema,
  username: AuthUsernameSchema,
  orgId: OrgIdSchema,
})

export const AuthSessionSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  tokenType: z.literal('Bearer'),
  expiresIn: z.number().int().positive(),
  user: AuthUserSchema,
})

export type AuthLoginInput = z.infer<typeof AuthLoginSchema>
export type AuthRegisterInput = z.infer<typeof AuthRegisterSchema>
export type AuthTokenRefreshInput = z.infer<typeof AuthTokenRefreshSchema>
export type AuthUser = z.infer<typeof AuthUserSchema>
export type AuthSession = z.infer<typeof AuthSessionSchema>
