/**
 * Rotas de aprovação de lançamentos (tela 3c).
 *
 * Aprovar e recusar são POST separados, e não um PATCH com o desfecho no corpo:
 * são duas ações distintas na auditoria e nos alertas, e um corpo trocado por
 * engano não pode transformar uma recusa em aprovação.
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { approvalFilterSchema, decideApprovalRequestSchema } from '@ff/api-contracts';
import { uuidSchema } from '@ff/validation';
import { requireUser, type AuthenticatedPreHandler } from '../../http/authenticate.js';
import type { RequestContext } from '../auth/service.js';
import type { ApprovalService } from './service.js';

function contextOf(request: FastifyRequest): RequestContext {
  return { requestId: request.id, ip: request.ip ?? null };
}

const householdParams = z.object({ householdId: uuidSchema });
const approvalParams = householdParams.extend({ approvalId: uuidSchema });

export async function registerApprovalRoutes(
  app: FastifyInstance,
  deps: {
    readonly approvals: ApprovalService;
    readonly authenticate: AuthenticatedPreHandler;
  },
): Promise<void> {
  const { approvals, authenticate } = deps;
  const auth = { preHandler: authenticate };

  app.get('/households/:householdId/approvals', auth, async (request, reply) => {
    const user = requireUser(request);
    const { householdId } = householdParams.parse(request.params);
    const filter = approvalFilterSchema.parse(request.query);
    return reply.send(await approvals.list(user.id, householdId, filter));
  });

  app.get('/households/:householdId/approvals/:approvalId', auth, async (request, reply) => {
    const user = requireUser(request);
    const { householdId, approvalId } = approvalParams.parse(request.params);
    return reply.send(await approvals.get(user.id, householdId, approvalId));
  });

  app.post('/households/:householdId/approvals/:approvalId/approve', auth, async (req, reply) => {
    const user = requireUser(req);
    const { householdId, approvalId } = approvalParams.parse(req.params);
    const input = decideApprovalRequestSchema.parse(req.body);
    return reply.send(
      await approvals.approve(user.id, householdId, approvalId, input, contextOf(req)),
    );
  });

  app.post('/households/:householdId/approvals/:approvalId/reject', auth, async (req, reply) => {
    const user = requireUser(req);
    const { householdId, approvalId } = approvalParams.parse(req.params);
    const input = decideApprovalRequestSchema.parse(req.body);
    return reply.send(
      await approvals.reject(user.id, householdId, approvalId, input, contextOf(req)),
    );
  });
}
