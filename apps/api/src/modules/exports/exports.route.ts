import { FastifyInstance } from 'fastify';

export async function exportsRoutes(app: FastifyInstance) {
  // POST /v1/exports
  app.post('/v1/exports', async (request, reply) => {
    return reply.status(202).send({
      success: true,
      data: {
        job_id: 'export-job-mock-abcd',
        status: 'queued',
        type: 'export',
      },
    });
  });
}
