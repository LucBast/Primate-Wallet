/**
 * Notificações e preferências (docs/12 §3, §4 e §5; tela 6d).
 *
 * A geração é IDEMPOTENTE por construção: cada aviso carrega uma `dedupe_key`
 * com índice único, e a inserção usa `ON CONFLICT DO NOTHING`. O job pode rodar
 * de hora em hora, duas vezes seguidas ou em duas instâncias ao mesmo tempo —
 * a pessoa continua recebendo um aviso por fato.
 *
 * Cancelar não apaga (docs/12 §5). O aviso de uma conta que acabou de ser paga
 * ganha `canceled_at` e um motivo, e some da central. Apagar perderia a
 * explicação de por que ele sumiu.
 */

import { DomainError } from '@ff/domain';
import type {
  Notification,
  NotificationList,
  NotificationPreferences,
  UpdateNotificationPreferences,
} from '@ff/api-contracts';
import { withUserTransaction, type Database, type PoolClient } from '../../db/pool.js';

type NotificationRow = {
  id: string;
  kind: Notification['kind'];
  title: string;
  body: string | null;
  entity_type: string | null;
  entity_id: string | null;
  amount_minor: string | null;
  scheduled_for: Date;
  read_at: Date | null;
  created_at: Date;
};

function toNotification(row: NotificationRow): Notification {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    body: row.body,
    entityType: row.entity_type,
    entityId: row.entity_id,
    amountMinor: row.amount_minor === null ? null : Number(row.amount_minor),
    scheduledFor: row.scheduled_for.toISOString(),
    readAt: row.read_at === null ? null : row.read_at.toISOString(),
    createdAt: row.created_at.toISOString(),
  };
}

type PreferencesRow = {
  due_enabled: boolean;
  due_days_before: number;
  due_hour: number;
  statement_enabled: boolean;
  approval_enabled: boolean;
  daily_summary_enabled: boolean;
  daily_summary_hour: number;
  version: number;
};

function toPreferences(row: PreferencesRow): NotificationPreferences {
  return {
    dueEnabled: row.due_enabled,
    dueDaysBefore: row.due_days_before,
    dueHour: row.due_hour,
    statementEnabled: row.statement_enabled,
    approvalEnabled: row.approval_enabled,
    dailySummaryEnabled: row.daily_summary_enabled,
    dailySummaryHour: row.daily_summary_hour,
    version: row.version,
  };
}

async function memberOf(client: PoolClient, householdId: string, userId: string): Promise<string> {
  const result = await client.query<{ id: string }>(
    `SELECT id FROM household_members
      WHERE household_id = $1 AND user_id = $2 AND status = 'ACTIVE'`,
    [householdId, userId],
  );
  const row = result.rows[0];
  if (!row) throw new DomainError('HOUSEHOLD_NOT_FOUND');
  return row.id;
}

/**
 * Lê as preferências criando-as na primeira vez.
 *
 * Os padrões vivem no `DEFAULT` das colunas, então a linha nova já nasce com o
 * que a 6d mostra. Criar sob demanda evita ter de povoar preferências para toda
 * família existente numa migração de dados.
 */
async function ensurePreferences(
  client: PoolClient,
  householdId: string,
  memberId: string,
): Promise<PreferencesRow> {
  const existing = await client.query<PreferencesRow>(
    `SELECT due_enabled, due_days_before, due_hour, statement_enabled, approval_enabled,
            daily_summary_enabled, daily_summary_hour, version
       FROM notification_preferences WHERE member_id = $1`,
    [memberId],
  );
  const found = existing.rows[0];
  if (found) return found;

  const created = await client.query<PreferencesRow>(
    `INSERT INTO notification_preferences (household_id, member_id)
     VALUES ($1, $2)
     ON CONFLICT (member_id) DO UPDATE SET member_id = EXCLUDED.member_id
     RETURNING due_enabled, due_days_before, due_hour, statement_enabled, approval_enabled,
               daily_summary_enabled, daily_summary_hour, version`,
    [householdId, memberId],
  );
  const row = created.rows[0];
  if (!row) throw new DomainError('INTERNAL_ERROR');
  return row;
}

export type NotificationService = ReturnType<typeof createNotificationService>;

export function createNotificationService(deps: { readonly db: Database }) {
  const { db } = deps;

  return {
    /** A central da 6d: os avisos da pessoa, do mais recente para o mais antigo. */
    async list(userId: string, householdId: string, limit = 50): Promise<NotificationList> {
      return withUserTransaction(
        db,
        userId,
        async (client) => {
          await memberOf(client, householdId, userId);
          const result = await client.query<NotificationRow>(
            `SELECT id, kind, title, body, entity_type, entity_id, amount_minor,
                    scheduled_for, read_at, created_at
               FROM notifications
              WHERE household_id = $1
                AND canceled_at IS NULL
                AND scheduled_for <= now()
              ORDER BY scheduled_for DESC
              LIMIT $2`,
            [householdId, limit],
          );
          const unread = await client.query<{ count: string }>(
            `SELECT count(*)::text AS count FROM notifications
              WHERE household_id = $1 AND canceled_at IS NULL
                AND read_at IS NULL AND scheduled_for <= now()`,
            [householdId],
          );
          return {
            items: result.rows.map(toNotification),
            unreadCount: Number(unread.rows[0]?.count ?? 0),
          };
        },
        { readOnly: true },
      );
    },

    async markRead(userId: string, householdId: string, notificationId: string): Promise<void> {
      await withUserTransaction(db, userId, async (client) => {
        await memberOf(client, householdId, userId);
        await client.query(
          `UPDATE notifications SET read_at = now()
            WHERE id = $1 AND household_id = $2 AND read_at IS NULL`,
          [notificationId, householdId],
        );
      });
    },

    async markAllRead(userId: string, householdId: string): Promise<void> {
      await withUserTransaction(db, userId, async (client) => {
        await memberOf(client, householdId, userId);
        await client.query(
          `UPDATE notifications SET read_at = now()
            WHERE household_id = $1 AND read_at IS NULL AND canceled_at IS NULL`,
          [householdId],
        );
      });
    },

    /** "Depois" na 6d: some da central sem virar lida nem apagada. */
    async dismiss(userId: string, householdId: string, notificationId: string): Promise<void> {
      await withUserTransaction(db, userId, async (client) => {
        await memberOf(client, householdId, userId);
        await client.query(
          `UPDATE notifications
              SET canceled_at = now(), canceled_reason = 'DISMISSED_BY_USER'
            WHERE id = $1 AND household_id = $2 AND canceled_at IS NULL`,
          [notificationId, householdId],
        );
      });
    },

    async preferences(userId: string, householdId: string): Promise<NotificationPreferences> {
      return withUserTransaction(db, userId, async (client) => {
        const memberId = await memberOf(client, householdId, userId);
        return toPreferences(await ensurePreferences(client, householdId, memberId));
      });
    },

    async updatePreferences(
      userId: string,
      householdId: string,
      input: UpdateNotificationPreferences,
    ): Promise<NotificationPreferences> {
      return withUserTransaction(db, userId, async (client) => {
        const memberId = await memberOf(client, householdId, userId);
        const current = await ensurePreferences(client, householdId, memberId);
        if (current.version !== input.expectedVersion) {
          throw new DomainError('VERSION_CONFLICT', { currentVersion: current.version });
        }

        const updated = await client.query<PreferencesRow>(
          `UPDATE notification_preferences
              SET due_enabled           = COALESCE($2::boolean, due_enabled),
                  due_days_before       = COALESCE($3::integer, due_days_before),
                  due_hour              = COALESCE($4::integer, due_hour),
                  statement_enabled     = COALESCE($5::boolean, statement_enabled),
                  approval_enabled      = COALESCE($6::boolean, approval_enabled),
                  daily_summary_enabled = COALESCE($7::boolean, daily_summary_enabled),
                  daily_summary_hour    = COALESCE($8::integer, daily_summary_hour),
                  version = version + 1
            WHERE member_id = $1
            RETURNING due_enabled, due_days_before, due_hour, statement_enabled,
                      approval_enabled, daily_summary_enabled, daily_summary_hour, version`,
          [
            memberId,
            input.dueEnabled ?? null,
            input.dueDaysBefore ?? null,
            input.dueHour ?? null,
            input.statementEnabled ?? null,
            input.approvalEnabled ?? null,
            input.dailySummaryEnabled ?? null,
            input.dailySummaryHour ?? null,
          ],
        );
        const row = updated.rows[0];
        if (!row) throw new DomainError('NOT_FOUND');
        return toPreferences(row);
      });
    },
  };
}
