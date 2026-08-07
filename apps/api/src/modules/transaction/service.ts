/**
 * Movimentações realizadas (docs/05 §4.6; tela 1g).
 *
 * Invariantes garantidas aqui:
 *  - Idempotência: a mesma chave nunca produz dois efeitos financeiros. Repetir
 *    o comando devolve a MOVIMENTAÇÃO ORIGINAL, não um erro — é o que faz o
 *    reenvio do outbox offline ser seguro.
 *  - Transferência é atômica e não é receita nem despesa: uma linha TRANSFER,
 *    com origem e destino, mais (opcionalmente) uma despesa separada de tarifa.
 *  - Correção é ESTORNO: cria uma linha REVERSAL, marca a original como
 *    REVERSED e preserva tudo. Estorno duplicado é bloqueado.
 *  - Rateio soma exatamente o valor total.
 */

import { randomUUID } from 'node:crypto';
import { allocate, DomainError, familyToday, minor } from '@ff/domain';
import type {
  CreateExpenseRequest,
  CreateIncomeRequest,
  CreateTransferRequest,
  ReverseTransactionRequest,
  Transaction,
  TransactionFilter,
  TransactionPage,
  UpdateAllocationsRequest,
} from '@ff/api-contracts';
import { withUserTransaction, type Database, type PoolClient } from '../../db/pool.js';
import { insertAuditLog } from '../auth/repository.js';
import type { RequestContext } from '../auth/service.js';
import { attachPurchaseToStatement } from '../card/statement.js';

type TransactionRow = {
  id: string;
  household_id: string;
  transaction_type: Transaction['transactionType'];
  description: string;
  amount_minor: number;
  occurred_at: Date;
  competence_date: Date;
  account_id: string;
  account_name: string | null;
  destination_account_id: string | null;
  destination_account_name: string | null;
  member_id: string;
  member_name: string | null;
  category_id: string | null;
  category_name: string | null;
  counterparty_name: string | null;
  source: Transaction['source'];
  status: Transaction['status'];
  notes: string | null;
  reason: string | null;
  reversal_transaction_id: string | null;
  reversed_transaction_id: string | null;
  planned_entry_id: string | null;
  created_by_name: string | null;
  version: number;
};

const TX_SELECT = `
  t.id, t.household_id, t.transaction_type, t.description, t.amount_minor, t.occurred_at,
  t.competence_date, t.account_id, a.name AS account_name, t.destination_account_id,
  d.name AS destination_account_name, t.member_id, m.display_name AS member_name,
  t.category_id, c.name AS category_name, cp.name AS counterparty_name, t.source, t.status,
  t.notes, t.reason,
  (SELECT r.id FROM transactions r WHERE r.reversed_transaction_id = t.id)
    AS reversal_transaction_id,
  t.reversed_transaction_id,
  (SELECT s.planned_entry_id FROM settlements s WHERE s.transaction_id = t.id)
    AS planned_entry_id,
  p.name AS created_by_name, t.version
`;

const TX_FROM = `
  FROM transactions t
  LEFT JOIN accounts a ON a.id = t.account_id
  LEFT JOIN accounts d ON d.id = t.destination_account_id
  LEFT JOIN household_members m ON m.id = t.member_id
  LEFT JOIN categories c ON c.id = t.category_id
  LEFT JOIN counterparties cp ON cp.id = t.counterparty_id
  LEFT JOIN profiles p ON p.id = t.created_by
`;

async function loadAllocations(
  client: PoolClient,
  transactionIds: readonly string[],
): Promise<Map<string, Transaction['allocations']>> {
  if (transactionIds.length === 0) return new Map();
  const result = await client.query<{
    transaction_id: string;
    category_id: string | null;
    category_name: string | null;
    member_id: string;
    member_name: string | null;
    amount_minor: number;
  }>(
    `SELECT al.transaction_id, al.category_id, c.name AS category_name, al.member_id,
            m.display_name AS member_name, al.amount_minor
       FROM transaction_allocations al
       LEFT JOIN categories c ON c.id = al.category_id
       LEFT JOIN household_members m ON m.id = al.member_id
      WHERE al.transaction_id = ANY($1::uuid[])
      ORDER BY al.created_at`,
    [transactionIds],
  );

  const map = new Map<string, Transaction['allocations']>();
  for (const row of result.rows) {
    const list = map.get(row.transaction_id) ?? [];
    list.push({
      categoryId: row.category_id,
      categoryName: row.category_name,
      memberId: row.member_id,
      memberName: row.member_name,
      amountMinor: Number(row.amount_minor),
    });
    map.set(row.transaction_id, list);
  }
  return map;
}

function toTransaction(
  row: TransactionRow,
  allocations: Transaction['allocations'] = [],
): Transaction {
  return {
    id: row.id,
    householdId: row.household_id,
    transactionType: row.transaction_type,
    description: row.description,
    amountMinor: Number(row.amount_minor),
    occurredAt: row.occurred_at.toISOString(),
    competenceDate: row.competence_date.toISOString().slice(0, 10),
    accountId: row.account_id,
    accountName: row.account_name,
    destinationAccountId: row.destination_account_id,
    destinationAccountName: row.destination_account_name,
    memberId: row.member_id,
    memberName: row.member_name,
    categoryId: row.category_id,
    categoryName: row.category_name,
    counterpartyName: row.counterparty_name,
    source: row.source,
    status: row.status,
    notes: row.notes,
    reason: row.reason,
    reversalTransactionId: row.reversal_transaction_id,
    reversedTransactionId: row.reversed_transaction_id,
    plannedEntryId: row.planned_entry_id,
    allocations,
    createdByName: row.created_by_name,
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

/** Perfis que podem operar transferência, pagamento e estorno. */
const OPERATORS = ['OWNER', 'ADMIN', 'ADULT'];

export type TransactionService = ReturnType<typeof createTransactionService>;

export function createTransactionService(deps: { readonly db: Database }) {
  const { db } = deps;

  /** Devolve a movimentação já existente para a chave, se houver. */
  async function findByIdempotencyKey(
    client: PoolClient,
    householdId: string,
    idempotencyKey: string,
  ): Promise<Transaction | null> {
    const result = await client.query<TransactionRow>(
      `SELECT ${TX_SELECT} ${TX_FROM} WHERE t.household_id = $1 AND t.idempotency_key = $2`,
      [householdId, idempotencyKey],
    );
    const row = result.rows[0];
    if (!row) return null;
    const allocations = await loadAllocations(client, [row.id]);
    return toTransaction(row, allocations.get(row.id) ?? []);
  }

  async function ensureAccountUsable(
    client: PoolClient,
    householdId: string,
    accountId: string,
  ): Promise<{ accountType: string }> {
    const result = await client.query<{ account_type: string; archived_at: Date | null }>(
      'SELECT account_type, archived_at FROM accounts WHERE id = $1 AND household_id = $2',
      [accountId, householdId],
    );
    const row = result.rows[0];
    if (!row) throw new DomainError('ACCOUNT_NOT_FOUND');
    if (row.archived_at !== null) throw new DomainError('ACCOUNT_ARCHIVED');
    return { accountType: row.account_type };
  }

  async function upsertCounterparty(
    client: PoolClient,
    householdId: string,
    name: string | undefined,
  ): Promise<string | null> {
    if (name === undefined) return null;
    const result = await client.query<{ id: string }>(
      `INSERT INTO counterparties (household_id, name) VALUES ($1, $2)
       ON CONFLICT (household_id, lower(name)) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
      [householdId, name],
    );
    return result.rows[0]?.id ?? null;
  }

  async function insertAllocations(
    client: PoolClient,
    householdId: string,
    transactionId: string,
    allocations: ReadonlyArray<{
      categoryId?: string | undefined;
      memberId: string;
      amountMinor: number;
    }>,
  ): Promise<void> {
    for (const allocation of allocations) {
      await client.query(
        `INSERT INTO transaction_allocations
           (household_id, transaction_id, category_id, member_id, amount_minor)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          householdId,
          transactionId,
          allocation.categoryId ?? null,
          allocation.memberId,
          allocation.amountMinor,
        ],
      );
    }
  }

  async function readOne(client: PoolClient, transactionId: string): Promise<Transaction> {
    const result = await client.query<TransactionRow>(
      `SELECT ${TX_SELECT} ${TX_FROM} WHERE t.id = $1`,
      [transactionId],
    );
    const row = result.rows[0];
    if (!row) throw new DomainError('NOT_FOUND');
    const allocations = await loadAllocations(client, [row.id]);
    return toTransaction(row, allocations.get(row.id) ?? []);
  }

  /** Caminho comum de despesa e receita. */
  async function createSimple(
    userId: string,
    householdId: string,
    input: CreateExpenseRequest | CreateIncomeRequest,
    type: 'EXPENSE' | 'INCOME',
    ctx: RequestContext,
  ): Promise<Transaction> {
    return withUserTransaction(db, userId, async (client) => {
      const { timezone } = await householdContext(client, householdId, userId);

      const existing = await findByIdempotencyKey(client, householdId, input.idempotencyKey);
      // Repetir o comando devolve o mesmo resultado: é isso que torna seguro
      // reenviar o item do outbox depois de uma queda de rede.
      if (existing) return existing;

      const { accountType } = await ensureAccountUsable(client, householdId, input.accountId);
      // Despesa em cartão é COMPRA no cartão: não sai da conta bancária agora.
      const effectiveType =
        type === 'EXPENSE' && accountType === 'CREDIT_CARD' ? 'CARD_PURCHASE' : type;

      const counterpartyId = await upsertCounterparty(client, householdId, input.counterpartyName);
      const today = familyToday(timezone);
      const transactionId = randomUUID();

      try {
        await client.query(
          `INSERT INTO transactions (
             id, household_id, transaction_type, description, amount_minor, occurred_at,
             competence_date, account_id, member_id, category_id, counterparty_id, source,
             status, notes, idempotency_key, created_by
           ) VALUES (
             $1, $2, $3, $4, $5, COALESCE($6::date, CURRENT_DATE)::timestamptz,
             COALESCE($7::date, $8::date), $9, $10, $11, $12, $13, 'POSTED', $14, $15, $16
           )`,
          [
            transactionId,
            householdId,
            effectiveType,
            input.description,
            input.amountMinor,
            input.occurredAt ?? null,
            input.competenceDate ?? null,
            today,
            input.accountId,
            input.memberId,
            input.categoryId ?? null,
            counterpartyId,
            input.source,
            input.notes ?? null,
            input.idempotencyKey,
            userId,
          ],
        );
      } catch (error) {
        if ((error as { code?: string }).code === '23505') {
          const duplicated = await findByIdempotencyKey(client, householdId, input.idempotencyKey);
          if (duplicated) return duplicated;
          throw new DomainError('DUPLICATE_IDEMPOTENCY_KEY');
        }
        throw error;
      }

      // Compra no cartão precisa entrar na fatura do ciclo. Sem isto a dívida
      // aparece no saldo do cartão, mas a fatura fica zerada e a compra nunca é
      // cobrada — era o defeito registrado no PROGRESS em 2026-08-07.
      if (effectiveType === 'CARD_PURCHASE') {
        await attachPurchaseToStatement(
          client,
          householdId,
          input.accountId,
          transactionId,
          input.amountMinor,
          input.occurredAt ?? today,
        );
      }

      if (input.allocations !== undefined && input.allocations.length > 0) {
        await insertAllocations(client, householdId, transactionId, input.allocations);
      }

      await insertAuditLog(client, {
        householdId,
        actorUserId: userId,
        entityType: 'transaction',
        entityId: transactionId,
        action: 'TRANSACTION_CREATED',
        afterData: {
          type: effectiveType,
          amountMinor: input.amountMinor,
          description: input.description,
        },
        requestId: ctx.requestId,
      });

      return readOne(client, transactionId);
    });
  }

  return {
    async createExpense(
      userId: string,
      householdId: string,
      input: CreateExpenseRequest,
      ctx: RequestContext,
    ): Promise<Transaction> {
      return createSimple(userId, householdId, input, 'EXPENSE', ctx);
    },

    async createIncome(
      userId: string,
      householdId: string,
      input: CreateIncomeRequest,
      ctx: RequestContext,
    ): Promise<Transaction> {
      return createSimple(userId, householdId, input, 'INCOME', ctx);
    },

    /**
     * Transferência: UMA linha TRANSFER com origem e destino. Não é receita nem
     * despesa e, por isso, não entra em relatório de categoria. A tarifa, quando
     * existe, vira uma despesa separada — também dentro da mesma transação.
     */
    async createTransfer(
      userId: string,
      householdId: string,
      input: CreateTransferRequest,
      ctx: RequestContext,
    ): Promise<Transaction> {
      return withUserTransaction(
        db,
        userId,
        async (client) => {
          const { role, timezone } = await householdContext(client, householdId, userId);
          if (!OPERATORS.includes(role)) throw new DomainError('INSUFFICIENT_PERMISSION');

          const existing = await findByIdempotencyKey(client, householdId, input.idempotencyKey);
          if (existing) return existing;

          await ensureAccountUsable(client, householdId, input.fromAccountId);
          await ensureAccountUsable(client, householdId, input.toAccountId);

          const today = familyToday(timezone);
          const transactionId = randomUUID();

          try {
            await client.query(
              `INSERT INTO transactions (
                 id, household_id, transaction_type, description, amount_minor, occurred_at,
                 competence_date, account_id, destination_account_id, member_id, source, status,
                 notes, idempotency_key, created_by
               ) VALUES (
                 $1, $2, 'TRANSFER', $3, $4, COALESCE($5::date, CURRENT_DATE)::timestamptz,
                 COALESCE($6::date, $7::date), $8, $9, $10, 'MANUAL', 'POSTED', $11, $12, $13
               )`,
              [
                transactionId,
                householdId,
                input.description,
                input.amountMinor,
                input.occurredAt ?? null,
                input.competenceDate ?? null,
                today,
                input.fromAccountId,
                input.toAccountId,
                input.memberId,
                input.notes ?? null,
                input.idempotencyKey,
                userId,
              ],
            );
          } catch (error) {
            if ((error as { code?: string }).code === '23505') {
              const duplicated = await findByIdempotencyKey(
                client,
                householdId,
                input.idempotencyKey,
              );
              if (duplicated) return duplicated;
              throw new DomainError('DUPLICATE_IDEMPOTENCY_KEY');
            }
            throw error;
          }

          if (input.feeMinor !== undefined) {
            await client.query(
              `INSERT INTO transactions (
                 household_id, transaction_type, description, amount_minor, occurred_at,
                 competence_date, account_id, member_id, category_id, source, status,
                 idempotency_key, created_by
               ) VALUES (
                 $1, 'EXPENSE', $2, $3, COALESCE($4::date, CURRENT_DATE)::timestamptz,
                 COALESCE($5::date, $6::date), $7, $8, $9, 'MANUAL', 'POSTED', $10, $11
               )`,
              [
                householdId,
                `Tarifa · ${input.description}`,
                input.feeMinor,
                input.occurredAt ?? null,
                input.competenceDate ?? null,
                today,
                input.fromAccountId,
                input.memberId,
                input.feeCategoryId ?? null,
                `${input.idempotencyKey}:fee`,
                userId,
              ],
            );
          }

          await insertAuditLog(client, {
            householdId,
            actorUserId: userId,
            entityType: 'transaction',
            entityId: transactionId,
            action: 'TRANSFER_CREATED',
            afterData: {
              amountMinor: input.amountMinor,
              fromAccountId: input.fromAccountId,
              toAccountId: input.toAccountId,
            },
            requestId: ctx.requestId,
          });

          return readOne(client, transactionId);
        },
        { isolation: 'SERIALIZABLE' },
      );
    },

    /**
     * Estorno (docs/04 §8): cria a linha inversa, preserva a original, exige
     * motivo e bloqueia estorno duplicado.
     */
    async reverse(
      userId: string,
      householdId: string,
      transactionId: string,
      input: ReverseTransactionRequest,
      ctx: RequestContext,
    ): Promise<Transaction> {
      return withUserTransaction(
        db,
        userId,
        async (client) => {
          const { role } = await householdContext(client, householdId, userId);
          if (!OPERATORS.includes(role)) throw new DomainError('INSUFFICIENT_PERMISSION');

          const existing = await findByIdempotencyKey(client, householdId, input.idempotencyKey);
          if (existing) return existing;

          const original = await client.query<{
            id: string;
            transaction_type: Transaction['transactionType'];
            description: string;
            amount_minor: number;
            account_id: string;
            destination_account_id: string | null;
            member_id: string;
            category_id: string | null;
            competence_date: Date;
            status: Transaction['status'];
          }>(
            `SELECT id, transaction_type, description, amount_minor, account_id,
                    destination_account_id, member_id, category_id, competence_date, status
               FROM transactions
              WHERE id = $1 AND household_id = $2 FOR UPDATE`,
            [transactionId, householdId],
          );
          const row = original.rows[0];
          if (!row) throw new DomainError('NOT_FOUND');
          if (row.status === 'REVERSED') throw new DomainError('TRANSACTION_ALREADY_REVERSED');
          if (row.status !== 'POSTED') {
            throw new DomainError(
              'TRANSACTION_ALREADY_REVERSED',
              undefined,
              'Só movimentações postadas podem ser estornadas.',
            );
          }

          const reversalId = randomUUID();
          try {
            await client.query(
              `INSERT INTO transactions (
                 id, household_id, transaction_type, description, amount_minor, competence_date,
                 account_id, destination_account_id, member_id, category_id, source, status,
                 reason, reversed_transaction_id, idempotency_key, created_by
               ) VALUES (
                 $1, $2, 'REVERSAL', $3, $4, $5, $6, $7, $8, $9, 'MANUAL', 'POSTED', $10, $11,
                 $12, $13
               )`,
              [
                reversalId,
                householdId,
                `Estorno · ${row.description}`,
                row.amount_minor,
                row.competence_date,
                row.account_id,
                row.destination_account_id,
                row.member_id,
                row.category_id,
                input.reason,
                transactionId,
                input.idempotencyKey,
                userId,
              ],
            );
          } catch (error) {
            // Índice único em reversed_transaction_id: estorno duplicado nunca passa.
            if ((error as { code?: string }).code === '23505') {
              throw new DomainError('TRANSACTION_ALREADY_REVERSED');
            }
            throw error;
          }

          await client.query(
            `UPDATE transactions
                SET status = 'REVERSED', reversed_at = now(), reason = $2, version = version + 1
              WHERE id = $1`,
            [transactionId, input.reason],
          );

          await insertAuditLog(client, {
            householdId,
            actorUserId: userId,
            entityType: 'transaction',
            entityId: transactionId,
            action: 'TRANSACTION_REVERSED',
            beforeData: { status: 'POSTED' },
            afterData: { status: 'REVERSED', reversalId },
            metadata: { reason: input.reason },
            requestId: ctx.requestId,
          });

          return readOne(client, reversalId);
        },
        { isolation: 'SERIALIZABLE' },
      );
    },

    /** Redefine o rateio; a soma é revalidada contra o valor no servidor. */
    async setAllocations(
      userId: string,
      householdId: string,
      transactionId: string,
      input: UpdateAllocationsRequest,
      ctx: RequestContext,
    ): Promise<Transaction> {
      return withUserTransaction(db, userId, async (client) => {
        const { role } = await householdContext(client, householdId, userId);
        if (!OPERATORS.includes(role)) throw new DomainError('INSUFFICIENT_PERMISSION');

        const current = await client.query<{
          amount_minor: number;
          version: number;
          status: string;
        }>(
          'SELECT amount_minor, version, status FROM transactions WHERE id = $1 AND household_id = $2 FOR UPDATE',
          [transactionId, householdId],
        );
        const row = current.rows[0];
        if (!row) throw new DomainError('NOT_FOUND');
        if (row.version !== input.expectedVersion) {
          throw new DomainError('VERSION_CONFLICT', { currentVersion: row.version });
        }
        if (row.status === 'REVERSED') throw new DomainError('TRANSACTION_ALREADY_REVERSED');

        const total = input.allocations.reduce((sum, item) => sum + item.amountMinor, 0);
        if (total !== Number(row.amount_minor)) {
          throw new DomainError('INVALID_ALLOCATION_TOTAL', {
            expectedMinor: Number(row.amount_minor),
            receivedMinor: total,
          });
        }

        await client.query('DELETE FROM transaction_allocations WHERE transaction_id = $1', [
          transactionId,
        ]);
        await insertAllocations(client, householdId, transactionId, input.allocations);
        await client.query('UPDATE transactions SET version = version + 1 WHERE id = $1', [
          transactionId,
        ]);

        await insertAuditLog(client, {
          householdId,
          actorUserId: userId,
          entityType: 'transaction',
          entityId: transactionId,
          action: 'ALLOCATIONS_UPDATED',
          afterData: { parts: input.allocations.length },
          requestId: ctx.requestId,
        });

        return readOne(client, transactionId);
      });
    },

    /** Divide um valor igualmente entre membros, fechando o total exato. */
    splitEqually(
      amountMinor: number,
      memberIds: readonly string[],
    ): Array<{ memberId: string; amountMinor: number }> {
      const parts = allocate(
        minor(amountMinor),
        memberIds.map(() => 1),
      );
      return memberIds.map((memberId, index) => ({
        memberId,
        amountMinor: parts[index] ?? 0,
      }));
    },

    /** Lista com filtros e busca, paginada por cursor (docs/09 §11). */
    async list(
      userId: string,
      householdId: string,
      filter: TransactionFilter,
    ): Promise<TransactionPage> {
      return withUserTransaction(
        db,
        userId,
        async (client) => {
          await householdContext(client, householdId, userId);

          const conditions: string[] = ['t.household_id = $1'];
          const params: unknown[] = [householdId];
          const add = (sql: string, value: unknown): void => {
            params.push(value);
            conditions.push(sql.replace('$$', `$${params.length}`));
          };

          if (filter.from !== undefined) add('t.occurred_at >= $$::date', filter.from);
          if (filter.to !== undefined)
            add("t.occurred_at < ($$::date + INTERVAL '1 day')", filter.to);
          if (filter.accountId !== undefined)
            add('(t.account_id = $$ OR t.destination_account_id = $$)', filter.accountId);
          if (filter.categoryId !== undefined) add('t.category_id = $$', filter.categoryId);
          if (filter.memberId !== undefined) add('t.member_id = $$', filter.memberId);
          if (filter.type !== undefined) add('t.transaction_type = $$', filter.type);
          if (filter.status !== undefined) add('t.status = $$', filter.status);

          if (filter.search !== undefined && filter.search !== '') {
            // Busca por texto OU por valor exato em centavos, como manda a 1g.
            const digits = filter.search.replace(/\D/g, '');
            params.push(`%${filter.search}%`);
            const textParam = params.length;
            params.push(digits === '' ? null : Number(digits));
            const amountParam = params.length;
            conditions.push(
              `(t.description ILIKE $${textParam} OR cp.name ILIKE $${textParam}` +
                ` OR ($${amountParam}::bigint IS NOT NULL AND t.amount_minor = $${amountParam}::bigint))`,
            );
          }

          // Cursor: "occurredAt|id", estável mesmo com empates de horário.
          if (filter.cursor !== undefined) {
            const [cursorTime, cursorId] = filter.cursor.split('|');
            params.push(cursorTime);
            params.push(cursorId);
            conditions.push(
              `(t.occurred_at, t.id) < ($${params.length - 1}::timestamptz, $${params.length}::uuid)`,
            );
          }

          params.push(filter.pageSize + 1);
          const result = await client.query<TransactionRow>(
            `SELECT ${TX_SELECT} ${TX_FROM}
              WHERE ${conditions.join(' AND ')}
              ORDER BY t.occurred_at DESC, t.id DESC
              LIMIT $${params.length}`,
            params,
          );

          const hasMore = result.rows.length > filter.pageSize;
          const rows = hasMore ? result.rows.slice(0, filter.pageSize) : result.rows;
          const allocations = await loadAllocations(
            client,
            rows.map((row) => row.id),
          );
          const last = rows[rows.length - 1];

          return {
            items: rows.map((row) => toTransaction(row, allocations.get(row.id) ?? [])),
            nextCursor: hasMore && last ? `${last.occurred_at.toISOString()}|${last.id}` : null,
          };
        },
        { readOnly: true },
      );
    },

    async get(userId: string, householdId: string, transactionId: string): Promise<Transaction> {
      return withUserTransaction(
        db,
        userId,
        async (client) => {
          await householdContext(client, householdId, userId);
          const result = await client.query<TransactionRow>(
            `SELECT ${TX_SELECT} ${TX_FROM} WHERE t.id = $1 AND t.household_id = $2`,
            [transactionId, householdId],
          );
          const row = result.rows[0];
          if (!row) throw new DomainError('NOT_FOUND');
          const allocations = await loadAllocations(client, [row.id]);
          return toTransaction(row, allocations.get(row.id) ?? []);
        },
        { readOnly: true },
      );
    },
  };
}
