/**
 * Supervisão familiar — aprovar ou recusar lançamentos (docs/04 §16; tela 3c).
 *
 * Invariantes garantidas aqui:
 *  - Enquanto pendente, a movimentação não afeta saldo, limite nem relatório.
 *    Isso não é uma regra escrita neste arquivo: é consequência de a linha
 *    nascer com `status = 'PENDING_APPROVAL'` e de TODO cálculo somar apenas
 *    `POSTED`. Aprovar é uma troca de status; recusar também.
 *  - O conteúdo enviado é preservado nos dois desfechos — recusado não é
 *    apagado, vira `REJECTED` e continua auditável.
 *  - Ninguém aprova o próprio pedido, nem mesmo quem tem perfil para decidir.
 *  - Duas pessoas decidindo ao mesmo tempo: `expectedVersion` derruba a segunda.
 */

import { DomainError } from '@ff/domain';
import type {
  ApprovalFilter,
  ApprovalList,
  ApprovalRequest,
  DecideApprovalRequest,
  Transaction,
} from '@ff/api-contracts';
import { withUserTransaction, type Database, type PoolClient } from '../../db/pool.js';
import { insertAuditLog } from '../auth/repository.js';
import type { RequestContext } from '../auth/service.js';
import { attachPurchaseToStatement } from '../card/statement.js';

/** Perfis que decidem aprovação (STATES-AND-MATRICES §2). */
const DECIDERS = ['OWNER', 'ADMIN', 'ADULT'];

type ApprovalRow = {
  id: string;
  household_id: string;
  status: ApprovalRequest['status'];
  requested_by_member_id: string;
  requested_by_name: string;
  requested_by_color: string | null;
  rule_mode: ApprovalRequest['ruleMode'];
  rule_threshold_minor: string | null;
  account_balance_minor: string;
  decided_by_name: string | null;
  decided_at: Date | null;
  decision_message: string | null;
  created_at: Date;
  version: number;
  // Colunas da movimentação proposta, no mesmo formato do módulo de transações.
  t_id: string;
  transaction_type: Transaction['transactionType'];
  description: string;
  amount_minor: string;
  occurred_at: Date;
  competence_date: Date;
  account_id: string;
  account_name: string | null;
  member_id: string;
  member_name: string | null;
  category_id: string | null;
  category_name: string | null;
  counterparty_name: string | null;
  source: Transaction['source'];
  t_status: Transaction['status'];
  notes: string | null;
  t_version: number;
};

const SELECT = `
  ar.id, ar.household_id, ar.status, ar.requested_by_member_id,
  rm.display_name AS requested_by_name, rm.color AS requested_by_color,
  ar.rule_mode, ar.rule_threshold_minor,
  app.account_balance(t.account_id) AS account_balance_minor,
  dm.display_name AS decided_by_name, ar.decided_at, ar.decision_message,
  ar.created_at, ar.version,
  t.id AS t_id, t.transaction_type, t.description, t.amount_minor, t.occurred_at,
  t.competence_date, t.account_id, a.name AS account_name, t.member_id,
  tm.display_name AS member_name, t.category_id, c.name AS category_name,
  cp.name AS counterparty_name, t.source, t.status AS t_status, t.notes, t.version AS t_version
  FROM approval_requests ar
  JOIN transactions t ON t.id = ar.transaction_id
  JOIN household_members rm ON rm.id = ar.requested_by_member_id
  LEFT JOIN household_members dm ON dm.id = ar.decided_by_member_id
  LEFT JOIN accounts a ON a.id = t.account_id
  LEFT JOIN household_members tm ON tm.id = t.member_id
  LEFT JOIN categories c ON c.id = t.category_id
  LEFT JOIN counterparties cp ON cp.id = t.counterparty_id
`;

function toApprovalRequest(row: ApprovalRow): ApprovalRequest {
  return {
    id: row.id,
    householdId: row.household_id,
    status: row.status,
    transaction: {
      id: row.t_id,
      householdId: row.household_id,
      transactionType: row.transaction_type,
      description: row.description,
      amountMinor: Number(row.amount_minor),
      occurredAt: row.occurred_at.toISOString(),
      competenceDate: row.competence_date.toISOString().slice(0, 10),
      accountId: row.account_id,
      accountName: row.account_name,
      destinationAccountId: null,
      destinationAccountName: null,
      memberId: row.member_id,
      memberName: row.member_name,
      categoryId: row.category_id,
      categoryName: row.category_name,
      counterpartyName: row.counterparty_name,
      source: row.source,
      status: row.t_status,
      notes: row.notes,
      reason: null,
      reversalTransactionId: null,
      reversalReason: null,
      reversedByName: null,
      reversedTransactionId: null,
      plannedEntryId: null,
      allocations: [],
      createdByName: row.requested_by_name,
      version: row.t_version,
    },
    requestedByMemberId: row.requested_by_member_id,
    requestedByName: row.requested_by_name,
    requestedByColor: row.requested_by_color,
    ruleMode: row.rule_mode,
    ruleThresholdMinor: row.rule_threshold_minor === null ? null : Number(row.rule_threshold_minor),
    accountBalanceMinor: Number(row.account_balance_minor),
    decidedByName: row.decided_by_name,
    decidedAt: row.decided_at === null ? null : row.decided_at.toISOString(),
    decisionMessage: row.decision_message,
    createdAt: row.created_at.toISOString(),
    version: row.version,
  };
}

async function memberContext(
  client: PoolClient,
  householdId: string,
  userId: string,
): Promise<{ role: string; memberId: string }> {
  const result = await client.query<{ role: string; member_id: string }>(
    `SELECT role, id AS member_id FROM household_members
      WHERE household_id = $1 AND user_id = $2 AND status = 'ACTIVE'`,
    [householdId, userId],
  );
  const row = result.rows[0];
  if (!row) throw new DomainError('HOUSEHOLD_NOT_FOUND');
  return { role: row.role, memberId: row.member_id };
}

export type ApprovalService = ReturnType<typeof createApprovalService>;

export function createApprovalService(deps: { readonly db: Database }) {
  const { db } = deps;

  async function readOne(client: PoolClient, approvalId: string): Promise<ApprovalRequest> {
    const result = await client.query<ApprovalRow>(`SELECT ${SELECT} WHERE ar.id = $1`, [
      approvalId,
    ]);
    const row = result.rows[0];
    if (!row) throw new DomainError('NOT_FOUND');
    return toApprovalRequest(row);
  }

  /**
   * Decisão única para aprovar e recusar: as duas trocam status, gravam quem
   * decidiu e auditam. A diferença é o status final e, na aprovação, anexar a
   * compra à fatura — que só agora passa a consumir limite.
   */
  async function decide(
    userId: string,
    householdId: string,
    approvalId: string,
    input: DecideApprovalRequest,
    outcome: 'APPROVED' | 'REJECTED',
    ctx: RequestContext,
  ): Promise<ApprovalRequest> {
    return withUserTransaction(
      db,
      userId,
      async (client) => {
        const { role, memberId } = await memberContext(client, householdId, userId);
        if (!DECIDERS.includes(role)) throw new DomainError('INSUFFICIENT_PERMISSION');

        const current = await client.query<{
          id: string;
          status: ApprovalRequest['status'];
          version: number;
          transaction_id: string;
          requested_by_member_id: string;
          account_id: string;
          amount_minor: string;
          transaction_type: Transaction['transactionType'];
          occurred_at: Date;
        }>(
          `SELECT ar.id, ar.status, ar.version, ar.transaction_id, ar.requested_by_member_id,
                  t.account_id, t.amount_minor, t.transaction_type, t.occurred_at
             FROM approval_requests ar
             JOIN transactions t ON t.id = ar.transaction_id
            WHERE ar.id = $1 AND ar.household_id = $2
              FOR UPDATE OF ar`,
          [approvalId, householdId],
        );
        const row = current.rows[0];
        if (!row) throw new DomainError('NOT_FOUND');
        if (row.version !== input.expectedVersion) {
          throw new DomainError('VERSION_CONFLICT', { currentVersion: row.version });
        }
        if (row.status !== 'PENDING') {
          throw new DomainError(
            'ALREADY_SETTLED',
            { status: row.status },
            'Este pedido já foi decidido.',
          );
        }
        // Supervisão que se autoaprova não supervisiona nada.
        if (row.requested_by_member_id === memberId) {
          throw new DomainError(
            'INSUFFICIENT_PERMISSION',
            undefined,
            'Você não pode decidir o próprio pedido.',
          );
        }

        await client.query(
          `UPDATE approval_requests
              SET status = $2, decided_by_member_id = $3, decided_by_user_id = $4,
                  decided_at = now(), decision_message = $5, version = version + 1
            WHERE id = $1`,
          [approvalId, outcome, memberId, userId, input.message ?? null],
        );

        await client.query(
          `UPDATE transactions SET status = $2, version = version + 1 WHERE id = $1`,
          [row.transaction_id, outcome === 'APPROVED' ? 'POSTED' : 'REJECTED'],
        );

        // Compra no cartão aprovada entra na fatura do ciclo AGORA — enquanto
        // pendente ela ficou de fora de propósito, para não consumir limite.
        if (outcome === 'APPROVED' && row.transaction_type === 'CARD_PURCHASE') {
          await attachPurchaseToStatement(
            client,
            householdId,
            row.account_id,
            row.transaction_id,
            Number(row.amount_minor),
            row.occurred_at.toISOString().slice(0, 10),
          );
        }

        await insertAuditLog(client, {
          householdId,
          actorUserId: userId,
          entityType: 'approval_request',
          entityId: approvalId,
          action: outcome === 'APPROVED' ? 'APPROVAL_GRANTED' : 'APPROVAL_REJECTED',
          beforeData: { status: 'PENDING' },
          afterData: { status: outcome, amountMinor: Number(row.amount_minor) },
          ...(input.message === undefined ? {} : { metadata: { message: input.message } }),
          requestId: ctx.requestId,
        });

        return readOne(client, approvalId);
      },
      { isolation: 'SERIALIZABLE' },
    );
  }

  return {
    /**
     * Lista os pedidos que a pessoa pode ver: adulto vê os da família, filho vê
     * apenas os próprios — quem filtra é a RLS, não este SQL.
     */
    async list(userId: string, householdId: string, filter: ApprovalFilter): Promise<ApprovalList> {
      return withUserTransaction(
        db,
        userId,
        async (client) => {
          await memberContext(client, householdId, userId);

          const params: unknown[] = [householdId];
          let statusFilter = '';
          if (filter.status !== undefined) {
            params.push(filter.status);
            statusFilter = ` AND ar.status = $${params.length}`;
          }
          params.push(filter.pageSize);

          const result = await client.query<ApprovalRow>(
            `SELECT ${SELECT}
              WHERE ar.household_id = $1${statusFilter}
              ORDER BY ar.status = 'PENDING' DESC, ar.created_at DESC
              LIMIT $${params.length}`,
            params,
          );

          const pending = await client.query<{ count: string }>(
            `SELECT count(*)::text AS count FROM approval_requests
              WHERE household_id = $1 AND status = 'PENDING'`,
            [householdId],
          );

          return {
            items: result.rows.map(toApprovalRequest),
            pendingCount: Number(pending.rows[0]?.count ?? 0),
          };
        },
        { readOnly: true },
      );
    },

    async get(userId: string, householdId: string, approvalId: string): Promise<ApprovalRequest> {
      return withUserTransaction(
        db,
        userId,
        async (client) => {
          await memberContext(client, householdId, userId);
          const result = await client.query<ApprovalRow>(
            `SELECT ${SELECT} WHERE ar.id = $1 AND ar.household_id = $2`,
            [approvalId, householdId],
          );
          const row = result.rows[0];
          if (!row) throw new DomainError('NOT_FOUND');
          return toApprovalRequest(row);
        },
        { readOnly: true },
      );
    },

    async approve(
      userId: string,
      householdId: string,
      approvalId: string,
      input: DecideApprovalRequest,
      ctx: RequestContext,
    ): Promise<ApprovalRequest> {
      return decide(userId, householdId, approvalId, input, 'APPROVED', ctx);
    },

    async reject(
      userId: string,
      householdId: string,
      approvalId: string,
      input: DecideApprovalRequest,
      ctx: RequestContext,
    ): Promise<ApprovalRequest> {
      return decide(userId, householdId, approvalId, input, 'REJECTED', ctx);
    },
  };
}
