/**
 * Rotas de movimentações realizadas.
 *
 * A chave de idempotência pode vir no corpo (contrato) ou no cabeçalho
 * `Idempotency-Key`; o cabeçalho vence, porque é o que o cliente HTTP reenvia
 * automaticamente numa retentativa.
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  createExpenseRequestSchema,
  createIncomeRequestSchema,
  createTransferRequestSchema,
  reverseTransactionRequestSchema,
  transactionFilterSchema,
  updateAllocationsRequestSchema,
} from '@ff/api-contracts';
import { uuidSchema } from '@ff/validation';
import { requireUser, type AuthenticatedPreHandler } from '../../http/authenticate.js';
import type { RequestContext } from '../auth/service.js';
import type { TransactionService } from './service.js';

function contextOf(request: FastifyRequest): RequestContext {
  return { requestId: request.id, ip: request.ip ?? null };
}

/** Cabeçalho `Idempotency-Key` sobrepõe o corpo, quando presente. */
function withHeaderKey(request: FastifyRequest, body: unknown): unknown {
  const header = request.headers['idempotency-key'];
  if (typeof header !== 'string' || header === '') return body;
  return { ...(body as Record<string, unknown>), idempotencyKey: header };
}

const householdParams = z.object({ householdId: uuidSchema });
const transactionParams = householdParams.extend({ transactionId: uuidSchema });

export async function registerTransactionRoutes(
  app: FastifyInstance,
  deps: {
    readonly transactions: TransactionService;
    readonly authenticate: AuthenticatedPreHandler;
  },
): Promise<void> {
  const { transactions, authenticate } = deps;
  const auth = { preHandler: authenticate };

  app.get('/households/:householdId/transactions', auth, async (request, reply) => {
    const user = requireUser(request);
    const { householdId } = householdParams.parse(request.params);
    const filter = transactionFilterSchema.parse(request.query);
    return reply.send(await transactions.list(user.id, householdId, filter));
  });

  app.get('/households/:householdId/transactions/:transactionId', auth, async (request, reply) => {
    const user = requireUser(request);
    const { householdId, transactionId } = transactionParams.parse(request.params);
    return reply.send(await transactions.get(user.id, householdId, transactionId));
  });

  app.post('/households/:householdId/expenses', auth, async (request, reply) => {
    const user = requireUser(request);
    const { householdId } = householdParams.parse(request.params);
    const input = createExpenseRequestSchema.parse(withHeaderKey(request, request.body));
    return reply
      .status(201)
      .send(await transactions.createExpense(user.id, householdId, input, contextOf(request)));
  });

  app.post('/households/:householdId/incomes', auth, async (request, reply) => {
    const user = requireUser(request);
    const { householdId } = householdParams.parse(request.params);
    const input = createIncomeRequestSchema.parse(withHeaderKey(request, request.body));
    return reply
      .status(201)
      .send(await transactions.createIncome(user.id, householdId, input, contextOf(request)));
  });

  app.post('/households/:householdId/transfers', auth, async (request, reply) => {
    const user = requireUser(request);
    const { householdId } = householdParams.parse(request.params);
    const input = createTransferRequestSchema.parse(withHeaderKey(request, request.body));
    return reply
      .status(201)
      .send(await transactions.createTransfer(user.id, householdId, input, contextOf(request)));
  });

  app.post(
    '/households/:householdId/transactions/:transactionId/reverse',
    auth,
    async (request, reply) => {
      const user = requireUser(request);
      const { householdId, transactionId } = transactionParams.parse(request.params);
      const input = reverseTransactionRequestSchema.parse(withHeaderKey(request, request.body));
      return reply
        .status(201)
        .send(
          await transactions.reverse(
            user.id,
            householdId,
            transactionId,
            input,
            contextOf(request),
          ),
        );
    },
  );

  app.put(
    '/households/:householdId/transactions/:transactionId/allocations',
    auth,
    async (request, reply) => {
      const user = requireUser(request);
      const { householdId, transactionId } = transactionParams.parse(request.params);
      const input = updateAllocationsRequestSchema.parse(request.body);
      return reply.send(
        await transactions.setAllocations(
          user.id,
          householdId,
          transactionId,
          input,
          contextOf(request),
        ),
      );
    },
  );
}
