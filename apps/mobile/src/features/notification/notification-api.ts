/**
 * Chamadas de notificações e preferências (tela 6d).
 * Toda resposta é validada pelo schema do contrato antes de virar estado.
 */

import {
  notificationListSchema,
  notificationPreferencesSchema,
  type NotificationList,
  type NotificationPreferences,
  type UpdateNotificationPreferences,
} from '@ff/api-contracts';
import { request } from '../../services/api-client';

export async function listNotifications(
  accessToken: string,
  householdId: string,
): Promise<NotificationList> {
  return notificationListSchema.parse(
    await request(`/households/${householdId}/notifications`, { accessToken }),
  );
}

export async function markRead(
  accessToken: string,
  householdId: string,
  notificationId: string,
): Promise<void> {
  await request(`/households/${householdId}/notifications/${notificationId}/read`, {
    method: 'POST',
    accessToken,
  });
}

export async function dismiss(
  accessToken: string,
  householdId: string,
  notificationId: string,
): Promise<void> {
  await request(`/households/${householdId}/notifications/${notificationId}/dismiss`, {
    method: 'POST',
    accessToken,
  });
}

export async function getPreferences(
  accessToken: string,
  householdId: string,
): Promise<NotificationPreferences> {
  return notificationPreferencesSchema.parse(
    await request(`/households/${householdId}/notification-preferences`, { accessToken }),
  );
}

export async function updatePreferences(
  accessToken: string,
  householdId: string,
  input: UpdateNotificationPreferences,
): Promise<NotificationPreferences> {
  return notificationPreferencesSchema.parse(
    await request(`/households/${householdId}/notification-preferences`, {
      method: 'PATCH',
      body: input,
      accessToken,
    }),
  );
}
