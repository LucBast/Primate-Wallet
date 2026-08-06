/** Rotas de dashboard, relatórios e exportação. */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { exportRequestSchema, reportModeSchema, reportQuerySchema } from '@ff/api-contracts';
import { uuidSchema } from '@ff/validation';
import { requireUser, type AuthenticatedPreHandler } from '../../http/authenticate.js';
import type { RequestContext } from '../auth/service.js';
import type { ReportService } from './service.js';

function contextOf(request: FastifyRequest): RequestContext {
  return { requestId: request.id, ip: request.ip ?? null };
}

const householdParams = z.object({ householdId: uuidSchema });

export async function registerReportRoutes(
  app: FastifyInstance,
  deps: { readonly reports: ReportService; readonly authenticate: AuthenticatedPreHandler },
): Promise<void> {
  const { reports, authenticate } = deps;
  const auth = { preHandler: authenticate };

  app.get('/households/:householdId/dashboard', auth, async (request, reply) => {
    const user = requireUser(request);
    const { householdId } = householdParams.parse(request.params);
    return reply.send(
      await reports.dashboard(user.id, householdId, reportQuerySchema.parse(request.query)),
    );
  });

  app.get('/households/:householdId/reports/summary', auth, async (request, reply) => {
    const user = requireUser(request);
    const { householdId } = householdParams.parse(request.params);
    return reply.send(
      await reports.summary(user.id, householdId, reportQuerySchema.parse(request.query)),
    );
  });

  app.get('/households/:householdId/reports/by-category', auth, async (request, reply) => {
    const user = requireUser(request);
    const { householdId } = householdParams.parse(request.params);
    return reply.send(
      await reports.byCategory(user.id, householdId, reportQuerySchema.parse(request.query)),
    );
  });

  app.get('/households/:householdId/reports/by-member', auth, async (request, reply) => {
    const user = requireUser(request);
    const { householdId } = householdParams.parse(request.params);
    return reply.send(
      await reports.byMember(user.id, householdId, reportQuerySchema.parse(request.query)),
    );
  });

  app.get('/households/:householdId/reports/by-account', auth, async (request, reply) => {
    const user = requireUser(request);
    const { householdId } = householdParams.parse(request.params);
    return reply.send(
      await reports.byAccount(user.id, householdId, reportQuerySchema.parse(request.query)),
    );
  });

  app.get('/households/:householdId/reports/evolution', auth, async (request, reply) => {
    const user = requireUser(request);
    const { householdId } = householdParams.parse(request.params);
    const { mode, months } = z
      .object({
        mode: reportModeSchema.default('ACCRUAL'),
        months: z.coerce.number().int().min(1).max(24).default(6),
      })
      .parse(request.query);
    return reply.send(await reports.evolution(user.id, householdId, mode, months));
  });

  app.post('/households/:householdId/reports/export', auth, async (request, reply) => {
    const user = requireUser(request);
    const { householdId } = householdParams.parse(request.params);
    const input = exportRequestSchema.parse(request.body);
    return reply.send(await reports.exportData(user.id, householdId, input, contextOf(request)));
  });
}
