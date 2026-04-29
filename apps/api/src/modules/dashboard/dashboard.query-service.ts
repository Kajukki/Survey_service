import type {
  DashboardRepository,
  DashboardFormRow,
  FormShareRow,
  FormResponseRow,
  LatestSyncJobRow,
  SyncJobRow,
} from './dashboard.repository';

export type Granularity = 'day' | 'week' | 'month';

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

function selectAccessibleForm(
  ownedForm: DashboardFormRow | null,
  sharedForm: DashboardFormRow | null,
): DashboardFormRow | null {
  if (ownedForm) {
    return ownedForm;
  }

  return sharedForm;
}

function countShares(shares: FormShareRow[]) {
  return {
    readShares: shares.filter((share) => share.permission_level === 'read').length,
    writeShares: shares.filter((share) => share.permission_level === 'write').length,
    adminShares: shares.filter((share) => share.permission_level === 'admin').length,
  };
}

function summarizeJobs(jobs: SyncJobRow[]) {
  return {
    totalSyncJobsInRange: jobs.length,
    succeededSyncJobs: jobs.filter((job) => job.status === 'succeeded').length,
    failedSyncJobs: jobs.filter((job) => job.status === 'failed').length,
    manualSyncJobs: jobs.filter((job) => job.trigger === 'manual').length,
    scheduledSyncJobs: jobs.filter((job) => job.trigger === 'scheduled').length,
  };
}

function summarizeResponses(responses: FormResponseRow[]) {
  return {
    totalResponsesInRange: responses.length,
    completedResponsesInRange: responses.filter((response) => response.completion === 'completed')
      .length,
    partialResponsesInRange: responses.filter((response) => response.completion === 'partial').length,
  };
}

function formatLastSuccessfulSync(latestSucceededSyncJob: LatestSyncJobRow | null) {
  if (!latestSucceededSyncJob) {
    return null;
  }

  return new Date(latestSucceededSyncJob.completed_at ?? latestSucceededSyncJob.created_at);
}

export function createDashboardQueryService(deps: { repository: DashboardRepository }) {
  return {
    async getDashboardData(input: {
      formId: string;
      userId: string;
      from: Date;
      to: Date;
      granularity: Granularity;
    }): Promise<
      | {
          kpis: Array<{ label: string; value: string; delta: string }>;
          series: Array<{ date: string; count: number }>;
          questions: Array<{
            id: string;
            label: string;
            responses: number;
            distribution: Array<{ label: string; value: number }>;
          }>;
        }
      | null
    > {
      let form = await deps.repository.findOwnedForm(input.formId, input.userId);

      if (!form) {
        const hasShare = await deps.repository.hasSharedAccess(input.formId, input.userId);
        if (hasShare) {
          form = await deps.repository.findFormById(input.formId);
        }
      }

      if (!form) {
        return null;
      }

      const rangeStart = startOfUtcDay(input.from);
      const rangeEndExclusive = endExclusiveUtcDay(input.to);

      const [syncJobsInRange, latestSucceededSyncJob, formShares, responsesInRange] =
        await Promise.all([
          deps.repository.listSyncJobsInRange(
            input.formId,
            form.connection_id,
            rangeStart,
            rangeEndExclusive,
          ),
          deps.repository.getLatestSucceededSyncJob(input.formId, form.connection_id),
          deps.repository.listFormShares(input.formId),
          deps.repository.listResponsesInRange(input.formId, rangeStart, rangeEndExclusive),
        ]);

      const jobStats = summarizeJobs(syncJobsInRange);
      const responseStats = summarizeResponses(responsesInRange);
      const shareStats = countShares(formShares);

      const lastSuccessfulSyncAt = formatLastSuccessfulSync(latestSucceededSyncJob);

      const buckets = buildBuckets(
        rangeStart,
        new Date(rangeEndExclusive.getTime() - 1),
        input.granularity,
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
          input.granularity,
        );
        if (bucketIndex >= 0) {
          series[bucketIndex]!.count += 1;
        }
      }

      return {
        kpis: [
          {
            label: 'Total responses',
            value: String(form.response_count),
            delta: `${responseStats.totalResponsesInRange} in selected range`,
          },
          {
            label: 'Last synced',
            value: lastSuccessfulSyncAt ? formatBucketDate(lastSuccessfulSyncAt) : 'Never',
            delta: `${jobStats.succeededSyncJobs}/${jobStats.totalSyncJobsInRange} syncs succeeded in range`,
          },
          {
            label: 'Completed responses',
            value: String(responseStats.completedResponsesInRange),
            delta: `${responseStats.partialResponsesInRange} partial in range`,
          },
          {
            label: 'Collaborators',
            value: String(formShares.length),
            delta: `${jobStats.manualSyncJobs} manual / ${jobStats.scheduledSyncJobs} scheduled syncs`,
          },
        ],
        series,
        questions: [
          {
            id: `${form.id}:response-completion`,
            label: 'Response completion distribution',
            responses: responseStats.totalResponsesInRange,
            distribution: [
              { label: 'Completed', value: responseStats.completedResponsesInRange },
              { label: 'Partial', value: responseStats.partialResponsesInRange },
            ],
          },
          {
            id: `${form.id}:sync-status`,
            label: 'Sync status distribution (selected range)',
            responses: jobStats.totalSyncJobsInRange,
            distribution: [
              { label: 'Succeeded', value: jobStats.succeededSyncJobs },
              { label: 'Failed', value: jobStats.failedSyncJobs },
              {
                label: 'Other',
                value: Math.max(
                  jobStats.totalSyncJobsInRange -
                    jobStats.succeededSyncJobs -
                    jobStats.failedSyncJobs,
                  0,
                ),
              },
            ],
          },
          {
            id: `${form.id}:share-permissions`,
            label: 'Share permission distribution',
            responses: formShares.length,
            distribution: [
              { label: 'Read', value: shareStats.readShares },
              { label: 'Write', value: shareStats.writeShares },
              { label: 'Admin', value: shareStats.adminShares },
            ],
          },
        ],
      };
    },
  };
}
