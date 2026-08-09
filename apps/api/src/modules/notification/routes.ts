/**
 * Rotas de notificações e preferências (tela 6d).
 *
 * Não existe rota para CRIAR notificação a partir do cliente: aviso é coisa que
 * o servidor produz a partir de um fato financeiro. O cliente só lê, marca como
 * lida e dispensa.
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { updateNotificationPreferencesSchema } from '@ff/api-contracts';
import { uuidSchema } from '@ff/validation';
import { requireUser, type AuthenticatedPreHandler } from '../../http/authenticate.js';
import type { NotificationService } from './service.js';

const householdParams = z.object({ householdId: uuidSchema });
const notificationParams = householdParams.extend({ notificationId: uuidSchema });

export async function registerNotificationRoutes(
  app: FastifyInstance,
  deps: {
    readonly notifications: NotificationService;
    readonly authenticate: AuthenticatedPreHandler;
  },
): Promise<void> {
  const { notifications, authenticate } = deps;
  const auth = { preHandler: authenticate };

  app.get('/households/:householdId/notifications', auth, async (request, reply) => {
    const user = requireUser(request);
    const { householdId } = householdParams.parse(request.params);
    return reply.send(await notifications.list(user.id, householdId));
  });

  app.post(
    '/households/:householdId/notifications/:notificationId/read',
    auth,
    async (request, reply) => {
      const user = requireUser(request);
      const { householdId, notificationId } = notificationParams.parse(request.params);
      await notifications.markRead(user.id, householdId, notificationId);
      return reply.status(204).send();
    },
  );

  app.post(
    '/households/:householdId/notifications/:notificationId/dismiss',
    auth,
    async (request, reply) => {
      const user = requireUser(request);
      const { householdId, notificationId } = notificationParams.parse(request.params);
      await notifications.dismiss(user.id, householdId, notificationId);
      return reply.status(204).send();
    },
  );

  app.post('/households/:householdId/notifications/read-all', auth, async (request, reply) => {
    const user = requireUser(request);
    const { householdId } = householdParams.parse(request.params);
    await notifications.markAllRead(user.id, householdId);
    return reply.status(204).send();
  });

  app.get('/households/:householdId/notification-preferences', auth, async (request, reply) => {
    const user = requireUser(request);
    const { householdId } = householdParams.parse(request.params);
    return reply.send(await notifications.preferences(user.id, householdId));
  });

  app.patch('/households/:householdId/notification-preferences', auth, async (request, reply) => {
    const user = requireUser(request);
    const { householdId } = householdParams.parse(request.params);
    const input = updateNotificationPreferencesSchema.parse(request.body);
    return reply.send(await notifications.updatePreferences(user.id, householdId, input));
  });
}
