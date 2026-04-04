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
    details: z.record(z.unknown()).optional(),
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
  perPage: z.coerce.number().int().positive().max(100).default(20),
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
