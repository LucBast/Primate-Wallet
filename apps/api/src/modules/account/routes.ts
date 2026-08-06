/**
 * Rotas de contas, cartões, permissões por conta e categorias.
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  adjustBalanceRequestSchema,
  createAccountRequestSchema,
  createCategoryRequestSchema,
  setAccountPermissionsRequestSchema,
  updateAccountRequestSchema,
  updateCategoryRequestSchema,
} from '@ff/api-contracts';
import { isoDateSchema, uuidSchema } from '@ff/validation';
import { requireUser, type AuthenticatedPreHandler } from '../../http/authenticate.js';
import type { RequestContext } from '../auth/service.js';
import type { AccountService } from './service.js';

function contextOf(request: FastifyRequest): RequestContext {
  return { requestId: request.id, ip: request.ip ?? null };
}

const householdParams = z.object({ householdId: uuidSchema });
const accountParams = householdParams.extend({ accountId: uuidSchema });
const categoryParams = householdParams.extend({ categoryId: uuidSchema });
const memberParams = householdParams.extend({ memberId: uuidSchema });

export async function registerAccountRoutes(
  app: FastifyInstance,
  deps: { readonly accounts: AccountService; readonly authenticate: AuthenticatedPreHandler },
): Promise<void> {
  const { accounts, authenticate } = deps;
  const auth = { preHandler: authenticate };

  app.get('/households/:householdId/accounts', auth, async (request, reply) => {
    const user = requireUser(request);
    const { householdId } = householdParams.parse(request.params);
    const { includeArchived } = z
      .object({ includeArchived: z.coerce.boolean().default(false) })
      .parse(request.query);
    return reply.send({ items: await accounts.list(user.id, householdId, includeArchived) });
  });

  app.post('/households/:householdId/accounts', auth, async (request, reply) => {
    const user = requireUser(request);
    const { householdId } = householdParams.parse(request.params);
    const input = createAccountRequestSchema.parse(request.body);
    return reply
      .status(201)
      .send(await accounts.create(user.id, householdId, input, contextOf(request)));
  });

  app.get('/households/:householdId/accounts/:accountId', auth, async (request, reply) => {
    const user = requireUser(request);
    const { householdId, accountId } = accountParams.parse(request.params);
    return reply.send(await accounts.get(user.id, householdId, accountId));
  });

  app.patch('/households/:householdId/accounts/:accountId', auth, async (request, reply) => {
    const user = requireUser(request);
    const { householdId, accountId } = accountParams.parse(request.params);
    const input = updateAccountRequestSchema.parse(request.body);
    return reply.send(
      await accounts.update(user.id, householdId, accountId, input, contextOf(request)),
    );
  });

  app.post('/households/:householdId/accounts/:accountId/archive', auth, async (request, reply) => {
    const user = requireUser(request);
    const { householdId, accountId } = accountParams.parse(request.params);
    const { archived } = z.object({ archived: z.boolean().default(true) }).parse(request.body);
    return reply.send(
      await accounts.archive(user.id, householdId, accountId, archived, contextOf(request)),
    );
  });

  app.post(
    '/households/:householdId/accounts/:accountId/adjust-balance',
    auth,
    async (request, reply) => {
      const user = requireUser(request);
      const { householdId, accountId } = accountParams.parse(request.params);
      const input = adjustBalanceRequestSchema.parse(request.body);
      return reply.send(
        await accounts.adjustBalance(user.id, householdId, accountId, input, contextOf(request)),
      );
    },
  );

  app.get(
    '/households/:householdId/accounts/:accountId/statement',
    auth,
    async (request, reply) => {
      const user = requireUser(request);
      const { householdId, accountId } = accountParams.parse(request.params);
      const { from, to } = z
        .object({ from: isoDateSchema, to: isoDateSchema })
        .parse(request.query);
      return reply.send({
        items: await accounts.statement(user.id, householdId, accountId, from, to),
      });
    },
  );

  app.get(
    '/households/:householdId/members/:memberId/account-permissions',
    auth,
    async (request, reply) => {
      const user = requireUser(request);
      const { householdId, memberId } = memberParams.parse(request.params);
      return reply.send({ items: await accounts.listPermissions(user.id, householdId, memberId) });
    },
  );

  app.put(
    '/households/:householdId/members/:memberId/account-permissions',
    auth,
    async (request, reply) => {
      const user = requireUser(request);
      const { householdId, memberId } = memberParams.parse(request.params);
      const input = setAccountPermissionsRequestSchema.parse(request.body);
      return reply.send({
        items: await accounts.setPermissions(
          user.id,
          householdId,
          memberId,
          input,
          contextOf(request),
        ),
      });
    },
  );

  app.get('/households/:householdId/categories', auth, async (request, reply) => {
    const user = requireUser(request);
    const { householdId } = householdParams.parse(request.params);
    const { includeArchived } = z
      .object({ includeArchived: z.coerce.boolean().default(false) })
      .parse(request.query);
    return reply.send({
      items: await accounts.listCategories(user.id, householdId, includeArchived),
    });
  });

  app.post('/households/:householdId/categories', auth, async (request, reply) => {
    const user = requireUser(request);
    const { householdId } = householdParams.parse(request.params);
    const input = createCategoryRequestSchema.parse(request.body);
    return reply
      .status(201)
      .send(await accounts.createCategory(user.id, householdId, input, contextOf(request)));
  });

  app.patch('/households/:householdId/categories/:categoryId', auth, async (request, reply) => {
    const user = requireUser(request);
    const { householdId, categoryId } = categoryParams.parse(request.params);
    const input = updateCategoryRequestSchema.parse(request.body);
    return reply.send(
      await accounts.updateCategory(user.id, householdId, categoryId, input, contextOf(request)),
    );
  });
}
