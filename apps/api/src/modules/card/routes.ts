/** Rotas de cartão: compras, reembolso, faturas e pagamento. */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  closeCardStatementRequestSchema,
  createCardPurchaseRequestSchema,
  createCardRefundRequestSchema,
  payCardStatementRequestSchema,
  reverseCardPaymentRequestSchema,
} from '@ff/api-contracts';
import { uuidSchema } from '@ff/validation';
import { requireUser, type AuthenticatedPreHandler } from '../../http/authenticate.js';
import type { RequestContext } from '../auth/service.js';
import type { CardService } from './service.js';

function contextOf(request: FastifyRequest): RequestContext {
  return { requestId: request.id, ip: request.ip ?? null };
}

const householdParams = z.object({ householdId: uuidSchema });
const statementParams = householdParams.extend({ statementId: uuidSchema });

export async function registerCardRoutes(
  app: FastifyInstance,
  deps: { readonly cards: CardService; readonly authenticate: AuthenticatedPreHandler },
): Promise<void> {
  const { cards, authenticate } = deps;
  const auth = { preHandler: authenticate };

  app.post('/households/:householdId/card-purchases', auth, async (request, reply) => {
    const user = requireUser(request);
    const { householdId } = householdParams.parse(request.params);
    const input = createCardPurchaseRequestSchema.parse(request.body);
    return reply
      .status(201)
      .send(await cards.createPurchase(user.id, householdId, input, contextOf(request)));
  });

  app.post('/households/:householdId/card-refunds', auth, async (request, reply) => {
    const user = requireUser(request);
    const { householdId } = householdParams.parse(request.params);
    const input = createCardRefundRequestSchema.parse(request.body);
    return reply
      .status(201)
      .send(await cards.createRefund(user.id, householdId, input, contextOf(request)));
  });

  app.get('/households/:householdId/card-statements', auth, async (request, reply) => {
    const user = requireUser(request);
    const { householdId } = householdParams.parse(request.params);
    const { accountId } = z.object({ accountId: uuidSchema }).parse(request.query);
    return reply.send({ items: await cards.listStatements(user.id, householdId, accountId) });
  });

  app.get('/households/:householdId/card-statements/:statementId', auth, async (request, reply) => {
    const user = requireUser(request);
    const { householdId, statementId } = statementParams.parse(request.params);
    return reply.send(await cards.getStatement(user.id, householdId, statementId));
  });

  app.post(
    '/households/:householdId/card-statements/:statementId/close',
    auth,
    async (request, reply) => {
      const user = requireUser(request);
      const { householdId, statementId } = statementParams.parse(request.params);
      const { expectedVersion } = closeCardStatementRequestSchema.parse(request.body);
      return reply.send(
        await cards.closeStatement(
          user.id,
          householdId,
          statementId,
          expectedVersion,
          contextOf(request),
        ),
      );
    },
  );

  app.post(
    '/households/:householdId/card-statements/:statementId/payments',
    auth,
    async (request, reply) => {
      const user = requireUser(request);
      const { householdId, statementId } = statementParams.parse(request.params);
      const input = payCardStatementRequestSchema.parse(request.body);
      return reply
        .status(201)
        .send(
          await cards.payStatement(user.id, householdId, statementId, input, contextOf(request)),
        );
    },
  );

  app.post(
    '/households/:householdId/card-payments/:paymentId/reverse',
    auth,
    async (request, reply) => {
      const user = requireUser(request);
      const { householdId, paymentId } = householdParams
        .extend({ paymentId: uuidSchema })
        .parse(request.params);
      const input = reverseCardPaymentRequestSchema.parse(request.body);
      return reply
        .status(201)
        .send(
          await cards.reversePayment(user.id, householdId, paymentId, input, contextOf(request)),
        );
    },
  );
}
