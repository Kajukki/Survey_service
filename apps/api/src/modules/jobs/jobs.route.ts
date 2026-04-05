import { FastifyInstance } from 'fastify';

interface JobRecord {
  id: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed';
  source: string;
  created_at: string;
  completed_at: string | null;
}

const mockJobs = new Map<string, JobRecord>();

function nextJobStatus(status: JobRecord['status']): JobRecord['status'] {
  if (status === 'queued') {
    return 'running';
  }

  if (status === 'running') {
    return 'succeeded';
  }

  return status;
}

export async function jobsRoutes(app: FastifyInstance) {
  // GET /jobs
  app.get('/jobs', async (request, reply) => {
    const jobs = [...mockJobs.values()];

    return reply.send({
      success: true,
      data: jobs,
      meta: {
        requestId: request.id,
        pagination: { page: 1, perPage: 20, total: jobs.length, totalPages: 1 },
      },
    });
  });

  // POST /jobs/sync
  app.post('/jobs/sync', async (request, reply) => {
    const id = `job-${Date.now()}`;
    const job: JobRecord = {
      id,
      status: 'queued',
      source: 'manual_sync',
      created_at: new Date().toISOString(),
      completed_at: null,
    };

    mockJobs.set(id, job);

    return reply.status(202).send({
      success: true,
      data: {
        job_id: id,
        status: job.status,
        type: 'sync',
      },
      meta: {
        requestId: request.id,
      },
    });
  });

  // GET /jobs/:id
  app.get('/jobs/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = mockJobs.get(id);

    if (!existing) {
      return reply.status(404).send({
        success: false,
        error: {
          code: 'not_found',
          message: 'Job not found',
        },
        meta: {
          requestId: request.id,
        },
      });
    }

    const status = nextJobStatus(existing.status);
    const updated: JobRecord = {
      ...existing,
      status,
      completed_at: status === 'succeeded' ? new Date().toISOString() : null,
    };

    mockJobs.set(id, updated);

    return reply.send({
      success: true,
      data: {
        ...updated,
        result: status === 'succeeded' ? { sync_count: 154, errors: [] } : null,
      },
      meta: {
        requestId: request.id,
      },
    });
  });
}
