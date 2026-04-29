import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { Database } from '@survey-service/db';
import { getPrincipal } from '../../server/principal';
import { createDashboardRepository } from './dashboard.repository';
import { createDashboardQueryService } from './dashboard.query-service';

const DashboardQuerySchema = z
  .object({
    formId: z.string().uuid(),
    from: z.coerce.date(),
    to: z.coerce.date(),
    granularity: z.enum(['day', 'week', 'month']).default('day'),
    questionId: z.string().uuid().optional(),
  })
  .refine((value) => value.from <= value.to, {
    message: 'from must be less than or equal to to',
    path: ['from'],
  });

export async function dashboardRoutes(app: FastifyInstance, deps: { db: Kysely<Database> }) {
  const repository = createDashboardRepository(deps.db);
  const queryService = createDashboardQueryService({ repository });

  app.get('/dashboard', async (request, reply) => {
    const principal = getPrincipal(request);
    const queryResult = DashboardQuerySchema.safeParse(request.query ?? {});

    if (!queryResult.success) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'validation_error',
          message: 'Invalid dashboard query parameters',
          details: {
            issues: queryResult.error.issues,
          },
        },
        meta: {
          requestId: request.id,
        },
      });
    }

    const query = queryResult.data;
    const dashboardData = await queryService.getDashboardData({
      formId: query.formId,
      userId: principal.userId,
      from: query.from,
      to: query.to,
      granularity: query.granularity,
    });

    if (!dashboardData) {
      return reply.status(404).send({
        success: false,
        error: {
          code: 'not_found',
          message: 'Form not found',
        },
        meta: {
          requestId: request.id,
        },
      });
    }

    return reply.send(dashboardData);
  });
}
