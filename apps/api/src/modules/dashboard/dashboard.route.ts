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

function startOfUtcDay(input: Date): Date {
  return new Date(Date.UTC(input.getUTCFullYear(), input.getUTCMonth(), input.getUTCDate()));
}

function endExclusiveUtcDay(input: Date): Date {
  const start = startOfUtcDay(input);
  start.setUTCDate(start.getUTCDate() + 1);
  return start;
}
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

function buildBuckets(
  from: Date,
  to: Date,
  granularity: Granularity,
): Array<{ start: Date; key: string }> {
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

function findBucketIndex(
  timestamp: Date,
  buckets: Array<{ start: Date }>,
  granularity: Granularity,
): number {
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
      .select(['id', 'connection_id', 'title', 'response_count', 'updated_at'])
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
          .select(['id', 'connection_id', 'title', 'response_count', 'updated_at'])
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

    const rangeStart = startOfUtcDay(query.from);
    const rangeEndExclusive = endExclusiveUtcDay(query.to);

    const [syncJobsInRange, latestSucceededSyncJob, formShares, responsesInRange] =
      await Promise.all([
        deps.db
          .selectFrom('jobs')
          .select(['id', 'status', 'trigger', 'created_at'])
          .where((eb) =>
            eb.or([
              eb('form_id', '=', query.formId),
              eb.and([eb('form_id', 'is', null), eb('connection_id', '=', form.connection_id)]),
            ]),
          )
          .where('created_at', '>=', rangeStart)
          .where('created_at', '<', rangeEndExclusive)
          .execute(),
        deps.db
          .selectFrom('jobs')
          .select(['id', 'created_at', 'completed_at'])
          .where((eb) =>
            eb.or([
              eb('form_id', '=', query.formId),
              eb.and([eb('form_id', 'is', null), eb('connection_id', '=', form.connection_id)]),
            ]),
          )
          .where('status', '=', 'succeeded')
          .orderBy('completed_at', 'desc')
          .orderBy('created_at', 'desc')
          .executeTakeFirst(),
        deps.db
          .selectFrom('form_shares')
          .select(['permission_level'])
          .where('form_id', '=', query.formId)
          .execute(),
        deps.db
          .selectFrom('form_responses')
          .select(['id', 'submitted_at', 'completion'])
          .where('form_id', '=', query.formId)
          .where('submitted_at', '>=', rangeStart)
          .where('submitted_at', '<', rangeEndExclusive)
          .execute(),
      ]);

    const totalSyncJobsInRange = syncJobsInRange.length;
    const succeededSyncJobs = syncJobsInRange.filter((job) => job.status === 'succeeded').length;
    const failedSyncJobs = syncJobsInRange.filter((job) => job.status === 'failed').length;
    const manualSyncJobs = syncJobsInRange.filter((job) => job.trigger === 'manual').length;
    const scheduledSyncJobs = syncJobsInRange.filter((job) => job.trigger === 'scheduled').length;

    const totalResponsesInRange = responsesInRange.length;
    const completedResponsesInRange = responsesInRange.filter(
      (response) => response.completion === 'completed',
    ).length;
    const partialResponsesInRange = responsesInRange.filter(
      (response) => response.completion === 'partial',
    ).length;

    const lastSuccessfulSyncAt = latestSucceededSyncJob
      ? new Date(latestSucceededSyncJob.completed_at ?? latestSucceededSyncJob.created_at)
      : null;

    const buckets = buildBuckets(
      rangeStart,
      new Date(rangeEndExclusive.getTime() - 1),
      query.granularity,
    );
    const series = buckets.map((bucket) => ({
      date: bucket.key,
      count: 0,
    }));

    for (const response of responsesInRange) {
      if (!response.submitted_at) {
        continue;
      }

      const bucketIndex = findBucketIndex(
        new Date(response.submitted_at),
        buckets,
        query.granularity,
      );
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
          label: 'Total responses',
          value: String(form.response_count),
          delta: `${totalResponsesInRange} in selected range`,
        },
        {
          label: 'Last synced',
          value: lastSuccessfulSyncAt ? formatBucketDate(lastSuccessfulSyncAt) : 'Never',
          delta: `${succeededSyncJobs}/${totalSyncJobsInRange} syncs succeeded in range`,
        },
        {
          label: 'Completed responses',
          value: String(completedResponsesInRange),
          delta: `${partialResponsesInRange} partial in range`,
        },
        {
          label: 'Collaborators',
          value: String(formShares.length),
          delta: `${manualSyncJobs} manual / ${scheduledSyncJobs} scheduled syncs`,
        },
      ],
      series,
      questions: [
        {
          id: `${form.id}:response-completion`,
          label: 'Response completion distribution',
          responses: totalResponsesInRange,
          distribution: [
            { label: 'Completed', value: completedResponsesInRange },
            { label: 'Partial', value: partialResponsesInRange },
          ],
        },
        {
          id: `${form.id}:sync-status`,
          label: 'Sync status distribution (selected range)',
          responses: totalSyncJobsInRange,
          distribution: [
            { label: 'Succeeded', value: succeededSyncJobs },
            { label: 'Failed', value: failedSyncJobs },
            {
              label: 'Other',
              value: Math.max(totalSyncJobsInRange - succeededSyncJobs - failedSyncJobs, 0),
            },
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
