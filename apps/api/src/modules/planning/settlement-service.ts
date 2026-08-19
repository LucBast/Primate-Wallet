/**
 * Baixas (docs/04 §6, §7, §8; tela 1e).
 *
 * A baixa é o ponto mais sensível do sistema. Garantias aplicadas aqui:
 *
 *  - ATÔMICA: conta prevista, baixa e movimentação nascem na mesma transação.
 *  - CONCORRÊNCIA: `SELECT ... FOR UPDATE` na conta prevista + `expectedVersion`.
 *    Duas baixas simultâneas do mesmo saldo — uma vence, a outra recebe
 *    VERSION_CONFLICT ou OUTSTANDING_AMOUNT_EXCEEDED, nunca as duas passam.
 *  - LIMITE: o principal nunca ultrapassa o saldo em aberto
 *    (OUTSTANDING_AMOUNT_EXCEEDED); juros e multa entram por fora, e desconto
 *    reduz o que sai da conta, sem mexer no principal quitado.
 *  - IDEMPOTÊNCIA: a mesma chave devolve a MESMA baixa.
 *  - ESTORNO: a baixa nunca é apagada; é marcada como estornada, a movimentação
 *    recebe um REVERSAL e a conta prevista REABRE (SETTLED → PARTIAL/OPEN).
 */

import { randomUUID } from 'node:crypto';
import { DomainError } from '@ff/domain';
import type {
  ReverseSettlementRequest,
  Settlement,
  SettlePlannedEntryRequest,
  SettleResponse,
  OffsetSettlePlannedEntryRequest,
  OffsetSettleResponse,
  OffsetCandidateList,
} from '@ff/api-contracts';
import { withUserTransaction, type Database, type PoolClient } from '../../db/pool.js';
import { insertAuditLog } from '../auth/repository.js';
import type { RequestContext } from '../auth/service.js';
import { attachPurchaseToStatement } from '../card/statement.js';

type SettlementRow = {
  id: string;
  planned_entry_id: string;
  transaction_id: string;
  account_id: string;
  account_name: string | null;
  principal_amount_minor: string | number;
  interest_amount_minor: string | number;
  penalty_amount_minor: string | number;
  discount_amount_minor: string | number;
  net_amount_minor: string | number;
  settled_at: Date;
  created_by_name: string | null;
  reversed_at: Date | null;
  reversal_reason: string | null;
};

const SETTLEMENT_SELECT = `
  s.id, s.planned_entry_id, s.transaction_id, s.account_id, a.name AS account_name,
  s.principal_amount_minor, s.interest_amount_minor, s.penalty_amount_minor,
  s.discount_amount_minor, s.net_amount_minor, s.settled_at, p.name AS created_by_name,
  s.reversed_at, s.reversal_reason
  FROM settlements s
  LEFT JOIN accounts a ON a.id = s.account_id
  LEFT JOIN profiles p ON p.id = s.created_by
`;

function toSettlement(row: SettlementRow): Settlement {
  return {
    id: row.id,
    plannedEntryId: row.planned_entry_id,
    transactionId: row.transaction_id,
    accountId: row.account_id,
    accountName: row.account_name,
    principalAmountMinor: Number(row.principal_amount_minor),
    interestAmountMinor: Number(row.interest_amount_minor),
    penaltyAmountMinor: Number(row.penalty_amount_minor),
    discountAmountMinor: Number(row.discount_amount_minor),
    netAmountMinor: Number(row.net_amount_minor),
    settledAt: row.settled_at.toISOString().slice(0, 10),
    createdByName: row.created_by_name,
    reversedAt: row.reversed_at?.toISOString() ?? null,
    reversalReason: row.reversal_reason,
  };
}

const OPERATORS = ['OWNER', 'ADMIN', 'ADULT'];

export type SettlementService = ReturnType<typeof createSettlementService>;

export function createSettlementService(deps: {
  readonly db: Database;
  /** Reaproveita a leitura da conta prevista do serviço de planejamento. */
  readonly readPlannedEntry: (
    userId: string,
    householdId: string,
    entryId: string,
  ) => Promise<SettleResponse['plannedEntry']>;
}) {
  const { db, readPlannedEntry } = deps;

  async function context(
    client: PoolClient,
    householdId: string,
    userId: string,
  ): Promise<{ role: string; memberId: string }> {
    const result = await client.query<{ role: string; member_id: string }>(
      `SELECT m.role, m.id AS member_id
         FROM household_members m
        WHERE m.household_id = $1 AND m.user_id = $2 AND m.status = 'ACTIVE'`,
      [householdId, userId],
    );
    const row = result.rows[0];
    if (!row) throw new DomainError('HOUSEHOLD_NOT_FOUND');
    return { role: row.role, memberId: row.member_id };
  }

  async function findByKey(
    client: PoolClient,
    householdId: string,
    idempotencyKey: string,
  ): Promise<Settlement | null> {
    const result = await client.query<SettlementRow>(
      `SELECT ${SETTLEMENT_SELECT} WHERE s.household_id = $1 AND s.idempotency_key = $2`,
      [householdId, idempotencyKey],
    );
    const row = result.rows[0];
    return row ? toSettlement(row) : null;
  }

  return {
    /** Dar baixa (total ou parcial) numa conta prevista. */
    async settle(
      userId: string,
      householdId: string,
      entryId: string,
      input: SettlePlannedEntryRequest,
      ctx: RequestContext,
    ): Promise<SettleResponse> {
      const settlementId = await withUserTransaction(
        db,
        userId,
        async (client) => {
          const { role, memberId } = await context(client, householdId, userId);
          if (!OPERATORS.includes(role)) throw new DomainError('INSUFFICIENT_PERMISSION');

          const already = await findByKey(client, householdId, input.idempotencyKey);
          if (already) return already.id;

          // Trava a conta prevista: é o que serializa duas baixas simultâneas.
          const locked = await client.query<{
            id: string;
            nature: 'PAYABLE' | 'RECEIVABLE';
            description: string;
            version: number;
            canceled_at: Date | null;
            category_id: string | null;
            member_id: string;
            competence_date: Date;
          }>(
            `SELECT id, nature, description, version, canceled_at, category_id, member_id,
                    competence_date
               FROM planned_entries
              WHERE id = $1 AND household_id = $2
              FOR UPDATE`,
            [entryId, householdId],
          );
          const entry = locked.rows[0];
          if (!entry) throw new DomainError('NOT_FOUND');
          if (entry.canceled_at !== null) {
            throw new DomainError('ALREADY_SETTLED', undefined, 'Esta conta foi cancelada.');
          }
          if (entry.version !== input.expectedVersion) {
            throw new DomainError('VERSION_CONFLICT', { currentVersion: entry.version });
          }

          // Saldo em aberto revalidado DENTRO da transação (docs/04 §15).
          const outstandingResult = await client.query<{ outstanding: string }>(
            'SELECT app.planned_entry_outstanding($1) AS outstanding',
            [entryId],
          );
          const outstanding = Number(outstandingResult.rows[0]?.outstanding ?? 0);
          if (outstanding <= 0) throw new DomainError('ALREADY_SETTLED');
          if (input.principalAmountMinor > outstanding) {
            throw new DomainError('OUTSTANDING_AMOUNT_EXCEEDED', {
              outstandingMinor: outstanding,
            });
          }

          const netAmount =
            input.principalAmountMinor +
            input.interestAmountMinor +
            input.penaltyAmountMinor -
            input.discountAmountMinor;
          if (netAmount <= 0) {
            throw new DomainError(
              'VALIDATION_ERROR',
              { netAmountMinor: netAmount },
              'O desconto não pode ser maior que o valor da baixa.',
            );
          }

          // A conta usada precisa existir, estar ativa e ser operável.
          const account = await client.query<{ account_type: string; archived_at: Date | null }>(
            'SELECT account_type, archived_at FROM accounts WHERE id = $1 AND household_id = $2',
            [input.accountId, householdId],
          );
          const accountRow = account.rows[0];
          if (!accountRow) throw new DomainError('ACCOUNT_NOT_FOUND');
          if (accountRow.archived_at !== null) throw new DomainError('ACCOUNT_ARCHIVED');

          // A baixa gera uma movimentação realizada, do tipo certo para a
          // natureza da conta prevista e para o tipo da conta usada.
          const transactionType =
            entry.nature === 'PAYABLE'
              ? accountRow.account_type === 'CREDIT_CARD'
                ? 'CARD_PURCHASE'
                : 'EXPENSE'
              : 'INCOME';

          const transactionId = randomUUID();
          await client.query(
            `INSERT INTO transactions (
               id, household_id, transaction_type, description, amount_minor, occurred_at,
               competence_date, account_id, member_id, category_id, source, status,
               idempotency_key, created_by
             ) VALUES (
               $1, $2, $3, $4, $5, $6::date::timestamptz, $7, $8, $9, $10, 'SETTLEMENT', 'POSTED',
               $11, $12
             )`,
            [
              transactionId,
              householdId,
              transactionType,
              entry.description,
              netAmount,
              input.settledAt,
              entry.competence_date,
              input.accountId,
              entry.member_id,
              entry.category_id,
              `${input.idempotencyKey}:tx`,
              userId,
            ],
          );

          // Pagar uma conta prevista com cartão é compra no cartão, e compra no
          // cartão entra na fatura do ciclo (ver card/statement.ts).
          if (transactionType === 'CARD_PURCHASE') {
            await attachPurchaseToStatement(
              client,
              householdId,
              input.accountId,
              transactionId,
              netAmount,
              input.settledAt,
            );
          }

          const newSettlementId = randomUUID();
          await client.query(
            `INSERT INTO settlements (
               id, household_id, planned_entry_id, transaction_id, account_id,
               principal_amount_minor, interest_amount_minor, penalty_amount_minor,
               discount_amount_minor, net_amount_minor, settled_at, created_by, idempotency_key
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::date, $12, $13)`,
            [
              newSettlementId,
              householdId,
              entryId,
              transactionId,
              input.accountId,
              input.principalAmountMinor,
              input.interestAmountMinor,
              input.penaltyAmountMinor,
              input.discountAmountMinor,
              netAmount,
              input.settledAt,
              userId,
              input.idempotencyKey,
            ],
          );

          // Status persistido acompanha o derivado, e a versão avança — é o que
          // faz a segunda baixa concorrente bater em VERSION_CONFLICT.
          await client.query(
            `UPDATE planned_entries
                SET status = app.planned_entry_status(id), version = version + 1
              WHERE id = $1`,
            [entryId],
          );

          await insertAuditLog(client, {
            householdId,
            actorUserId: userId,
            entityType: 'planned_entry',
            entityId: entryId,
            action: 'PLANNED_ENTRY_SETTLED',
            beforeData: { outstandingMinor: outstanding },
            afterData: {
              principalMinor: input.principalAmountMinor,
              netMinor: netAmount,
              outstandingMinor: outstanding - input.principalAmountMinor,
            },
            metadata: { memberId, settlementId: newSettlementId },
            requestId: ctx.requestId,
          });

          return newSettlementId;
        },
        { isolation: 'SERIALIZABLE' },
      );

      const [plannedEntry, settlement] = await Promise.all([
        readPlannedEntry(userId, householdId, entryId),
        this.get(userId, householdId, settlementId),
      ]);
      return { plannedEntry, settlement };
    },

    async get(userId: string, householdId: string, settlementId: string): Promise<Settlement> {
      return withUserTransaction(
        db,
        userId,
        async (client) => {
          const result = await client.query<SettlementRow>(
            `SELECT ${SETTLEMENT_SELECT} WHERE s.id = $1 AND s.household_id = $2`,
            [settlementId, householdId],
          );
          const row = result.rows[0];
          if (!row) throw new DomainError('NOT_FOUND');
          return toSettlement(row);
        },
        { readOnly: true },
      );
    },

    /** Histórico de baixas da conta prevista (bloco da tela 1e). */
    async list(userId: string, householdId: string, entryId: string): Promise<Settlement[]> {
      return withUserTransaction(
        db,
        userId,
        async (client) => {
          const result = await client.query<SettlementRow>(
            `SELECT ${SETTLEMENT_SELECT}
              WHERE s.household_id = $1 AND s.planned_entry_id = $2
              ORDER BY s.settled_at DESC, s.created_at DESC`,
            [householdId, entryId],
          );
          return result.rows.map(toSettlement);
        },
        { readOnly: true },
      );
    },

    /**
     * Estorna uma baixa: a linha permanece, marcada; a movimentação recebe um
     * REVERSAL; e a conta prevista reabre.
     */
    /**
     * Transações que PODEM compensar esta conta prevista.
     *
     * O filtro é o que impede o usuário de escolher errado: mesma família,
     * postada, não estornada, ainda não usada em outra baixa, não nascida de
     * uma baixa (senão a quitação de uma conta quitaria outra), e na direção
     * certa — despesa abate conta a pagar, receita abate conta a receber.
     */
    async listOffsetCandidates(
      userId: string,
      householdId: string,
      entryId: string,
    ): Promise<OffsetCandidateList> {
      return withUserTransaction(db, userId, async (client) => {
        await context(client, householdId, userId);

        const entry = await client.query<{ nature: 'PAYABLE' | 'RECEIVABLE' }>(
          'SELECT nature FROM planned_entries WHERE id = $1 AND household_id = $2',
          [entryId, householdId],
        );
        const nature = entry.rows[0]?.nature;
        if (nature === undefined) throw new DomainError('NOT_FOUND');

        const tipos = nature === 'PAYABLE' ? ['EXPENSE', 'CARD_PURCHASE'] : ['INCOME'];

        const rows = await client.query<{
          transaction_id: string;
          description: string;
          amount_minor: string;
          occurred_at: Date;
          account_name: string | null;
          category_name: string | null;
        }>(
          `SELECT t.id AS transaction_id, t.description, t.amount_minor, t.occurred_at,
                  a.name AS account_name, c.name AS category_name
             FROM transactions t
             LEFT JOIN accounts a ON a.id = t.account_id
             LEFT JOIN categories c ON c.id = t.category_id
            WHERE t.household_id = $1
              AND t.transaction_type = ANY($2::text[])
              AND t.status = 'POSTED'
              AND t.source <> 'SETTLEMENT'
              AND t.reversed_transaction_id IS NULL
              AND NOT EXISTS (
                    SELECT 1 FROM transactions r
                     WHERE r.reversed_transaction_id = t.id AND r.status = 'POSTED')
              AND NOT EXISTS (
                    SELECT 1 FROM settlements s
                     WHERE s.transaction_id = t.id AND s.reversed_at IS NULL)
            ORDER BY t.occurred_at DESC
            LIMIT 100`,
          [householdId, tipos],
        );

        return {
          items: rows.rows.map((r) => ({
            transactionId: r.transaction_id,
            description: r.description,
            amountMinor: Number(r.amount_minor),
            occurredAt: r.occurred_at.toISOString(),
            accountName: r.account_name,
            categoryName: r.category_name,
          })),
        };
      });
    },

    /**
     * Baixa por compensação: abate a conta prevista com transações que já
     * existem, sem mover dinheiro de novo.
     *
     * Cada transação vira UMA baixa, pelo valor exato dela — reaproveitando a
     * transação em vez de criar outra. É essa reutilização que evita contar a
     * mesma despesa duas vezes: o dinheiro do conserto saiu quando o conserto
     * foi pago, e agora ele quita parte do aluguel.
     *
     * A transação NÃO é reescrita: continua com a categoria e a descrição
     * originais. Lançamento postado não se edita (docs/04), e o relatório fica
     * mais fiel assim — R$ 500 em Manutenção e R$ 1.500 em Aluguel somam os
     * R$ 2.000 devidos, cada centavo onde de fato foi gasto.
     */
    async settleWithOffset(
      userId: string,
      householdId: string,
      entryId: string,
      input: OffsetSettlePlannedEntryRequest,
      ctx: RequestContext,
    ): Promise<OffsetSettleResponse> {
      const settlementIds = await withUserTransaction(
        db,
        userId,
        async (client): Promise<string[]> => {
          const { role } = await context(client, householdId, userId);
          if (!OPERATORS.includes(role)) throw new DomainError('INSUFFICIENT_PERMISSION');

          const already = await findByKey(client, householdId, input.idempotencyKey);
          if (already) return [already.id];

          const locked = await client.query<{
            id: string;
            nature: 'PAYABLE' | 'RECEIVABLE';
            version: number;
            canceled_at: Date | null;
          }>(
            `SELECT id, nature, version, canceled_at
               FROM planned_entries WHERE id = $1 AND household_id = $2 FOR UPDATE`,
            [entryId, householdId],
          );
          const entry = locked.rows[0];
          if (!entry) throw new DomainError('NOT_FOUND');
          if (entry.canceled_at !== null) {
            throw new DomainError('ALREADY_SETTLED', undefined, 'Esta conta foi cancelada.');
          }
          if (entry.version !== input.expectedVersion) {
            throw new DomainError('VERSION_CONFLICT', { currentVersion: entry.version });
          }

          const outstandingResult = await client.query<{ outstanding: string }>(
            'SELECT app.planned_entry_outstanding($1) AS outstanding',
            [entryId],
          );
          const outstanding = Number(outstandingResult.rows[0]?.outstanding ?? 0);
          if (outstanding <= 0) throw new DomainError('ALREADY_SETTLED');

          const tipos = entry.nature === 'PAYABLE' ? ['EXPENSE', 'CARD_PURCHASE'] : ['INCOME'];

          // `FOR UPDATE` nas transações: duas compensações simultâneas com a
          // mesma transação precisam serializar aqui, senão as duas passariam
          // na checagem e o índice único rejeitaria a segunda com erro de banco.
          const escolhidas = await client.query<{
            id: string;
            amount_minor: string;
            account_id: string;
          }>(
            `SELECT t.id, t.amount_minor, t.account_id
               FROM transactions t
              WHERE t.id = ANY($1::uuid[])
                AND t.household_id = $2
                AND t.transaction_type = ANY($3::text[])
                AND t.status = 'POSTED'
                AND t.source <> 'SETTLEMENT'
                AND t.reversed_transaction_id IS NULL
                AND NOT EXISTS (
                      SELECT 1 FROM transactions r
                       WHERE r.reversed_transaction_id = t.id AND r.status = 'POSTED')
                AND NOT EXISTS (
                      SELECT 1 FROM settlements s
                       WHERE s.transaction_id = t.id AND s.reversed_at IS NULL)
              FOR UPDATE`,
            [input.transactionIds, householdId, tipos],
          );

          if (escolhidas.rowCount !== input.transactionIds.length) {
            throw new DomainError(
              'VALIDATION_ERROR',
              undefined,
              'Alguma das movimentações escolhidas não serve: pode estar estornada, ' +
                'já usada em outra baixa, ou ser do tipo errado para esta conta.',
            );
          }

          const total = escolhidas.rows.reduce((soma, r) => soma + Number(r.amount_minor), 0);
          if (total > outstanding) {
            throw new DomainError('OUTSTANDING_AMOUNT_EXCEEDED', {
              outstandingMinor: outstanding,
            });
          }

          const criados: string[] = [];
          for (const [indice, tx] of escolhidas.rows.entries()) {
            const settlementId = randomUUID();
            await client.query(
              `INSERT INTO settlements (
                 id, household_id, planned_entry_id, transaction_id, account_id,
                 principal_amount_minor, net_amount_minor, kind, settled_at,
                 idempotency_key, created_by
               ) VALUES ($1, $2, $3, $4, $5, $6, 0, 'OFFSET', $7, $8, $9)`,
              [
                settlementId,
                householdId,
                entryId,
                tx.id,
                tx.account_id,
                Number(tx.amount_minor),
                input.settledAt,
                // Uma chave por transação: repetir o comando não duplica nada,
                // e a primeira baixa é a que `findByKey` encontra.
                indice === 0 ? input.idempotencyKey : `${input.idempotencyKey}:${indice}`,
                userId,
              ],
            );
            criados.push(settlementId);
          }

          await client.query(
            `UPDATE planned_entries
                SET status = app.planned_entry_status(id), version = version + 1
              WHERE id = $1`,
            [entryId],
          );

          await insertAuditLog(client, {
            householdId,
            actorUserId: userId,
            entityType: 'planned_entry',
            entityId: entryId,
            action: 'PLANNED_ENTRY_SETTLED_BY_OFFSET',
            metadata: { transactionIds: input.transactionIds, totalMinor: total },
            requestId: ctx.requestId,
          });

          return criados;
        },
      );

      const [plannedEntry, settlements] = await Promise.all([
        readPlannedEntry(userId, householdId, entryId),
        Promise.all(settlementIds.map((id) => this.get(userId, householdId, id))),
      ]);
      return {
        plannedEntry,
        settlements,
        offsetTotalMinor: settlements.reduce((soma, s) => soma + s.principalAmountMinor, 0),
      };
    },

    async reverse(
      userId: string,
      householdId: string,
      settlementId: string,
      input: ReverseSettlementRequest,
      ctx: RequestContext,
    ): Promise<SettleResponse> {
      const entryId = await withUserTransaction(
        db,
        userId,
        async (client) => {
          const { role } = await context(client, householdId, userId);
          if (!OPERATORS.includes(role)) throw new DomainError('INSUFFICIENT_PERMISSION');

          const locked = await client.query<{
            id: string;
            planned_entry_id: string;
            transaction_id: string;
            account_id: string;
            member_id: string;
            net_amount_minor: string;
            reversed_at: Date | null;
            description: string;
            competence_date: Date;
            category_id: string | null;
          }>(
            `SELECT s.id, s.planned_entry_id, s.transaction_id, s.account_id, s.net_amount_minor,
                    s.reversed_at, t.description, t.competence_date, t.category_id, t.member_id
               FROM settlements s
               JOIN transactions t ON t.id = s.transaction_id
              WHERE s.id = $1 AND s.household_id = $2
              FOR UPDATE OF s`,
            [settlementId, householdId],
          );
          const settlement = locked.rows[0];
          if (!settlement) throw new DomainError('NOT_FOUND');
          if (settlement.reversed_at !== null) {
            throw new DomainError('TRANSACTION_ALREADY_REVERSED');
          }

          try {
            await client.query(
              `INSERT INTO transactions (
                 household_id, transaction_type, description, amount_minor, competence_date,
                 account_id, member_id, category_id, source, status, reason,
                 reversed_transaction_id, idempotency_key, created_by
               ) VALUES (
                 $1, 'REVERSAL', $2, $3, $4, $5, $6, $7, 'SETTLEMENT', 'POSTED', $8, $9, $10, $11
               )`,
              [
                householdId,
                `Estorno de baixa · ${settlement.description}`,
                Number(settlement.net_amount_minor),
                settlement.competence_date,
                settlement.account_id,
                settlement.member_id,
                settlement.category_id,
                input.reason,
                settlement.transaction_id,
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
            `UPDATE transactions
                SET status = 'REVERSED', reversed_at = now(), reason = $2, version = version + 1
              WHERE id = $1`,
            [settlement.transaction_id, input.reason],
          );

          await client.query(
            `UPDATE settlements
                SET reversed_at = now(), reversed_by = $2, reversal_reason = $3
              WHERE id = $1`,
            [settlementId, userId, input.reason],
          );

          // A conta prevista reabre sozinha: o status é derivado do saldo, que
          // volta a existir quando a baixa deixa de contar.
          await client.query(
            `UPDATE planned_entries
                SET status = app.planned_entry_status(id), version = version + 1
              WHERE id = $1`,
            [settlement.planned_entry_id],
          );

          await insertAuditLog(client, {
            householdId,
            actorUserId: userId,
            entityType: 'settlement',
            entityId: settlementId,
            action: 'SETTLEMENT_REVERSED',
            metadata: { reason: input.reason },
            requestId: ctx.requestId,
          });

          return settlement.planned_entry_id;
        },
        { isolation: 'SERIALIZABLE' },
      );

      const [plannedEntry, settlement] = await Promise.all([
        readPlannedEntry(userId, householdId, entryId),
        this.get(userId, householdId, settlementId),
      ]);
      return { plannedEntry, settlement };
    },
  };
}
