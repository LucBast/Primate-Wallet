/**
 * Rotas de planejamento: contas previstas, parcelamentos, recorrências e anexos.
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  cancelPlannedEntryRequestSchema,
  reverseSettlementRequestSchema,
  settlePlannedEntryRequestSchema,
  createAttachmentRequestSchema,
  createPlannedEntryRequestSchema,
  plannedEntryNatureSchema,
  updatePlannedEntryRequestSchema,
} from '@ff/api-contracts';
import { isoDateSchema, uuidSchema } from '@ff/validation';
import { requireUser, type AuthenticatedPreHandler } from '../../http/authenticate.js';
import type { RequestContext } from '../auth/service.js';
import type { PlanningService } from './service.js';
import type { SettlementService } from './settlement-service.js';

function contextOf(request: FastifyRequest): RequestContext {
  return { requestId: request.id, ip: request.ip ?? null };
}

const householdParams = z.object({ householdId: uuidSchema });
const entryParams = householdParams.extend({ entryId: uuidSchema });

export async function registerPlanningRoutes(
  app: FastifyInstance,
  deps: {
    readonly planning: PlanningService;
    readonly settlements: SettlementService;
    readonly authenticate: AuthenticatedPreHandler;
  },
): Promise<void> {
  const { planning, settlements, authenticate } = deps;
  const auth = { preHandler: authenticate };

  app.get('/households/:householdId/planned-entries', auth, async (request, reply) => {
    const user = requireUser(request);
    const { householdId } = householdParams.parse(request.params);
    const query = z
      .object({
        nature: plannedEntryNatureSchema.default('PAYABLE'),
        from: isoDateSchema,
        to: isoDateSchema,
        includeSettled: z.coerce.boolean().default(true),
      })
      .parse(request.query);
    return reply.send(await planning.list(user.id, householdId, query));
  });

  app.post('/households/:householdId/planned-entries', auth, async (request, reply) => {
    const user = requireUser(request);
    const { householdId } = householdParams.parse(request.params);
    const input = createPlannedEntryRequestSchema.parse(request.body);
    const items = await planning.create(user.id, householdId, input, contextOf(request));
    return reply.status(201).send({ items });
  });

  app.get('/households/:householdId/planned-entries/:entryId', auth, async (request, reply) => {
    const user = requireUser(request);
    const { householdId, entryId } = entryParams.parse(request.params);
    return reply.send(await planning.get(user.id, householdId, entryId));
  });

  app.patch('/households/:householdId/planned-entries/:entryId', auth, async (request, reply) => {
    const user = requireUser(request);
    const { householdId, entryId } = entryParams.parse(request.params);
    const input = updatePlannedEntryRequestSchema.parse(request.body);
    return reply.send(
      await planning.update(user.id, householdId, entryId, input, contextOf(request)),
    );
  });

  app.post(
    '/households/:householdId/planned-entries/:entryId/cancel',
    auth,
    async (request, reply) => {
      const user = requireUser(request);
      const { householdId, entryId } = entryParams.parse(request.params);
      const input = cancelPlannedEntryRequestSchema.parse(request.body);
      return reply.send(
        await planning.cancel(user.id, householdId, entryId, input, contextOf(request)),
      );
    },
  );

  app.post(
    '/households/:householdId/planned-entries/:entryId/settlements',
    auth,
    async (request, reply) => {
      const user = requireUser(request);
      const { householdId, entryId } = entryParams.parse(request.params);
      const input = settlePlannedEntryRequestSchema.parse(request.body);
      return reply
        .status(201)
        .send(await settlements.settle(user.id, householdId, entryId, input, contextOf(request)));
    },
  );

  app.get(
    '/households/:householdId/planned-entries/:entryId/settlements',
    auth,
    async (request, reply) => {
      const user = requireUser(request);
      const { householdId, entryId } = entryParams.parse(request.params);
      return reply.send({ items: await settlements.list(user.id, householdId, entryId) });
    },
  );

  app.post(
    '/households/:householdId/settlements/:settlementId/reverse',
    auth,
    async (request, reply) => {
      const user = requireUser(request);
      const { householdId, settlementId } = householdParams
        .extend({ settlementId: uuidSchema })
        .parse(request.params);
      const input = reverseSettlementRequestSchema.parse(request.body);
      return reply
        .status(201)
        .send(
          await settlements.reverse(user.id, householdId, settlementId, input, contextOf(request)),
        );
    },
  );

  app.post('/households/:householdId/attachments', auth, async (request, reply) => {
    const user = requireUser(request);
    const { householdId } = householdParams.parse(request.params);
    const input = createAttachmentRequestSchema.parse(request.body);
    return reply
      .status(201)
      .send(await planning.createAttachment(user.id, householdId, input, contextOf(request)));
  });

  app.get('/households/:householdId/attachments', auth, async (request, reply) => {
    const user = requireUser(request);
    const { householdId } = householdParams.parse(request.params);
    const { entityType, entityId } = z
      .object({
        entityType: z.enum(['planned_entry', 'transaction', 'settlement', 'card_statement']),
        entityId: uuidSchema,
      })
      .parse(request.query);
    return reply.send({
      items: await planning.listAttachments(user.id, householdId, entityType, entityId),
    });
  });
}
