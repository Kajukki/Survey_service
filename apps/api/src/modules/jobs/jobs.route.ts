import { FastifyInstance } from 'fastify';

// Mock state variable
let jobStatus: 'queued' | 'processing' | 'completed' = 'queued';

export async function jobsRoutes(app: FastifyInstance) {
  // GET /v1/jobs/:id
  app.get('/v1/jobs/:id', async (request, reply) => {
    // Advance state to simulate progress
    if (jobStatus === 'queued') jobStatus = 'processing';
    else if (jobStatus === 'processing') jobStatus = 'completed';

    return reply.send({
      success: true,
      data: {
        id: (request.params as any).id,
        status: jobStatus,
        result: jobStatus === 'completed' ? { sync_count: 154, errors: [] } : null,
        created_at: new Date().toISOString(),
        completed_at: jobStatus === 'completed' ? new Date().toISOString() : null,
      },
    });
  });
}
