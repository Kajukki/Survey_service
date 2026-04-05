import { FastifyInstance } from 'fastify';

const mockExports = [
  {
    id: 'export-mock-1',
    format: 'csv',
    status: 'ready',
    requested_at: new Date(Date.now() - 3600_000).toISOString(),
  },
  {
    id: 'export-mock-2',
    format: 'excel',
    status: 'queued',
    requested_at: new Date().toISOString(),
  },
];

export async function exportsRoutes(app: FastifyInstance) {
  // GET /exports
  app.get('/exports', async (request, reply) => {
    return reply.send({
      success: true,
      data: mockExports,
      meta: {
        requestId: request.id,
        pagination: { page: 1, perPage: 20, total: mockExports.length, totalPages: 1 },
      },
    });
  });

  // POST /exports
  app.post('/exports', async (request, reply) => {
    const exportJob = {
      id: `export-job-${Date.now()}`,
      format: 'csv',
      status: 'queued',
      requested_at: new Date().toISOString(),
    };
    mockExports.unshift(exportJob);

    return reply.status(202).send({
      success: true,
      data: exportJob,
      meta: {
        requestId: request.id,
      },
    });
  });
}
