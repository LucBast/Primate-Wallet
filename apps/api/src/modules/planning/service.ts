/**
 * Planejamento: contas a pagar e a receber, parcelamentos, recorrências e
 * anexos (docs/05 §4.3, §4.4, §4.8; telas 1d e 1e).
 *
 * Regras que este serviço garante:
 *  - "Vencido" é DERIVADO com o fuso da família a cada leitura (docs/04 §5).
 *  - Parcelamento usa `splitInstallments` do domínio: a soma das parcelas é
 *    exatamente o total, com os centavos na última (docs/04 §10).
 *  - Recorrência usa `generateOccurrences` do domínio — o mesmo código da
 *    prévia mostrada no app.
 *  - Criação é idempotente por `idempotencyKey`.
 */

import { randomUUID } from 'node:crypto';
import {
  DomainError,
  familyToday,
  generateOccurrences,
  isoDate,
  minor,
  settledPercentage,
  splitInstallments,
  type IsoDate,
} from '@ff/domain';
import type {
  Attachment,
  AttachmentUploadTicket,
  CancelPlannedEntryRequest,
  CreateAttachmentRequest,
  CreatePlannedEntryRequest,
  PlannedEntry,
  PlanningList,
  UpdatePlannedEntryRequest,
} from '@ff/api-contracts';
import { withUserTransaction, type Database, type PoolClient } from '../../db/pool.js';
import { insertAuditLog } from '../auth/repository.js';
import type { RequestContext } from '../auth/service.js';

type EntryRow = {
  id: string;
  household_id: string;
  nature: PlannedEntry['nature'];
  description: string;
  original_amount_minor: number;
  outstanding_minor: number;
  settled_minor: number;
  competence_date: Date;
  due_date: Date;
  expected_account_id: string | null;
  expected_account_name: string | null;
  member_id: string;
  member_name: string | null;
  category_id: string | null;
  category_name: string | null;
  counterparty_name: string | null;
  status: PlannedEntry['status'];
  recurrence_rule_id: string | null;
  installment_group_id: string | null;
  installment_number: number | null;
  installment_total: number | null;
  notes: string | null;
  reminder_days_before: number | null;
  attachment_count: string | number;
  last_settlement_date: Date | null;
  last_settlement_account_name: string | null;
  version: number;
};

const ENTRY_SELECT = `
  e.id, e.household_id, e.nature, e.description, e.original_amount_minor,
  app.planned_entry_outstanding(e.id) AS outstanding_minor,
  (e.original_amount_minor - app.planned_entry_outstanding(e.id)) AS settled_minor,
  e.competence_date, e.due_date, e.expected_account_id, a.name AS expected_account_name,
  e.member_id, m.display_name AS member_name, e.category_id, c.name AS category_name,
  cp.name AS counterparty_name, app.planned_entry_status(e.id) AS status,
  e.recurrence_rule_id, e.installment_group_id, e.installment_number, e.installment_total,
  e.notes, e.reminder_days_before,
  (SELECT count(*) FROM attachments att
    WHERE att.entity_type = 'planned_entry' AND att.entity_id = e.id AND att.deleted_at IS NULL)
    AS attachment_count,
  ls.settled_at AS last_settlement_date, ls.account_name AS last_settlement_account_name,
  e.version
`;

const ENTRY_FROM = `
  FROM planned_entries e
  LEFT JOIN accounts a ON a.id = e.expected_account_id
  LEFT JOIN household_members m ON m.id = e.member_id
  LEFT JOIN categories c ON c.id = e.category_id
  LEFT JOIN counterparties cp ON cp.id = e.counterparty_id
  -- Baixa estornada não conta: some da linha de status junto com o valor.
  LEFT JOIN LATERAL (
    SELECT s.settled_at, sa.name AS account_name
      FROM settlements s
      LEFT JOIN accounts sa ON sa.id = s.account_id
     WHERE s.planned_entry_id = e.id AND s.reversed_at IS NULL
     ORDER BY s.settled_at DESC, s.created_at DESC
     LIMIT 1
  ) ls ON true
`;

function toEntry(row: EntryRow, today: IsoDate): PlannedEntry {
  const dueDate = row.due_date.toISOString().slice(0, 10);
  const outstanding = Number(row.outstanding_minor);
  // Vencido é derivado: due_date < hoje(fuso da família) AND saldo > 0 AND não cancelado.
  const overdue = row.status !== 'CANCELED' && outstanding > 0 && dueDate < today;
  const overdueDays = overdue
    ? (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${dueDate}T00:00:00Z`)) / 86_400_000
    : 0;
  const settled = Number(row.settled_minor);
  // `settled_minor` já é original − saldo em aberto, ou seja, juros, multa e
  // desconto entram nele: a regra de arredondamento é a do domínio, uma só.
  const settledPercent = settledPercentage({
    originalAmountMinor: minor(row.original_amount_minor),
    settledMinor: minor(settled),
  });

  return {
    id: row.id,
    householdId: row.household_id,
    nature: row.nature,
    description: row.description,
    originalAmountMinor: row.original_amount_minor,
    outstandingMinor: outstanding,
    settledMinor: settled,
    competenceDate: row.competence_date.toISOString().slice(0, 10),
    dueDate,
    expectedAccountId: row.expected_account_id,
    expectedAccountName: row.expected_account_name,
    memberId: row.member_id,
    memberName: row.member_name,
    categoryId: row.category_id,
    categoryName: row.category_name,
    counterpartyName: row.counterparty_name,
    status: row.status,
    overdue,
    overdueDays,
    settledPercent,
    recurrenceRuleId: row.recurrence_rule_id,
    installmentGroupId: row.installment_group_id,
    installmentNumber: row.installment_number,
    installmentTotal: row.installment_total,
    notes: row.notes,
    reminderDaysBefore: row.reminder_days_before,
    attachmentCount: Number(row.attachment_count),
    lastSettlementDate:
      row.last_settlement_date === null
        ? null
        : row.last_settlement_date.toISOString().slice(0, 10),
    lastSettlementAccountName: row.last_settlement_account_name,
    version: row.version,
  };
}

async function householdContext(
  client: PoolClient,
  householdId: string,
  userId: string,
): Promise<{ role: string; memberId: string; timezone: string }> {
  const result = await client.query<{ role: string; member_id: string; timezone: string }>(
    `SELECT m.role, m.id AS member_id, h.timezone
       FROM household_members m
       JOIN households h ON h.id = m.household_id
      WHERE m.household_id = $1 AND m.user_id = $2 AND m.status = 'ACTIVE'`,
    [householdId, userId],
  );
  const row = result.rows[0];
  if (!row) throw new DomainError('HOUSEHOLD_NOT_FOUND');
  return { role: row.role, memberId: row.member_id, timezone: row.timezone };
}

const OPERATORS = ['OWNER', 'ADMIN', 'ADULT'];

export type PlanningService = ReturnType<typeof createPlanningService>;

export function createPlanningService(deps: { readonly db: Database }) {
  const { db } = deps;

  return {
    /** Lista do mês, já com o resumo dos três mini-cards da tela 1d. */
    async list(
      userId: string,
      householdId: string,
      filters: {
        nature: PlannedEntry['nature'];
        from: string;
        to: string;
        includeSettled: boolean;
      },
    ): Promise<PlanningList> {
      return withUserTransaction(
        db,
        userId,
        async (client) => {
          const { timezone } = await householdContext(client, householdId, userId);
          const today = familyToday(timezone);

          const result = await client.query<EntryRow>(
            `SELECT ${ENTRY_SELECT} ${ENTRY_FROM}
              WHERE e.household_id = $1
                AND e.nature = $2
                AND e.due_date >= $3::date
                AND e.due_date <= $4::date
              ORDER BY e.due_date, e.created_at`,
            [householdId, filters.nature, filters.from, filters.to],
          );

          // Vencidas de meses anteriores continuam aparecendo: uma conta em
          // atraso não pode sumir quando o mês vira.
          const overdue = await client.query<EntryRow>(
            `SELECT ${ENTRY_SELECT} ${ENTRY_FROM}
              WHERE e.household_id = $1
                AND e.nature = $2
                AND e.due_date < $3::date
                AND e.canceled_at IS NULL
                AND app.planned_entry_outstanding(e.id) > 0
              ORDER BY e.due_date`,
            [householdId, filters.nature, filters.from],
          );

          const all = [...overdue.rows, ...result.rows].map((row) => toEntry(row, today));
          const items = filters.includeSettled
            ? all
            : all.filter((entry) => entry.status !== 'SETTLED' && entry.status !== 'CANCELED');

          const active = all.filter((entry) => entry.status !== 'CANCELED');
          const summary = {
            plannedMinor: active.reduce((sum, entry) => sum + entry.originalAmountMinor, 0),
            settledMinor: active.reduce((sum, entry) => sum + entry.settledMinor, 0),
            outstandingMinor: active.reduce(
              (sum, entry) => sum + Math.max(0, entry.outstandingMinor),
              0,
            ),
            overdueCount: active.filter((entry) => entry.overdue).length,
            overdueMinor: active
              .filter((entry) => entry.overdue)
              .reduce((sum, entry) => sum + entry.outstandingMinor, 0),
          };

          return { items, summary };
        },
        { readOnly: true },
      );
    },

    async get(userId: string, householdId: string, entryId: string): Promise<PlannedEntry> {
      return withUserTransaction(
        db,
        userId,
        async (client) => {
          const { timezone } = await householdContext(client, householdId, userId);
          const result = await client.query<EntryRow>(
            `SELECT ${ENTRY_SELECT} ${ENTRY_FROM} WHERE e.id = $1 AND e.household_id = $2`,
            [entryId, householdId],
          );
          const row = result.rows[0];
          if (!row) throw new DomainError('NOT_FOUND');
          return toEntry(row, familyToday(timezone));
        },
        { readOnly: true },
      );
    },

    /**
     * Cria a conta prevista. Com `installments`, cria a série inteira, com os
     * centavos na última parcela. Com `recurrence`, cria a regra e as
     * ocorrências já conhecidas.
     */
    async create(
      userId: string,
      householdId: string,
      input: CreatePlannedEntryRequest,
      ctx: RequestContext,
    ): Promise<PlannedEntry[]> {
      return withUserTransaction(db, userId, async (client) => {
        const { timezone } = await householdContext(client, householdId, userId);

        let counterpartyId: string | null = null;
        if (input.counterpartyName !== undefined) {
          const counterparty = await client.query<{ id: string }>(
            `INSERT INTO counterparties (household_id, name) VALUES ($1, $2)
             ON CONFLICT (household_id, lower(name)) DO UPDATE SET name = EXCLUDED.name
             RETURNING id`,
            [householdId, input.counterpartyName],
          );
          counterpartyId = counterparty.rows[0]?.id ?? null;
        }

        const created: string[] = [];

        const insertOne = async (params: {
          amountMinor: number;
          competenceDate: string;
          dueDate: string;
          idempotencyKey: string;
          installmentGroupId?: string | null;
          installmentNumber?: number | null;
          installmentTotal?: number | null;
          recurrenceRuleId?: string | null;
        }): Promise<void> => {
          const id = randomUUID();
          try {
            await client.query(
              `INSERT INTO planned_entries (
                 id, household_id, nature, description, original_amount_minor, competence_date,
                 due_date, expected_account_id, member_id, category_id, counterparty_id, notes,
                 reminder_days_before, installment_group_id, installment_number, installment_total,
                 recurrence_rule_id, idempotency_key, created_by
               ) VALUES (
                 $1, $2, $3, $4, $5, $6::date, $7::date, $8, $9, $10, $11, $12, $13, $14, $15, $16,
                 $17, $18, $19
               )`,
              [
                id,
                householdId,
                input.nature,
                input.description,
                params.amountMinor,
                params.competenceDate,
                params.dueDate,
                input.expectedAccountId ?? null,
                input.memberId,
                input.categoryId ?? null,
                counterpartyId,
                input.notes ?? null,
                input.reminderDaysBefore ?? null,
                params.installmentGroupId ?? null,
                params.installmentNumber ?? null,
                params.installmentTotal ?? null,
                params.recurrenceRuleId ?? null,
                params.idempotencyKey,
                userId,
              ],
            );
          } catch (error) {
            if ((error as { code?: string }).code === '23505') {
              throw new DomainError('DUPLICATE_IDEMPOTENCY_KEY');
            }
            throw error;
          }
          created.push(id);
        };

        if (input.installments !== undefined) {
          // Parcelamento: soma exata, centavos na última parcela.
          const parts = splitInstallments(minor(input.originalAmountMinor), input.installments);
          const groupResult = await client.query<{ id: string }>(
            `INSERT INTO installment_groups
               (household_id, description, total_amount_minor, installment_count, account_id,
                purchase_date, created_by)
             VALUES ($1, $2, $3, $4, $5, $6::date, $7) RETURNING id`,
            [
              householdId,
              input.description,
              input.originalAmountMinor,
              input.installments,
              input.expectedAccountId ?? null,
              input.competenceDate,
              userId,
            ],
          );
          const groupId = groupResult.rows[0]?.id ?? null;

          for (const [index, amount] of parts.entries()) {
            const { addMonths } = await import('@ff/domain');
            await insertOne({
              amountMinor: amount,
              competenceDate: addMonths(isoDate(input.competenceDate), index),
              dueDate: addMonths(isoDate(input.dueDate), index),
              idempotencyKey: `${input.idempotencyKey}:${index + 1}`,
              installmentGroupId: groupId,
              installmentNumber: index + 1,
              installmentTotal: input.installments,
            });
          }
        } else if (input.recurrence !== undefined) {
          const rule = input.recurrence;
          const occurrences = generateOccurrences(
            {
              frequency: rule.frequency,
              interval: rule.interval,
              startDate: isoDate(input.dueDate),
              ...(rule.endDate === undefined ? {} : { endDate: isoDate(rule.endDate) }),
              ...(rule.maxOccurrences === undefined ? {} : { maxOccurrences: rule.maxOccurrences }),
              ...(rule.dayOfMonth === undefined ? {} : { dayOfMonth: rule.dayOfMonth }),
              ...(rule.daysOfWeek === undefined ? {} : { daysOfWeek: rule.daysOfWeek }),
            },
            // Geramos um horizonte de 12 ocorrências; o job estende depois.
            Math.min(rule.maxOccurrences ?? 12, 12),
          );

          const ruleResult = await client.query<{ id: string }>(
            `INSERT INTO recurrence_rules (
               household_id, frequency, interval_count, start_date, end_date, max_occurrences,
               day_of_month, days_of_week, next_generation_date, template_payload, created_by
             ) VALUES ($1, $2, $3, $4::date, $5::date, $6, $7, $8, $9::date, $10, $11)
             RETURNING id`,
            [
              householdId,
              rule.frequency,
              rule.interval,
              input.dueDate,
              rule.endDate ?? null,
              rule.maxOccurrences ?? null,
              rule.dayOfMonth ?? null,
              rule.daysOfWeek ?? null,
              occurrences[occurrences.length - 1] ?? input.dueDate,
              JSON.stringify({
                nature: input.nature,
                description: input.description,
                originalAmountMinor: input.originalAmountMinor,
                memberId: input.memberId,
                categoryId: input.categoryId ?? null,
                expectedAccountId: input.expectedAccountId ?? null,
              }),
              userId,
            ],
          );
          const ruleId = ruleResult.rows[0]?.id ?? null;

          const competenceOffset =
            Date.parse(`${input.dueDate}T00:00:00Z`) -
            Date.parse(`${input.competenceDate}T00:00:00Z`);

          for (const [index, due] of occurrences.entries()) {
            const competence = new Date(Date.parse(`${due}T00:00:00Z`) - competenceOffset)
              .toISOString()
              .slice(0, 10);
            await insertOne({
              amountMinor: input.originalAmountMinor,
              competenceDate: competence,
              dueDate: due,
              idempotencyKey: `${input.idempotencyKey}:r${index + 1}`,
              recurrenceRuleId: ruleId,
            });
          }
        } else {
          await insertOne({
            amountMinor: input.originalAmountMinor,
            competenceDate: input.competenceDate,
            dueDate: input.dueDate,
            idempotencyKey: input.idempotencyKey,
          });
        }

        await insertAuditLog(client, {
          householdId,
          actorUserId: userId,
          entityType: 'planned_entry',
          entityId: created[0] ?? null,
          action: 'PLANNED_ENTRY_CREATED',
          afterData: {
            description: input.description,
            amountMinor: input.originalAmountMinor,
            count: created.length,
          },
          requestId: ctx.requestId,
        });

        const rows = await client.query<EntryRow>(
          `SELECT ${ENTRY_SELECT} ${ENTRY_FROM} WHERE e.id = ANY($1::uuid[]) ORDER BY e.due_date`,
          [created],
        );
        const today = familyToday(timezone);
        return rows.rows.map((row) => toEntry(row, today));
      });
    },

    async update(
      userId: string,
      householdId: string,
      entryId: string,
      input: UpdatePlannedEntryRequest,
      ctx: RequestContext,
    ): Promise<PlannedEntry> {
      return withUserTransaction(db, userId, async (client) => {
        const { role, timezone } = await householdContext(client, householdId, userId);
        if (!OPERATORS.includes(role)) throw new DomainError('INSUFFICIENT_PERMISSION');

        const current = await client.query<{ version: number; canceled_at: Date | null }>(
          'SELECT version, canceled_at FROM planned_entries WHERE id = $1 AND household_id = $2 FOR UPDATE',
          [entryId, householdId],
        );
        const before = current.rows[0];
        if (!before) throw new DomainError('NOT_FOUND');
        if (before.canceled_at !== null) throw new DomainError('ALREADY_SETTLED');
        if (before.version !== input.expectedVersion) {
          throw new DomainError('VERSION_CONFLICT', { currentVersion: before.version });
        }

        await client.query(
          `UPDATE planned_entries SET
             description = COALESCE($3::text, description),
             original_amount_minor = COALESCE($4::bigint, original_amount_minor),
             competence_date = COALESCE($5::date, competence_date),
             due_date = COALESCE($6::date, due_date),
             expected_account_id = CASE WHEN $7::boolean THEN $8::uuid ELSE expected_account_id END,
             category_id = CASE WHEN $9::boolean THEN $10::uuid ELSE category_id END,
             member_id = COALESCE($11::uuid, member_id),
             notes = CASE WHEN $12::boolean THEN $13::text ELSE notes END,
             reminder_days_before =
               CASE WHEN $14::boolean THEN $15::integer ELSE reminder_days_before END,
             version = version + 1
           WHERE id = $1 AND household_id = $2`,
          [
            entryId,
            householdId,
            input.description ?? null,
            input.originalAmountMinor ?? null,
            input.competenceDate ?? null,
            input.dueDate ?? null,
            input.expectedAccountId !== undefined,
            input.expectedAccountId ?? null,
            input.categoryId !== undefined,
            input.categoryId ?? null,
            input.memberId ?? null,
            input.notes !== undefined,
            input.notes ?? null,
            input.reminderDaysBefore !== undefined,
            input.reminderDaysBefore ?? null,
          ],
        );

        await insertAuditLog(client, {
          householdId,
          actorUserId: userId,
          entityType: 'planned_entry',
          entityId: entryId,
          action: 'PLANNED_ENTRY_UPDATED',
          requestId: ctx.requestId,
        });

        const rows = await client.query<EntryRow>(
          `SELECT ${ENTRY_SELECT} ${ENTRY_FROM} WHERE e.id = $1`,
          [entryId],
        );
        /* c8 ignore next */
        if (!rows.rows[0]) throw new DomainError('NOT_FOUND');
        return toEntry(rows.rows[0], familyToday(timezone));
      });
    },

    /** Cancelar não apaga: preserva o registro e o histórico de baixas. */
    async cancel(
      userId: string,
      householdId: string,
      entryId: string,
      input: CancelPlannedEntryRequest,
      ctx: RequestContext,
    ): Promise<PlannedEntry> {
      return withUserTransaction(db, userId, async (client) => {
        const { role, timezone } = await householdContext(client, householdId, userId);
        if (!OPERATORS.includes(role)) throw new DomainError('INSUFFICIENT_PERMISSION');

        const current = await client.query<{ version: number; canceled_at: Date | null }>(
          'SELECT version, canceled_at FROM planned_entries WHERE id = $1 AND household_id = $2 FOR UPDATE',
          [entryId, householdId],
        );
        const before = current.rows[0];
        if (!before) throw new DomainError('NOT_FOUND');
        if (before.canceled_at !== null) throw new DomainError('ALREADY_SETTLED');
        if (before.version !== input.expectedVersion) {
          throw new DomainError('VERSION_CONFLICT', { currentVersion: before.version });
        }

        const settled = await client.query<{ outstanding: string }>(
          'SELECT app.planned_entry_outstanding($1) AS outstanding',
          [entryId],
        );
        const outstanding = Number(settled.rows[0]?.outstanding ?? 0);
        const original = await client.query<{ original_amount_minor: string }>(
          'SELECT original_amount_minor FROM planned_entries WHERE id = $1',
          [entryId],
        );
        // Com baixa registrada, cancelar reescreveria história: exige estorno.
        if (outstanding !== Number(original.rows[0]?.original_amount_minor ?? 0)) {
          throw new DomainError(
            'ALREADY_SETTLED',
            undefined,
            'Esta conta já tem baixa registrada. Estorne a baixa antes de cancelar.',
          );
        }

        await client.query(
          `UPDATE planned_entries
              SET status = 'CANCELED', canceled_at = now(), cancel_reason = $3, version = version + 1
            WHERE id = $1 AND household_id = $2`,
          [entryId, householdId, input.reason],
        );

        await insertAuditLog(client, {
          householdId,
          actorUserId: userId,
          entityType: 'planned_entry',
          entityId: entryId,
          action: 'PLANNED_ENTRY_CANCELED',
          metadata: { reason: input.reason },
          requestId: ctx.requestId,
        });

        const rows = await client.query<EntryRow>(
          `SELECT ${ENTRY_SELECT} ${ENTRY_FROM} WHERE e.id = $1`,
          [entryId],
        );
        /* c8 ignore next */
        if (!rows.rows[0]) throw new DomainError('NOT_FOUND');
        return toEntry(rows.rows[0], familyToday(timezone));
      });
    },

    // ------------------------------------------------------------- anexos

    /**
     * Registra o anexo e devolve o caminho de upload. O arquivo em si vai para
     * bucket privado; enquanto o provedor de storage não está configurado, o
     * `uploadUrl` aponta para a própria API (ver PROGRESS §Bloqueios).
     */
    async createAttachment(
      userId: string,
      householdId: string,
      input: CreateAttachmentRequest,
      ctx: RequestContext,
    ): Promise<AttachmentUploadTicket> {
      return withUserTransaction(db, userId, async (client) => {
        await householdContext(client, householdId, userId);

        const attachmentId = randomUUID();
        // Caminho sempre escopado pelo household (docs/10 §7).
        const storagePath = `${householdId}/${input.entityType}/${input.entityId}/${attachmentId}`;

        const result = await client.query<{
          id: string;
          entity_type: Attachment['entityType'];
          entity_id: string;
          file_name: string;
          mime_type: string;
          size_bytes: string;
          created_at: Date;
        }>(
          `INSERT INTO attachments
             (id, household_id, entity_type, entity_id, storage_path, file_name, mime_type,
              size_bytes, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           RETURNING id, entity_type, entity_id, file_name, mime_type, size_bytes, created_at`,
          [
            attachmentId,
            householdId,
            input.entityType,
            input.entityId,
            storagePath,
            input.fileName,
            input.mimeType,
            input.sizeBytes,
            userId,
          ],
        );
        const row = result.rows[0];
        /* c8 ignore next */
        if (!row) throw new DomainError('INTERNAL_ERROR');

        await insertAuditLog(client, {
          householdId,
          actorUserId: userId,
          entityType: 'attachment',
          entityId: attachmentId,
          action: 'ATTACHMENT_CREATED',
          afterData: { fileName: input.fileName, entityType: input.entityType },
          requestId: ctx.requestId,
        });

        return {
          attachment: {
            id: row.id,
            entityType: row.entity_type,
            entityId: row.entity_id,
            fileName: row.file_name,
            mimeType: row.mime_type,
            sizeBytes: Number(row.size_bytes),
            createdAt: row.created_at.toISOString(),
            downloadUrl: null,
          },
          uploadUrl: `/households/${householdId}/attachments/${attachmentId}/content`,
          storagePath,
          expiresInSeconds: 300,
        };
      });
    },

    async listAttachments(
      userId: string,
      householdId: string,
      entityType: string,
      entityId: string,
    ): Promise<Attachment[]> {
      return withUserTransaction(
        db,
        userId,
        async (client) => {
          await householdContext(client, householdId, userId);
          const result = await client.query<{
            id: string;
            entity_type: Attachment['entityType'];
            entity_id: string;
            file_name: string;
            mime_type: string;
            size_bytes: string;
            created_at: Date;
          }>(
            `SELECT id, entity_type, entity_id, file_name, mime_type, size_bytes, created_at
               FROM attachments
              WHERE household_id = $1 AND entity_type = $2 AND entity_id = $3
                AND deleted_at IS NULL
              ORDER BY created_at`,
            [householdId, entityType, entityId],
          );
          return result.rows.map((row) => ({
            id: row.id,
            entityType: row.entity_type,
            entityId: row.entity_id,
            fileName: row.file_name,
            mimeType: row.mime_type,
            sizeBytes: Number(row.size_bytes),
            createdAt: row.created_at.toISOString(),
            downloadUrl: null,
          }));
        },
        { readOnly: true },
      );
    },
  };
}
