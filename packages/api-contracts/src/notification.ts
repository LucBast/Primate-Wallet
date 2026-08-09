/**
 * Contratos de notificações e preferências (docs/12 §3 e §4; tela 6d).
 *
 * O aviso chega PRONTO para a tela: título, corpo e valor já formatáveis, e o
 * destino do toque em `entityType`/`entityId`. O app não remonta a frase a
 * partir do tipo — se remontasse, a mesma notificação teria um texto no push e
 * outro na central, e a pessoa desconfiaria dos dois.
 */

import { z } from 'zod';
import { minorUnitsSchema, uuidSchema } from '@ff/validation';

export const notificationKindSchema = z.enum([
  'DUE_SOON',
  'OVERDUE',
  'STATEMENT_CLOSING',
  'STATEMENT_DUE',
  'CARD_LIMIT',
  'APPROVAL_REQUESTED',
  'INVITE',
  'SYNC_FAILED',
  'SECURITY',
  'DAILY_SUMMARY',
]);
export type NotificationKind = z.infer<typeof notificationKindSchema>;

export const notificationSchema = z.object({
  id: uuidSchema,
  kind: notificationKindSchema,
  title: z.string(),
  body: z.string().nullable(),
  /** Para onde o toque leva (docs/12 §6). */
  entityType: z.string().nullable(),
  entityId: uuidSchema.nullable(),
  amountMinor: minorUnitsSchema.nullable(),
  scheduledFor: z.string(),
  readAt: z.string().nullable(),
  createdAt: z.string(),
});
export type Notification = z.infer<typeof notificationSchema>;

export const notificationListSchema = z.object({
  items: z.array(notificationSchema),
  /** Alimenta o ponto no sino do Início sem uma segunda chamada. */
  unreadCount: z.int().nonnegative(),
});
export type NotificationList = z.infer<typeof notificationListSchema>;

/**
 * Preferências da 6d, uma linha por pessoa.
 *
 * Os padrões são os do screenshot: vencimentos 3 dias antes às 9h, faturas e
 * aprovações ligados, resumo diário desligado. Hora é hora da FAMÍLIA.
 */
export const notificationPreferencesSchema = z.object({
  dueEnabled: z.boolean(),
  dueDaysBefore: z.int().min(0).max(30),
  dueHour: z.int().min(0).max(23),
  statementEnabled: z.boolean(),
  approvalEnabled: z.boolean(),
  dailySummaryEnabled: z.boolean(),
  dailySummaryHour: z.int().min(0).max(23),
  version: z.int(),
});
export type NotificationPreferences = z.infer<typeof notificationPreferencesSchema>;

export const updateNotificationPreferencesSchema = notificationPreferencesSchema
  .omit({ version: true })
  .partial()
  .extend({ expectedVersion: z.int().nonnegative() })
  .refine(
    (input) => Object.keys(input).length > 1,
    'Informe ao menos uma preferência para alterar.',
  );
export type UpdateNotificationPreferences = z.infer<typeof updateNotificationPreferencesSchema>;
