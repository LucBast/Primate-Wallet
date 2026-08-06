/**
 * Rotas de família, membros, convites e auditoria.
 *
 * O `householdId` vem no caminho, mas nunca é aceito como autoridade: o serviço
 * resolve a associação do usuário da sessão a cada chamada, e a RLS nega no
 * banco quem não pertence à família.
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import {
  acceptInvitationRequestSchema,
  createHouseholdRequestSchema,
  inviteMemberRequestSchema,
  transferOwnershipRequestSchema,
  updateHouseholdRequestSchema,
  updateMemberRequestSchema,
} from '@ff/api-contracts';
import { uuidSchema } from '@ff/validation';
import { z } from 'zod';
import { requireUser, type AuthenticatedPreHandler } from '../../http/authenticate.js';
import type { RequestContext } from '../auth/service.js';
import type { HouseholdService } from './service.js';

function contextOf(request: FastifyRequest): RequestContext {
  return { requestId: request.id, ip: request.ip ?? null };
}

const householdParams = z.object({ householdId: uuidSchema });
const memberParams = householdParams.extend({ memberId: uuidSchema });
const invitationParams = householdParams.extend({ invitationId: uuidSchema });

export async function registerHouseholdRoutes(
  app: FastifyInstance,
  deps: { readonly households: HouseholdService; readonly authenticate: AuthenticatedPreHandler },
): Promise<void> {
  const { households, authenticate } = deps;
  const auth = { preHandler: authenticate };

  app.get('/households', auth, async (request, reply) => {
    const user = requireUser(request);
    return reply.send({ items: await households.listMine(user.id) });
  });

  app.post('/households', auth, async (request, reply) => {
    const user = requireUser(request);
    const input = createHouseholdRequestSchema.parse(request.body);
    return reply.status(201).send(await households.create(user.id, input, contextOf(request)));
  });

  app.patch('/households/:householdId', auth, async (request, reply) => {
    const user = requireUser(request);
    const { householdId } = householdParams.parse(request.params);
    const input = updateHouseholdRequestSchema.parse(request.body);
    return reply.send(await households.update(user.id, householdId, input, contextOf(request)));
  });

  app.get('/households/:householdId/members', auth, async (request, reply) => {
    const user = requireUser(request);
    const { householdId } = householdParams.parse(request.params);
    return reply.send({ items: await households.listMembers(user.id, householdId) });
  });

  app.patch('/households/:householdId/members/:memberId', auth, async (request, reply) => {
    const user = requireUser(request);
    const { householdId, memberId } = memberParams.parse(request.params);
    const input = updateMemberRequestSchema.parse(request.body);
    return reply.send(
      await households.updateMember(user.id, householdId, memberId, input, contextOf(request)),
    );
  });

  app.post('/households/:householdId/transfer-ownership', auth, async (request, reply) => {
    const user = requireUser(request);
    const { householdId } = householdParams.parse(request.params);
    const input = transferOwnershipRequestSchema.parse(request.body);
    return reply.send(
      await households.transferOwnership(
        user.id,
        householdId,
        input.toMemberId,
        contextOf(request),
      ),
    );
  });

  app.get('/households/:householdId/invitations', auth, async (request, reply) => {
    const user = requireUser(request);
    const { householdId } = householdParams.parse(request.params);
    return reply.send({ items: await households.listInvitations(user.id, householdId) });
  });

  app.post('/households/:householdId/invitations', auth, async (request, reply) => {
    const user = requireUser(request);
    const { householdId } = householdParams.parse(request.params);
    const input = inviteMemberRequestSchema.parse(request.body);
    return reply
      .status(201)
      .send(await households.invite(user.id, householdId, input, contextOf(request)));
  });

  app.delete('/households/:householdId/invitations/:invitationId', auth, async (request, reply) => {
    const user = requireUser(request);
    const { householdId, invitationId } = invitationParams.parse(request.params);
    const result = await households.revokeInvitation(
      user.id,
      householdId,
      invitationId,
      contextOf(request),
    );
    return reply.status(result.revoked ? 200 : 404).send(result);
  });

  app.get('/households/:householdId/audit', auth, async (request, reply) => {
    const user = requireUser(request);
    const { householdId } = householdParams.parse(request.params);
    const { limit } = z
      .object({ limit: z.coerce.number().int().min(1).max(200).default(100) })
      .parse(request.query);
    return reply.send({ items: await households.listAudit(user.id, householdId, limit) });
  });

  // Prévia e aceite do convite: exigem sessão, mas não exigem ser membro.
  app.get('/invitations/preview', auth, async (request, reply) => {
    const { token } = z.object({ token: z.string().min(20).max(256) }).parse(request.query);
    return reply.send(await households.previewInvitation(token));
  });

  app.post('/invitations/accept', auth, async (request, reply) => {
    const user = requireUser(request);
    const input = acceptInvitationRequestSchema.parse(request.body);
    return reply.send(await households.acceptInvitation(user.id, input, contextOf(request)));
  });
}
