import { FastifyInstance } from 'fastify';

const mockShares = [
  {
    id: 'share-mock-1',
    form_id: 'mock-form-id',
    grantee_user_id: 'user-one',
    permission_level: 'read',
    created_at: new Date().toISOString(),
  },
];

export async function sharingRoutes(app: FastifyInstance) {
  // GET /forms/:id/shares
  app.get('/forms/:id/shares', async (request, reply) => {
    const { id } = request.params as { id: string };
    const shares = mockShares.filter((share) => share.form_id === id);

    return reply.send({
      success: true,
      data: shares,
      meta: {
        requestId: request.id,
      },
    });
  });

  // POST /forms/:id/shares
  app.post('/forms/:id/shares', async (request, reply) => {
    const { id } = request.params as { id: string };
    const createdShare = {
      ...mockShares[0],
      id: `share-${Date.now()}`,
      form_id: id,
    };
    mockShares.push(createdShare);

    return reply.status(201).send({
      success: true,
      data: createdShare,
      meta: {
        requestId: request.id,
      },
    });
  });

  // DELETE /forms/:id/shares/:share_id
  app.delete('/forms/:id/shares/:share_id', async (request, reply) => {
    const { id, share_id } = request.params as { id: string; share_id: string };
    const existingIndex = mockShares.findIndex(
      (share) => share.form_id === id && share.id === share_id,
    );

    if (existingIndex === -1) {
      return reply.status(404).send({
        success: false,
        error: {
          code: 'not_found',
          message: 'Share not found',
        },
        meta: {
          requestId: request.id,
        },
      });
    }

    mockShares.splice(existingIndex, 1);
    return reply.status(204).send();
  });
}
