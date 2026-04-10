import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { Database } from '@survey-service/db';
import { getPrincipal } from '../../server/principal';

const CreateShareBodySchema = z.object({
  grantee_user_id: z.string().uuid(),
  permission_level: z.enum(['read', 'write', 'admin']),
});

export async function sharingRoutes(app: FastifyInstance, deps: { db: Kysely<Database> }) {
  async function canAccessFormSharesDb(formId: string, userId: string): Promise<boolean> {
    const form = await deps.db
      .selectFrom('forms')
      .select('id')
      .where('id', '=', formId)
      .where('owner_id', '=', userId)
      .executeTakeFirst();

    return Boolean(form);
  }

  // GET /forms/:id/shares
  app.get('/forms/:id/shares', async (request, reply) => {
    const principal = getPrincipal(request);
    const { id } = request.params as { id: string };

    if (!(await canAccessFormSharesDb(id, principal.userId))) {
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

    const shares = (
      await deps.db
        .selectFrom('form_shares')
        .select(['id', 'form_id', 'grantee_user_id', 'permission_level', 'created_at'])
        .where('form_id', '=', id)
        .orderBy('created_at', 'desc')
        .execute()
    ).map((share) => ({
      ...share,
      created_at: new Date(share.created_at).toISOString(),
    }));

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
    const principal = getPrincipal(request);
    const { id } = request.params as { id: string };

    if (!(await canAccessFormSharesDb(id, principal.userId))) {
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

    const bodyResult = CreateShareBodySchema.safeParse(request.body ?? {});

    if (!bodyResult.success) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'validation_error',
          message: 'Invalid share payload',
          details: {
            issues: bodyResult.error.issues,
          },
        },
        meta: {
          requestId: request.id,
        },
      });
    }

    const createdShare = await deps.db
      .insertInto('form_shares')
      .values({
        form_id: id,
        grantee_user_id: bodyResult.data.grantee_user_id,
        permission_level: bodyResult.data.permission_level,
      })
      .onConflict((oc) =>
        oc.columns(['form_id', 'grantee_user_id']).doUpdateSet({
          permission_level: bodyResult.data.permission_level,
        }),
      )
      .returning(['id', 'form_id', 'grantee_user_id', 'permission_level', 'created_at'])
      .executeTakeFirstOrThrow();

    return reply.status(201).send({
      success: true,
      data: {
        ...createdShare,
        created_at: new Date(createdShare.created_at).toISOString(),
      },
      meta: {
        requestId: request.id,
      },
    });
  });

  // DELETE /forms/:id/shares/:share_id
  app.delete('/forms/:id/shares/:share_id', async (request, reply) => {
    const principal = getPrincipal(request);
    const { id, share_id } = request.params as { id: string; share_id: string };

    if (!(await canAccessFormSharesDb(id, principal.userId))) {
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

    const deleted = await deps.db
      .deleteFrom('form_shares')
      .where('form_id', '=', id)
      .where('id', '=', share_id)
      .returning('id')
      .executeTakeFirst();

    if (!deleted) {
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

    return reply.status(204).send();
  });
}
