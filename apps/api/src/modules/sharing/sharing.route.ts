import { FastifyInstance } from 'fastify';

const mockShares = [
  {
    id: 'share-mock-1',
    form_id: 'mock-form-id',
    grantee_user_id: 'mock-user-2',
    permission_level: 'read',
    created_at: new Date().toISOString(),
  },
];

export async function sharingRoutes(app: FastifyInstance) {
  // GET /v1/forms/:id/shares
  app.get('/v1/forms/:id/shares', async (request, reply) => {
    return reply.send({ success: true, data: mockShares });
  });

  // POST /v1/forms/:id/shares
  app.post('/v1/forms/:id/shares', async (request, reply) => {
    return reply.status(201).send({ success: true, data: mockShares[0] });
  });

  // DELETE /v1/forms/:id/shares/:share_id
  app.delete('/v1/forms/:id/shares/:share_id', async (request, reply) => {
    return reply.status(204).send();
  });
}
