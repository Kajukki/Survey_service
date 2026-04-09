import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { Database } from '@survey-service/db';
import { getPrincipal } from '../../server/principal';

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

type Granularity = 'day' | 'week' | 'month';

function formatBucketDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addStep(date: Date, granularity: Granularity): Date {
  const next = new Date(date);
  if (granularity === 'day') {
    next.setUTCDate(next.getUTCDate() + 1);
    return next;
  }

  if (granularity === 'week') {
    next.setUTCDate(next.getUTCDate() + 7);
    return next;
  }

  next.setUTCMonth(next.getUTCMonth() + 1);
  return next;
}

function buildBuckets(from: Date, to: Date, granularity: Granularity): Array<{ start: Date; key: string }> {
  const buckets: Array<{ start: Date; key: string }> = [];
  let current = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  const end = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate()));

  while (current <= end) {
    buckets.push({
      start: new Date(current),
      key: formatBucketDate(current),
    });
    current = addStep(current, granularity);
  }

  return buckets;
}

function findBucketIndex(timestamp: Date, buckets: Array<{ start: Date }>, granularity: Granularity): number {
  for (let index = buckets.length - 1; index >= 0; index -= 1) {
    const bucketStart = buckets[index]!.start;
    const bucketEnd = addStep(bucketStart, granularity);
    if (timestamp >= bucketStart && timestamp < bucketEnd) {
      return index;
    }
  }

  return -1;
}

export async function dashboardRoutes(app: FastifyInstance, deps: { db: Kysely<Database> }) {
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
    let form = await deps.db
      .selectFrom('forms')
      .select(['id', 'title', 'response_count'])
      .where('id', '=', query.formId)
      .where('owner_id', '=', principal.userId)
      .executeTakeFirst();

    if (!form) {
      const share = await deps.db
        .selectFrom('form_shares')
        .select('form_id')
        .where('form_id', '=', query.formId)
        .where('grantee_user_id', '=', principal.userId)
        .executeTakeFirst();

      if (share) {
        form = await deps.db
          .selectFrom('forms')
          .select(['id', 'title', 'response_count'])
          .where('id', '=', query.formId)
          .executeTakeFirst();
      }
    }

    if (!form) {
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

    const [syncJobs, formShares] = await Promise.all([
      deps.db
        .selectFrom('jobs')
        .select(['id', 'status', 'trigger', 'created_at'])
        .where('form_id', '=', query.formId)
        .where('created_at', '>=', query.from)
        .where('created_at', '<=', query.to)
        .execute(),
      deps.db
        .selectFrom('form_shares')
        .select(['permission_level'])
        .where('form_id', '=', query.formId)
        .execute(),
    ]);

    const totalSyncJobs = syncJobs.length;
    const succeededSyncJobs = syncJobs.filter((job) => job.status === 'succeeded').length;
    const failedSyncJobs = syncJobs.filter((job) => job.status === 'failed').length;
    const manualSyncJobs = syncJobs.filter((job) => job.trigger === 'manual').length;
    const scheduledSyncJobs = syncJobs.filter((job) => job.trigger === 'scheduled').length;

    const buckets = buildBuckets(query.from, query.to, query.granularity);
    const series = buckets.map((bucket) => ({
      date: bucket.key,
      count: 0,
    }));

    for (const job of syncJobs) {
      const bucketIndex = findBucketIndex(new Date(job.created_at), buckets, query.granularity);
      if (bucketIndex >= 0) {
        series[bucketIndex]!.count += 1;
      }
    }

    const readShares = formShares.filter((share) => share.permission_level === 'read').length;
    const writeShares = formShares.filter((share) => share.permission_level === 'write').length;
    const adminShares = formShares.filter((share) => share.permission_level === 'admin').length;

    return reply.send({
      kpis: [
        {
          label: 'Responses',
          value: String(form.response_count),
          delta: `${totalSyncJobs} sync jobs in range`,
        },
        {
          label: 'Successful syncs',
          value: String(succeededSyncJobs),
          delta: `${failedSyncJobs} failed`,
        },
        {
          label: 'Collaborators',
          value: String(formShares.length),
          delta: `${manualSyncJobs} manual / ${scheduledSyncJobs} scheduled`,
        },
      ],
      series,
      questions: [
        {
          id: `${form.id}:sync-status`,
          label: 'Sync status distribution',
          responses: totalSyncJobs,
          distribution: [
            { label: 'Succeeded', value: succeededSyncJobs },
            { label: 'Failed', value: failedSyncJobs },
            {
              label: 'Other',
              value: Math.max(totalSyncJobs - succeededSyncJobs - failedSyncJobs, 0),
            },
          ],
        },
        {
          id: `${form.id}:sync-trigger`,
          label: 'Sync trigger distribution',
          responses: totalSyncJobs,
          distribution: [
            { label: 'Manual', value: manualSyncJobs },
            { label: 'Scheduled', value: scheduledSyncJobs },
          ],
        },
        {
          id: `${form.id}:share-permissions`,
          label: 'Share permission distribution',
          responses: formShares.length,
          distribution: [
            { label: 'Read', value: readShares },
            { label: 'Write', value: writeShares },
            { label: 'Admin', value: adminShares },
          ],
        },
      ],
    });
  });
}
