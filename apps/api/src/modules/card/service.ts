/**
 * Cartão de crédito: compras, parcelas, faturas e pagamento (docs/04 §10).
 *
 * Regras que este serviço garante:
 *  - Compra no cartão é DESPESA POR COMPETÊNCIA e consome limite, mas não
 *    diminui a conta bancária.
 *  - Compra parcelada cria um grupo; a soma das parcelas é exatamente o valor
 *    original, com os centavos na última; cada parcela cai no ciclo/fatura certo.
 *  - Pagamento de fatura NÃO cria despesa: é uma transação CARD_PAYMENT que sai
 *    da conta bancária e abate a dívida do cartão.
 *  - Pagar fatura já paga devolve STATEMENT_ALREADY_PAID.
 *  - Estorno do pagamento reabre a fatura.
 */

import { randomUUID } from 'node:crypto';
import {
  cyclesForInstallments,
  DomainError,
  familyToday,
  isoDate,
  minor,
  splitInstallments,
} from '@ff/domain';
import type {
  CardStatement,
  CreateCardPurchaseRequest,
  CreateCardPurchaseResponse,
  CreateCardRefundRequest,
  PayCardStatementRequest,
  ReverseCardPaymentRequest,
} from '@ff/api-contracts';
import { withUserTransaction, type Database, type PoolClient } from '../../db/pool.js';
import { insertAuditLog } from '../auth/repository.js';
import { ensureStatement } from './statement.js';
import type { RequestContext } from '../auth/service.js';

const OPERATORS = ['OWNER', 'ADMIN', 'ADULT'];

type CardRow = {
  id: string;
  name: string;
  card_last_four: string | null;
  credit_limit_minor: string | null;
  closing_day: number | null;
  due_day: number | null;
  archived_at: Date | null;
};

async function context(
  client: PoolClient,
  householdId: string,
  userId: string,
): Promise<{ role: string; timezone: string }> {
  const result = await client.query<{ role: string; timezone: string }>(
    `SELECT m.role, h.timezone
       FROM household_members m
       JOIN households h ON h.id = m.household_id
      WHERE m.household_id = $1 AND m.user_id = $2 AND m.status = 'ACTIVE'`,
    [householdId, userId],
  );
  const row = result.rows[0];
  if (!row) throw new DomainError('HOUSEHOLD_NOT_FOUND');
  return { role: row.role, timezone: row.timezone };
}

async function loadCard(
  client: PoolClient,
  householdId: string,
  accountId: string,
): Promise<CardRow> {
  const result = await client.query<CardRow>(
    `SELECT id, name, card_last_four, credit_limit_minor, closing_day, due_day, archived_at
       FROM accounts
      WHERE id = $1 AND household_id = $2 AND account_type = 'CREDIT_CARD'`,
    [accountId, householdId],
  );
  const row = result.rows[0];
  if (!row) throw new DomainError('INVALID_ACCOUNT_TYPE', undefined, 'Esta conta não é um cartão.');
  if (row.archived_at !== null) throw new DomainError('ACCOUNT_ARCHIVED');
  return row;
}

/** Garante que existe a fatura do ciclo e devolve seu id. */
// `ensureStatement` mora em ./statement.js: os três caminhos que criam compra no
// cartão precisam dela, não só este.

export type CardService = ReturnType<typeof createCardService>;

export function createCardService(deps: { readonly db: Database }) {
  const { db } = deps;

  async function readStatement(
    client: PoolClient,
    householdId: string,
    statementId: string,
    timezone: string,
  ): Promise<CardStatement> {
    const result = await client.query<{
      id: string;
      household_id: string;
      account_id: string;
      account_name: string;
      card_last_four: string | null;
      credit_limit_minor: string | null;
      cycle_start_date: Date;
      cycle_end_date: Date;
      closing_date: Date;
      due_date: Date;
      status: CardStatement['status'];
      total_minor: string;
      paid_minor: string;
      used_limit_minor: string;
      available_limit_minor: string | null;
      version: number;
    }>(
      `SELECT s.id, s.household_id, s.account_id, a.name AS account_name, a.card_last_four,
              a.credit_limit_minor, s.cycle_start_date, s.cycle_end_date, s.closing_date,
              s.due_date, app.card_statement_status(s.id) AS status,
              app.card_statement_total(s.id) AS total_minor,
              app.card_statement_paid(s.id) AS paid_minor,
              app.account_balance(a.id) AS used_limit_minor,
              app.card_available_limit(a.id) AS available_limit_minor,
              s.version
         FROM card_statements s
         JOIN accounts a ON a.id = s.account_id
        WHERE s.id = $1 AND s.household_id = $2`,
      [statementId, householdId],
    );
    const row = result.rows[0];
    if (!row) throw new DomainError('NOT_FOUND');

    const items = await client.query<{
      id: string;
      transaction_id: string;
      description: string;
      amount_minor: string;
      occurred_at: Date;
      member_name: string | null;
      category_name: string | null;
      transaction_type: string;
      status: string;
      installment_number: number | null;
      installment_total: number | null;
    }>(
      `SELECT i.id, i.transaction_id, t.description, i.amount_minor, t.occurred_at,
              m.display_name AS member_name, c.name AS category_name, t.transaction_type,
              t.status,
              (SELECT pe.installment_number FROM planned_entries pe
                WHERE pe.installment_group_id IS NOT NULL AND pe.id = NULL) AS installment_number,
              NULL::integer AS installment_total
         FROM card_statement_items i
         JOIN transactions t ON t.id = i.transaction_id
         LEFT JOIN household_members m ON m.id = t.member_id
         LEFT JOIN categories c ON c.id = t.category_id
        WHERE i.card_statement_id = $1
        ORDER BY t.occurred_at, t.created_at`,
      [statementId],
    );

    const payments = await client.query<{
      id: string;
      transaction_id: string;
      amount_minor: string;
      paid_at: Date;
      account_name: string | null;
      created_by_name: string | null;
      reversed_at: Date | null;
    }>(
      `SELECT p.id, p.transaction_id, p.amount_minor, p.paid_at, a.name AS account_name,
              pr.name AS created_by_name, p.reversed_at
         FROM card_statement_payments p
         JOIN transactions t ON t.id = p.transaction_id
         LEFT JOIN accounts a ON a.id = t.account_id
         LEFT JOIN profiles pr ON pr.id = p.created_by
        WHERE p.card_statement_id = $1
        ORDER BY p.paid_at DESC`,
      [statementId],
    );

    const total = Number(row.total_minor);
    const paid = Number(row.paid_minor);
    const today = familyToday(timezone);
    const dueDate = row.due_date.toISOString().slice(0, 10);

    return {
      id: row.id,
      householdId: row.household_id,
      accountId: row.account_id,
      accountName: row.account_name,
      cardLastFour: row.card_last_four,
      cycleStartDate: row.cycle_start_date.toISOString().slice(0, 10),
      cycleEndDate: row.cycle_end_date.toISOString().slice(0, 10),
      closingDate: row.closing_date.toISOString().slice(0, 10),
      dueDate,
      status: row.status,
      // Vencida é derivada, como em toda data do sistema.
      overdue: row.status !== 'PAID' && total > paid && dueDate < today,
      totalMinor: total,
      paidMinor: paid,
      outstandingMinor: Math.max(0, total - paid),
      paidPercent: total <= 0 ? 100 : Math.floor((paid * 100) / total),
      creditLimitMinor: row.credit_limit_minor === null ? null : Number(row.credit_limit_minor),
      usedLimitMinor: Number(row.used_limit_minor),
      availableLimitMinor:
        row.available_limit_minor === null ? null : Number(row.available_limit_minor),
      items: items.rows.map((item) => ({
        id: item.id,
        transactionId: item.transaction_id,
        description: item.description,
        amountMinor: Number(item.amount_minor),
        occurredAt: item.occurred_at.toISOString(),
        memberName: item.member_name,
        categoryName: item.category_name,
        transactionType: item.transaction_type,
        status: item.status,
        installmentNumber: item.installment_number,
        installmentTotal: item.installment_total,
      })),
      payments: payments.rows.map((payment) => ({
        id: payment.id,
        transactionId: payment.transaction_id,
        amountMinor: Number(payment.amount_minor),
        paidAt: payment.paid_at.toISOString().slice(0, 10),
        accountName: payment.account_name,
        createdByName: payment.created_by_name,
        reversedAt: payment.reversed_at?.toISOString() ?? null,
      })),
      version: row.version,
    };
  }

  return {
    /** Compra no cartão, à vista ou parcelada. */
    async createPurchase(
      userId: string,
      householdId: string,
      input: CreateCardPurchaseRequest,
      ctx: RequestContext,
    ): Promise<CreateCardPurchaseResponse> {
      return withUserTransaction(
        db,
        userId,
        async (client) => {
          const { role } = await context(client, householdId, userId);
          if (!OPERATORS.includes(role)) throw new DomainError('INSUFFICIENT_PERMISSION');

          const card = await loadCard(client, householdId, input.accountId);
          if (card.closing_day === null || card.due_day === null) {
            throw new DomainError('INVALID_ACCOUNT_TYPE');
          }

          const existing = await client.query<{ id: string }>(
            `SELECT id FROM transactions
              WHERE household_id = $1 AND idempotency_key LIKE $2 || '%'`,
            [householdId, input.idempotencyKey],
          );
          if (existing.rows.length > 0) throw new DomainError('DUPLICATE_IDEMPOTENCY_KEY');

          // Parcelas: soma exata, centavos na última (docs/04 §10).
          const parts = splitInstallments(minor(input.amountMinor), input.installments);
          const cycles = cyclesForInstallments(
            isoDate(input.purchaseDate),
            card.closing_day,
            card.due_day,
            input.installments,
          );

          let groupId: string | null = null;
          if (input.installments > 1) {
            const group = await client.query<{ id: string }>(
              `INSERT INTO installment_groups
                 (household_id, description, total_amount_minor, installment_count, account_id,
                  purchase_date, created_by)
               VALUES ($1, $2, $3, $4, $5, $6::date, $7) RETURNING id`,
              [
                householdId,
                input.description,
                input.amountMinor,
                input.installments,
                input.accountId,
                input.purchaseDate,
                userId,
              ],
            );
            groupId = group.rows[0]?.id ?? null;
          }

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

          const transactionIds: string[] = [];
          for (const [index, amount] of parts.entries()) {
            const cycle = cycles[index];
            /* c8 ignore next */
            if (!cycle) throw new DomainError('INTERNAL_ERROR');

            const label =
              input.installments > 1
                ? `${input.description} · parcela ${String(index + 1).padStart(2, '0')}/${String(input.installments).padStart(2, '0')}`
                : input.description;

            const transactionId = randomUUID();
            await client.query(
              `INSERT INTO transactions (
                 id, household_id, transaction_type, description, amount_minor, occurred_at,
                 competence_date, account_id, member_id, category_id, counterparty_id, source,
                 status, notes, idempotency_key, created_by
               ) VALUES (
                 $1, $2, 'CARD_PURCHASE', $3, $4, $5::date::timestamptz, $6::date, $7, $8, $9,
                 $10, 'MANUAL', 'POSTED', $11, $12, $13
               )`,
              [
                transactionId,
                householdId,
                label,
                amount,
                input.purchaseDate,
                // Competência da parcela é o fechamento do ciclo em que ela cai.
                cycle.closingDate,
                input.accountId,
                input.memberId,
                input.categoryId ?? null,
                counterpartyId,
                input.notes ?? null,
                `${input.idempotencyKey}:${index + 1}`,
                userId,
              ],
            );
            transactionIds.push(transactionId);

            const statementId = await ensureStatement(client, householdId, input.accountId, cycle);
            await client.query(
              `INSERT INTO card_statement_items
                 (household_id, card_statement_id, transaction_id, amount_minor)
               VALUES ($1, $2, $3, $4)`,
              [householdId, statementId, transactionId, amount],
            );

            if (groupId !== null) {
              await client.query(
                `UPDATE transactions SET notes = COALESCE(notes, '') WHERE id = $1`,
                [transactionId],
              );
            }
          }

          await insertAuditLog(client, {
            householdId,
            actorUserId: userId,
            entityType: 'transaction',
            entityId: transactionIds[0] ?? null,
            action: 'CARD_PURCHASE_CREATED',
            afterData: {
              amountMinor: input.amountMinor,
              installments: input.installments,
              description: input.description,
            },
            requestId: ctx.requestId,
          });

          const limit = await client.query<{ available: string | null }>(
            'SELECT app.card_available_limit($1) AS available',
            [input.accountId],
          );

          return {
            transactionIds,
            installments: parts.map((amount, index) => ({
              installmentNumber: index + 1,
              amountMinor: amount,
              closingDate: cycles[index]?.closingDate ?? input.purchaseDate,
              dueDate: cycles[index]?.dueDate ?? input.purchaseDate,
              // A última parcela é a que carrega a diferença de centavos.
              carriesRounding: index === parts.length - 1 && parts.length > 1,
            })),
            totalMinor: input.amountMinor,
            availableLimitAfterMinor:
              limit.rows[0]?.available === null || limit.rows[0]?.available === undefined
                ? null
                : Number(limit.rows[0].available),
          };
        },
        { isolation: 'SERIALIZABLE' },
      );
    },

    /** Reembolso do lojista: abate a dívida do cartão. */
    async createRefund(
      userId: string,
      householdId: string,
      input: CreateCardRefundRequest,
      ctx: RequestContext,
    ): Promise<{ transactionId: string }> {
      return withUserTransaction(db, userId, async (client) => {
        const { role } = await context(client, householdId, userId);
        if (!OPERATORS.includes(role)) throw new DomainError('INSUFFICIENT_PERMISSION');

        const card = await loadCard(client, householdId, input.accountId);
        if (card.closing_day === null || card.due_day === null) {
          throw new DomainError('INVALID_ACCOUNT_TYPE');
        }

        const transactionId = randomUUID();
        try {
          await client.query(
            `INSERT INTO transactions (
               id, household_id, transaction_type, description, amount_minor, occurred_at,
               competence_date, account_id, member_id, category_id, source, status,
               idempotency_key, created_by
             ) VALUES (
               $1, $2, 'REFUND', $3, $4, $5::date::timestamptz, $5::date, $6, $7, $8, 'MANUAL',
               'POSTED', $9, $10
             )`,
            [
              transactionId,
              householdId,
              input.description,
              input.amountMinor,
              input.occurredAt,
              input.accountId,
              input.memberId,
              input.categoryId ?? null,
              input.idempotencyKey,
              userId,
            ],
          );
        } catch (error) {
          if ((error as { code?: string }).code === '23505') {
            throw new DomainError('DUPLICATE_IDEMPOTENCY_KEY');
          }
          throw error;
        }

        const { cycleForPurchase } = await import('@ff/domain');
        const cycle = cycleForPurchase(isoDate(input.occurredAt), card.closing_day, card.due_day);
        const statementId = await ensureStatement(client, householdId, input.accountId, cycle);
        await client.query(
          `INSERT INTO card_statement_items
             (household_id, card_statement_id, transaction_id, amount_minor)
           VALUES ($1, $2, $3, $4)`,
          [householdId, statementId, transactionId, input.amountMinor],
        );

        await insertAuditLog(client, {
          householdId,
          actorUserId: userId,
          entityType: 'transaction',
          entityId: transactionId,
          action: 'CARD_REFUND_CREATED',
          afterData: { amountMinor: input.amountMinor },
          requestId: ctx.requestId,
        });

        return { transactionId };
      });
    },

    /** Lista as faturas de um cartão, da mais recente para a mais antiga. */
    async listStatements(
      userId: string,
      householdId: string,
      accountId: string,
    ): Promise<CardStatement[]> {
      return withUserTransaction(
        db,
        userId,
        async (client) => {
          const { timezone } = await context(client, householdId, userId);
          const ids = await client.query<{ id: string }>(
            `SELECT id FROM card_statements
              WHERE household_id = $1 AND account_id = $2
              ORDER BY cycle_start_date DESC LIMIT 24`,
            [householdId, accountId],
          );
          const statements: CardStatement[] = [];
          for (const row of ids.rows) {
            statements.push(await readStatement(client, householdId, row.id, timezone));
          }
          return statements;
        },
        { readOnly: true },
      );
    },

    async getStatement(
      userId: string,
      householdId: string,
      statementId: string,
    ): Promise<CardStatement> {
      return withUserTransaction(
        db,
        userId,
        async (client) => {
          const { timezone } = await context(client, householdId, userId);
          return readStatement(client, householdId, statementId, timezone);
        },
        { readOnly: true },
      );
    },

    /** Fecha a fatura: nenhuma compra nova entra depois disso. */
    async closeStatement(
      userId: string,
      householdId: string,
      statementId: string,
      expectedVersion: number,
      ctx: RequestContext,
    ): Promise<CardStatement> {
      return withUserTransaction(db, userId, async (client) => {
        const { role, timezone } = await context(client, householdId, userId);
        if (!OPERATORS.includes(role)) throw new DomainError('INSUFFICIENT_PERMISSION');

        const current = await client.query<{ version: number; closed_at: Date | null }>(
          'SELECT version, closed_at FROM card_statements WHERE id = $1 AND household_id = $2 FOR UPDATE',
          [statementId, householdId],
        );
        const row = current.rows[0];
        if (!row) throw new DomainError('NOT_FOUND');
        if (row.version !== expectedVersion) {
          throw new DomainError('VERSION_CONFLICT', { currentVersion: row.version });
        }
        if (row.closed_at !== null) {
          throw new DomainError('ALREADY_SETTLED', undefined, 'Esta fatura já está fechada.');
        }

        await client.query(
          `UPDATE card_statements
              SET closed_at = now(), status = 'CLOSED', version = version + 1
            WHERE id = $1`,
          [statementId],
        );

        await insertAuditLog(client, {
          householdId,
          actorUserId: userId,
          entityType: 'card_statement',
          entityId: statementId,
          action: 'CARD_STATEMENT_CLOSED',
          requestId: ctx.requestId,
        });

        return readStatement(client, householdId, statementId, timezone);
      });
    },

    /**
     * Pagamento de fatura (docs/04 §10). Sai da conta bancária, abate a dívida
     * do cartão e NÃO cria despesa nova.
     */
    async payStatement(
      userId: string,
      householdId: string,
      statementId: string,
      input: PayCardStatementRequest,
      ctx: RequestContext,
    ): Promise<CardStatement> {
      return withUserTransaction(
        db,
        userId,
        async (client) => {
          const { role, timezone } = await context(client, householdId, userId);
          if (!OPERATORS.includes(role)) throw new DomainError('INSUFFICIENT_PERMISSION');

          const duplicate = await client.query<{ id: string }>(
            'SELECT id FROM card_statement_payments WHERE household_id = $1 AND idempotency_key = $2',
            [householdId, input.idempotencyKey],
          );
          if (duplicate.rows.length > 0) {
            return readStatement(client, householdId, statementId, timezone);
          }

          const locked = await client.query<{
            id: string;
            account_id: string;
            version: number;
            closed_at: Date | null;
          }>(
            'SELECT id, account_id, version, closed_at FROM card_statements WHERE id = $1 AND household_id = $2 FOR UPDATE',
            [statementId, householdId],
          );
          const statement = locked.rows[0];
          if (!statement) throw new DomainError('NOT_FOUND');
          if (statement.version !== input.expectedVersion) {
            throw new DomainError('VERSION_CONFLICT', { currentVersion: statement.version });
          }

          const totals = await client.query<{ total: string; paid: string }>(
            'SELECT app.card_statement_total($1) AS total, app.card_statement_paid($1) AS paid',
            [statementId],
          );
          const total = Number(totals.rows[0]?.total ?? 0);
          const paid = Number(totals.rows[0]?.paid ?? 0);
          if (total > 0 && paid >= total) throw new DomainError('STATEMENT_ALREADY_PAID');
          if (input.amountMinor > total - paid) {
            throw new DomainError('OUTSTANDING_AMOUNT_EXCEEDED', {
              outstandingMinor: total - paid,
            });
          }

          const account = await client.query<{ archived_at: Date | null; account_type: string }>(
            'SELECT archived_at, account_type FROM accounts WHERE id = $1 AND household_id = $2',
            [input.fromAccountId, householdId],
          );
          const from = account.rows[0];
          if (!from) throw new DomainError('ACCOUNT_NOT_FOUND');
          if (from.archived_at !== null) throw new DomainError('ACCOUNT_ARCHIVED');
          if (from.account_type === 'CREDIT_CARD') {
            throw new DomainError(
              'INVALID_ACCOUNT_TYPE',
              undefined,
              'A fatura precisa ser paga por uma conta, não por outro cartão.',
            );
          }

          const transactionId = randomUUID();
          await client.query(
            `INSERT INTO transactions (
               id, household_id, transaction_type, description, amount_minor, occurred_at,
               competence_date, account_id, destination_account_id, member_id, source, status,
               idempotency_key, created_by
             ) VALUES (
               $1, $2, 'CARD_PAYMENT', $3, $4, $5::date::timestamptz, $5::date, $6, $7, $8,
               'MANUAL', 'POSTED', $9, $10
             )`,
            [
              transactionId,
              householdId,
              'Pagamento de fatura',
              input.amountMinor,
              input.paidAt,
              input.fromAccountId,
              statement.account_id,
              input.memberId,
              `${input.idempotencyKey}:tx`,
              userId,
            ],
          );

          await client.query(
            `INSERT INTO card_statement_payments
               (household_id, card_statement_id, transaction_id, amount_minor, paid_at,
                created_by, idempotency_key)
             VALUES ($1, $2, $3, $4, $5::date, $6, $7)`,
            [
              householdId,
              statementId,
              transactionId,
              input.amountMinor,
              input.paidAt,
              userId,
              input.idempotencyKey,
            ],
          );

          await client.query(
            `UPDATE card_statements
                SET status = app.card_statement_status(id), version = version + 1
              WHERE id = $1`,
            [statementId],
          );

          await insertAuditLog(client, {
            householdId,
            actorUserId: userId,
            entityType: 'card_statement',
            entityId: statementId,
            action: 'CARD_STATEMENT_PAID',
            afterData: {
              amountMinor: input.amountMinor,
              outstandingMinor: total - paid - input.amountMinor,
            },
            requestId: ctx.requestId,
          });

          return readStatement(client, householdId, statementId, timezone);
        },
        { isolation: 'SERIALIZABLE' },
      );
    },

    /** Estorna um pagamento de fatura: a fatura reabre. */
    async reversePayment(
      userId: string,
      householdId: string,
      paymentId: string,
      input: ReverseCardPaymentRequest,
      ctx: RequestContext,
    ): Promise<CardStatement> {
      return withUserTransaction(
        db,
        userId,
        async (client) => {
          const { role, timezone } = await context(client, householdId, userId);
          if (!OPERATORS.includes(role)) throw new DomainError('INSUFFICIENT_PERMISSION');

          const locked = await client.query<{
            id: string;
            card_statement_id: string;
            transaction_id: string;
            amount_minor: string;
            reversed_at: Date | null;
            account_id: string;
            member_id: string;
            competence_date: Date;
          }>(
            `SELECT p.id, p.card_statement_id, p.transaction_id, p.amount_minor, p.reversed_at,
                    t.account_id, t.member_id, t.competence_date
               FROM card_statement_payments p
               JOIN transactions t ON t.id = p.transaction_id
              WHERE p.id = $1 AND p.household_id = $2
              FOR UPDATE OF p`,
            [paymentId, householdId],
          );
          const payment = locked.rows[0];
          if (!payment) throw new DomainError('NOT_FOUND');
          if (payment.reversed_at !== null) {
            throw new DomainError('TRANSACTION_ALREADY_REVERSED');
          }

          try {
            await client.query(
              `INSERT INTO transactions (
                 household_id, transaction_type, description, amount_minor, competence_date,
                 account_id, member_id, source, status, reason, reversed_transaction_id,
                 idempotency_key, created_by
               ) VALUES (
                 $1, 'REVERSAL', 'Estorno de pagamento de fatura', $2, $3, $4, $5, 'MANUAL',
                 'POSTED', $6, $7, $8, $9
               )`,
              [
                householdId,
                Number(payment.amount_minor),
                payment.competence_date,
                payment.account_id,
                payment.member_id,
                input.reason,
                payment.transaction_id,
                input.idempotencyKey,
                userId,
              ],
            );
          } catch (error) {
            if ((error as { code?: string }).code === '23505') {
              throw new DomainError('TRANSACTION_ALREADY_REVERSED');
            }
            throw error;
          }

          await client.query(
            `UPDATE transactions SET status = 'REVERSED', reversed_at = now(), reason = $2
              WHERE id = $1`,
            [payment.transaction_id, input.reason],
          );
          await client.query(
            `UPDATE card_statement_payments
                SET reversed_at = now(), reversal_reason = $2
              WHERE id = $1`,
            [paymentId, input.reason],
          );
          await client.query(
            `UPDATE card_statements
                SET status = app.card_statement_status(id), version = version + 1
              WHERE id = $1`,
            [payment.card_statement_id],
          );

          await insertAuditLog(client, {
            householdId,
            actorUserId: userId,
            entityType: 'card_statement',
            entityId: payment.card_statement_id,
            action: 'CARD_PAYMENT_REVERSED',
            metadata: { reason: input.reason },
            requestId: ctx.requestId,
          });

          return readStatement(client, householdId, payment.card_statement_id, timezone);
        },
        { isolation: 'SERIALIZABLE' },
      );
    },
  };
}
