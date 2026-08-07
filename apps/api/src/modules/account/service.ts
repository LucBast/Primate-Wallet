/**
 * Contas, cartões e categorias (docs/05 §4.2, §4.9; telas 2a–2d).
 *
 * Pontos que o serviço garante além da RLS:
 *  - o saldo devolvido é sempre DERIVADO por `app.account_balance` — o cliente
 *    nunca envia saldo como fonte de verdade (docs/09 §1);
 *  - ajuste de saldo exige motivo, vira uma movimentação própria do tipo
 *    ADJUSTMENT e é auditado (docs/04 §18);
 *  - arquivar impede novos usos e preserva o histórico (docs/04 §17).
 */

import { randomUUID } from 'node:crypto';
import { DomainError, minor, subtract, type MinorUnits } from '@ff/domain';
import type {
  Account,
  AccountPermission,
  AccountStatementRow,
  AdjustBalanceRequest,
  AdjustBalanceResponse,
  Category,
  CreateAccountRequest,
  CreateCategoryRequest,
  SetAccountPermissionsRequest,
  UpdateAccountRequest,
  UpdateCategoryRequest,
} from '@ff/api-contracts';
import { withUserTransaction, type Database, type PoolClient } from '../../db/pool.js';
import { insertAuditLog } from '../auth/repository.js';
import type { RequestContext } from '../auth/service.js';

type AccountRow = {
  id: string;
  household_id: string;
  name: string;
  account_type: Account['accountType'];
  institution_name: string | null;
  currency_code: string;
  opening_balance_minor: number;
  opening_balance_date: Date;
  primary_member_id: string | null;
  primary_member_name: string | null;
  visibility_scope: Account['visibilityScope'];
  color: string | null;
  icon: string | null;
  card_brand: string | null;
  card_last_four: string | null;
  credit_limit_minor: number | null;
  closing_day: number | null;
  due_day: number | null;
  default_payment_account_id: string | null;
  balance_minor: number;
  available_limit_minor: number | null;
  archived_at: Date | null;
  version: number;
};

const ACCOUNT_SELECT = `
  a.id, a.household_id, a.name, a.account_type, a.institution_name, a.currency_code,
  a.opening_balance_minor, a.opening_balance_date, a.primary_member_id,
  m.display_name AS primary_member_name,
  a.visibility_scope, a.color, a.icon, a.card_brand, a.card_last_four,
  a.credit_limit_minor, a.closing_day, a.due_day, a.default_payment_account_id,
  app.account_balance(a.id) AS balance_minor,
  CASE WHEN a.account_type = 'CREDIT_CARD' THEN app.card_available_limit(a.id) END
    AS available_limit_minor,
  a.archived_at, a.version
`;

function toAccount(row: AccountRow): Account {
  return {
    id: row.id,
    householdId: row.household_id,
    name: row.name,
    accountType: row.account_type,
    institutionName: row.institution_name,
    currencyCode: row.currency_code,
    openingBalanceMinor: row.opening_balance_minor,
    openingBalanceDate: row.opening_balance_date.toISOString().slice(0, 10),
    primaryMemberId: row.primary_member_id,
    primaryMemberName: row.primary_member_name,
    visibilityScope: row.visibility_scope,
    color: row.color,
    icon: row.icon,
    cardBrand: row.card_brand,
    cardLastFour: row.card_last_four,
    creditLimitMinor: row.credit_limit_minor,
    closingDay: row.closing_day,
    dueDay: row.due_day,
    defaultPaymentAccountId: row.default_payment_account_id,
    balanceMinor: row.balance_minor,
    availableLimitMinor: row.available_limit_minor,
    archivedAt: row.archived_at?.toISOString() ?? null,
    version: row.version,
  };
}

type CategoryRow = {
  id: string;
  household_id: string;
  parent_id: string | null;
  name: string;
  nature: Category['nature'];
  icon: string | null;
  color: string | null;
  sort_order: number;
  is_system: boolean;
  archived_at: Date | null;
};

function toCategory(row: CategoryRow): Category {
  return {
    id: row.id,
    householdId: row.household_id,
    parentId: row.parent_id,
    name: row.name,
    nature: row.nature,
    icon: row.icon,
    color: row.color,
    sortOrder: row.sort_order,
    isSystem: row.is_system,
    archivedAt: row.archived_at?.toISOString() ?? null,
  };
}

/** Categorias padrão em pt-BR, criadas junto com a família. */
export const DEFAULT_CATEGORIES: ReadonlyArray<{
  name: string;
  nature: 'EXPENSE' | 'INCOME';
  icon: string;
}> = [
  { name: 'Moradia', nature: 'EXPENSE', icon: 'house' },
  { name: 'Alimentação', nature: 'EXPENSE', icon: 'utensils' },
  { name: 'Transporte', nature: 'EXPENSE', icon: 'car' },
  { name: 'Saúde', nature: 'EXPENSE', icon: 'heart-pulse' },
  { name: 'Educação', nature: 'EXPENSE', icon: 'graduation-cap' },
  { name: 'Lazer', nature: 'EXPENSE', icon: 'ticket' },
  { name: 'Contas de casa', nature: 'EXPENSE', icon: 'zap' },
  { name: 'Compras', nature: 'EXPENSE', icon: 'shopping-bag' },
  { name: 'Outros', nature: 'EXPENSE', icon: 'ellipsis' },
  { name: 'Salário', nature: 'INCOME', icon: 'wallet' },
  { name: 'Benefícios', nature: 'INCOME', icon: 'gift' },
  { name: 'Rendimentos', nature: 'INCOME', icon: 'trending-up' },
  { name: 'Outras receitas', nature: 'INCOME', icon: 'plus' },
];

/** Cria as categorias padrão. Chamado na criação da família. */
export async function seedDefaultCategories(
  client: PoolClient,
  householdId: string,
): Promise<void> {
  for (const [index, category] of DEFAULT_CATEGORIES.entries()) {
    await client.query(
      `INSERT INTO categories (household_id, name, nature, icon, sort_order, is_system)
       VALUES ($1, $2, $3, $4, $5, true)`,
      [householdId, category.name, category.nature, category.icon, index],
    );
  }
}

/** Papel do usuário, ou erro — a checagem de serviço que acompanha a RLS. */
async function requireRole(
  client: PoolClient,
  householdId: string,
  userId: string,
  allowed: readonly string[],
): Promise<string> {
  const result = await client.query<{ role: string }>(
    `SELECT role FROM household_members
      WHERE household_id = $1 AND user_id = $2 AND status = 'ACTIVE'`,
    [householdId, userId],
  );
  const role = result.rows[0]?.role;
  if (!role) throw new DomainError('HOUSEHOLD_NOT_FOUND');
  if (!allowed.includes(role)) throw new DomainError('INSUFFICIENT_PERMISSION');
  return role;
}

const OPERATORS = ['OWNER', 'ADMIN', 'ADULT'];
const ADMINS = ['OWNER', 'ADMIN'];
const EVERYONE = ['OWNER', 'ADMIN', 'ADULT', 'MEMBER', 'CHILD'];

export type AccountService = ReturnType<typeof createAccountService>;

export function createAccountService(deps: { readonly db: Database }) {
  const { db } = deps;

  /** Substitui as permissões explícitas de uma conta. */
  async function replaceAccountMembers(
    client: PoolClient,
    householdId: string,
    accountId: string,
    memberIds: readonly string[],
  ): Promise<void> {
    await client.query('DELETE FROM account_member_permissions WHERE account_id = $1', [accountId]);
    for (const memberId of memberIds) {
      await client.query(
        `INSERT INTO account_member_permissions
           (household_id, account_id, member_id, can_view, can_transact, can_edit)
         VALUES ($1, $2, $3, true, true, false)`,
        [householdId, accountId, memberId],
      );
    }
  }

  return {
    async list(userId: string, householdId: string, includeArchived: boolean): Promise<Account[]> {
      return withUserTransaction(
        db,
        userId,
        async (client) => {
          await requireRole(client, householdId, userId, EVERYONE);
          const result = await client.query<AccountRow>(
            `SELECT ${ACCOUNT_SELECT}
               FROM accounts a
               LEFT JOIN household_members m ON m.id = a.primary_member_id
              WHERE a.household_id = $1
                AND ($2::boolean OR a.archived_at IS NULL)
              ORDER BY (a.account_type = 'CREDIT_CARD'), a.name`,
            [householdId, includeArchived],
          );
          return result.rows.map(toAccount);
        },
        { readOnly: true },
      );
    },

    async get(userId: string, householdId: string, accountId: string): Promise<Account> {
      return withUserTransaction(
        db,
        userId,
        async (client) => {
          await requireRole(client, householdId, userId, EVERYONE);
          const result = await client.query<AccountRow>(
            `SELECT ${ACCOUNT_SELECT}
               FROM accounts a
               LEFT JOIN household_members m ON m.id = a.primary_member_id
              WHERE a.id = $1 AND a.household_id = $2`,
            [accountId, householdId],
          );
          const row = result.rows[0];
          if (!row) throw new DomainError('ACCOUNT_NOT_FOUND');
          return toAccount(row);
        },
        { readOnly: true },
      );
    },

    async create(
      userId: string,
      householdId: string,
      input: CreateAccountRequest,
      ctx: RequestContext,
    ): Promise<Account> {
      return withUserTransaction(db, userId, async (client) => {
        await requireRole(client, householdId, userId, OPERATORS);

        const accountId = randomUUID();
        await client.query(
          `INSERT INTO accounts (
             id, household_id, name, account_type, institution_name, currency_code,
             opening_balance_minor, opening_balance_date, primary_member_id, visibility_scope,
             color, icon, card_brand, card_last_four, credit_limit_minor, closing_day, due_day,
             default_payment_account_id, created_by
           ) VALUES (
             $1, $2, $3, $4, $5, upper($6), $7, COALESCE($8::date, CURRENT_DATE), $9, $10,
             $11, $12, $13, $14, $15, $16, $17, $18, $19
           )`,
          [
            accountId,
            householdId,
            input.name,
            input.accountType,
            input.institutionName ?? null,
            input.currencyCode,
            input.openingBalanceMinor,
            input.openingBalanceDate ?? null,
            input.primaryMemberId ?? null,
            input.visibilityScope,
            input.color ?? null,
            input.icon ?? null,
            input.cardBrand ?? null,
            input.cardLastFour ?? null,
            input.creditLimitMinor ?? null,
            input.closingDay ?? null,
            input.dueDay ?? null,
            input.defaultPaymentAccountId ?? null,
            userId,
          ],
        );

        if (input.visibilityScope === 'SELECTED_MEMBERS') {
          await replaceAccountMembers(
            client,
            householdId,
            accountId,
            input.selectedMemberIds ?? [],
          );
        }

        await insertAuditLog(client, {
          householdId,
          actorUserId: userId,
          entityType: 'account',
          entityId: accountId,
          action: 'ACCOUNT_CREATED',
          afterData: { name: input.name, accountType: input.accountType },
          requestId: ctx.requestId,
        });

        const result = await client.query<AccountRow>(
          `SELECT ${ACCOUNT_SELECT}
             FROM accounts a
             LEFT JOIN household_members m ON m.id = a.primary_member_id
            WHERE a.id = $1`,
          [accountId],
        );
        const row = result.rows[0];
        /* c8 ignore next */
        if (!row) throw new DomainError('INTERNAL_ERROR');
        return toAccount(row);
      });
    },

    async update(
      userId: string,
      householdId: string,
      accountId: string,
      input: UpdateAccountRequest,
      ctx: RequestContext,
    ): Promise<Account> {
      return withUserTransaction(db, userId, async (client) => {
        await requireRole(client, householdId, userId, OPERATORS);

        const current = await client.query<{
          version: number;
          name: string;
          visibility_scope: string;
          archived_at: Date | null;
        }>(
          `SELECT version, name, visibility_scope, archived_at FROM accounts
            WHERE id = $1 AND household_id = $2 FOR UPDATE`,
          [accountId, householdId],
        );
        const before = current.rows[0];
        if (!before) throw new DomainError('ACCOUNT_NOT_FOUND');
        if (before.archived_at !== null) throw new DomainError('ACCOUNT_ARCHIVED');
        if (before.version !== input.expectedVersion) {
          throw new DomainError('VERSION_CONFLICT', { currentVersion: before.version });
        }

        await client.query(
          `UPDATE accounts SET
             name = COALESCE($3::text, name),
             institution_name = CASE WHEN $4::boolean THEN $5::text ELSE institution_name END,
             primary_member_id = CASE WHEN $6::boolean THEN $7::uuid ELSE primary_member_id END,
             visibility_scope = COALESCE($8::text, visibility_scope),
             color = CASE WHEN $9::boolean THEN $10::text ELSE color END,
             icon = CASE WHEN $11::boolean THEN $12::text ELSE icon END,
             card_brand = CASE WHEN $13::boolean THEN $14::text ELSE card_brand END,
             credit_limit_minor = COALESCE($15::bigint, credit_limit_minor),
             closing_day = COALESCE($16::smallint, closing_day),
             due_day = COALESCE($17::smallint, due_day),
             default_payment_account_id =
               CASE WHEN $18::boolean THEN $19::uuid ELSE default_payment_account_id END,
             version = version + 1
           WHERE id = $1 AND household_id = $2`,
          [
            accountId,
            householdId,
            input.name ?? null,
            input.institutionName !== undefined,
            input.institutionName ?? null,
            input.primaryMemberId !== undefined,
            input.primaryMemberId ?? null,
            input.visibilityScope ?? null,
            input.color !== undefined,
            input.color ?? null,
            input.icon !== undefined,
            input.icon ?? null,
            input.cardBrand !== undefined,
            input.cardBrand ?? null,
            input.creditLimitMinor ?? null,
            input.closingDay ?? null,
            input.dueDay ?? null,
            input.defaultPaymentAccountId !== undefined,
            input.defaultPaymentAccountId ?? null,
          ],
        );

        if (input.selectedMemberIds !== undefined) {
          await replaceAccountMembers(client, householdId, accountId, input.selectedMemberIds);
        }

        await insertAuditLog(client, {
          householdId,
          actorUserId: userId,
          entityType: 'account',
          entityId: accountId,
          action: 'ACCOUNT_UPDATED',
          beforeData: { name: before.name, visibilityScope: before.visibility_scope },
          afterData: { name: input.name ?? before.name },
          requestId: ctx.requestId,
        });

        const result = await client.query<AccountRow>(
          `SELECT ${ACCOUNT_SELECT}
             FROM accounts a
             LEFT JOIN household_members m ON m.id = a.primary_member_id
            WHERE a.id = $1`,
          [accountId],
        );
        const row = result.rows[0];
        /* c8 ignore next */
        if (!row) throw new DomainError('ACCOUNT_NOT_FOUND');
        return toAccount(row);
      });
    },

    /** Arquivar impede novos usos e mantém o histórico (docs/04 §17). */
    async archive(
      userId: string,
      householdId: string,
      accountId: string,
      archived: boolean,
      ctx: RequestContext,
    ): Promise<Account> {
      return withUserTransaction(db, userId, async (client) => {
        await requireRole(client, householdId, userId, OPERATORS);

        const result = await client.query(
          `UPDATE accounts
              SET archived_at = CASE WHEN $3::boolean THEN now() ELSE NULL END,
                  version = version + 1
            WHERE id = $1 AND household_id = $2`,
          [accountId, householdId, archived],
        );
        if ((result.rowCount ?? 0) === 0) throw new DomainError('ACCOUNT_NOT_FOUND');

        await insertAuditLog(client, {
          householdId,
          actorUserId: userId,
          entityType: 'account',
          entityId: accountId,
          action: archived ? 'ACCOUNT_ARCHIVED' : 'ACCOUNT_UNARCHIVED',
          requestId: ctx.requestId,
        });

        const row = await client.query<AccountRow>(
          `SELECT ${ACCOUNT_SELECT}
             FROM accounts a
             LEFT JOIN household_members m ON m.id = a.primary_member_id
            WHERE a.id = $1`,
          [accountId],
        );
        /* c8 ignore next */
        if (!row.rows[0]) throw new DomainError('ACCOUNT_NOT_FOUND');
        return toAccount(row.rows[0]);
      });
    },

    /**
     * Ajuste de saldo (tela 2d). Só Proprietário e Admin, motivo obrigatório.
     * Gera uma movimentação ADJUSTMENT com a DIFERENÇA — o histórico anterior
     * não é reescrito.
     */
    async adjustBalance(
      userId: string,
      householdId: string,
      accountId: string,
      input: AdjustBalanceRequest,
      ctx: RequestContext,
    ): Promise<AdjustBalanceResponse> {
      return withUserTransaction(
        db,
        userId,
        async (client) => {
          await requireRole(client, householdId, userId, ADMINS);

          const current = await client.query<{
            version: number;
            balance_minor: number;
            archived_at: Date | null;
          }>(
            `SELECT a.version, app.account_balance(a.id) AS balance_minor, a.archived_at
               FROM accounts a WHERE a.id = $1 AND a.household_id = $2 FOR UPDATE`,
            [accountId, householdId],
          );
          const account = current.rows[0];
          if (!account) throw new DomainError('ACCOUNT_NOT_FOUND');
          if (account.archived_at !== null) throw new DomainError('ACCOUNT_ARCHIVED');
          if (account.version !== input.expectedVersion) {
            throw new DomainError('VERSION_CONFLICT', { currentVersion: account.version });
          }

          const difference: MinorUnits = subtract(
            minor(input.newBalanceMinor),
            minor(account.balance_minor),
          );
          if (difference === 0) {
            throw new DomainError(
              'VALIDATION_ERROR',
              { balanceMinor: account.balance_minor },
              'O saldo informado é igual ao saldo atual: não há ajuste a fazer.',
            );
          }

          const member = await client.query<{ id: string }>(
            `SELECT id FROM household_members
              WHERE household_id = $1 AND user_id = $2 AND status = 'ACTIVE'`,
            [householdId, userId],
          );
          const memberId = member.rows[0]?.id;
          /* c8 ignore next */
          if (!memberId) throw new DomainError('HOUSEHOLD_NOT_FOUND');

          const transactionId = randomUUID();
          try {
            await client.query(
              `INSERT INTO transactions (
                 id, household_id, transaction_type, description, amount_minor, competence_date,
                 account_id, member_id, source, status, reason, idempotency_key, created_by
               ) VALUES (
                 $1, $2, 'ADJUSTMENT', $3, $4, CURRENT_DATE, $5, $6, 'MANUAL', 'POSTED', $7, $8, $9
               )`,
              [
                transactionId,
                householdId,
                'Ajuste de saldo',
                difference,
                accountId,
                memberId,
                input.reason,
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

          await client.query('UPDATE accounts SET version = version + 1 WHERE id = $1', [
            accountId,
          ]);

          await insertAuditLog(client, {
            householdId,
            actorUserId: userId,
            entityType: 'account',
            entityId: accountId,
            action: 'BALANCE_ADJUSTED',
            beforeData: { balanceMinor: account.balance_minor },
            afterData: { balanceMinor: input.newBalanceMinor },
            metadata: { reason: input.reason, adjustmentMinor: difference },
            requestId: ctx.requestId,
          });

          const updated = await client.query<AccountRow>(
            `SELECT ${ACCOUNT_SELECT}
               FROM accounts a
               LEFT JOIN household_members m ON m.id = a.primary_member_id
              WHERE a.id = $1`,
            [accountId],
          );
          /* c8 ignore next */
          if (!updated.rows[0]) throw new DomainError('ACCOUNT_NOT_FOUND');

          return {
            account: toAccount(updated.rows[0]),
            adjustmentMinor: difference,
            transactionId,
          };
        },
        { isolation: 'SERIALIZABLE' },
      );
    },

    /** Extrato da conta (tela 2c), com o efeito já assinado para esta conta. */
    async statement(
      userId: string,
      householdId: string,
      accountId: string,
      from: string,
      to: string,
    ): Promise<AccountStatementRow[]> {
      return withUserTransaction(
        db,
        userId,
        async (client) => {
          await requireRole(client, householdId, userId, EVERYONE);
          const result = await client.query<{
            id: string;
            transaction_type: string;
            description: string;
            amount_minor: number;
            signed_amount_minor: number;
            occurred_at: Date;
            competence_date: Date;
            status: string;
            member_name: string | null;
            category_name: string | null;
            counterparty_name: string | null;
            reason: string | null;
            notes: string | null;
          }>(
            `SELECT t.id, t.transaction_type, t.description, t.amount_minor,
                    CASE
                      WHEN t.destination_account_id = $2 THEN t.amount_minor
                      WHEN t.transaction_type IN ('INCOME', 'REFUND', 'ADJUSTMENT')
                        THEN t.amount_minor
                      WHEN t.transaction_type = 'CARD_PURCHASE' THEN t.amount_minor
                      ELSE -t.amount_minor
                    END AS signed_amount_minor,
                    t.occurred_at, t.competence_date, t.status,
                    m.display_name AS member_name, c.name AS category_name,
                    cp.name AS counterparty_name, t.reason, t.notes
               FROM transactions t
               LEFT JOIN household_members m ON m.id = t.member_id
               LEFT JOIN categories c ON c.id = t.category_id
               LEFT JOIN counterparties cp ON cp.id = t.counterparty_id
              WHERE t.household_id = $1
                AND (t.account_id = $2 OR t.destination_account_id = $2)
                AND t.occurred_at >= $3::date
                AND t.occurred_at < ($4::date + INTERVAL '1 day')
              ORDER BY t.occurred_at DESC, t.created_at DESC`,
            [householdId, accountId, from, to],
          );

          return result.rows.map((row) => ({
            id: row.id,
            transactionType: row.transaction_type,
            description: row.description,
            amountMinor: row.amount_minor,
            signedAmountMinor: row.signed_amount_minor,
            occurredAt: row.occurred_at.toISOString(),
            competenceDate: row.competence_date.toISOString().slice(0, 10),
            status: row.status,
            memberName: row.member_name,
            categoryName: row.category_name,
            counterpartyName: row.counterparty_name,
            reason: row.reason,
            notes: row.notes,
          }));
        },
        { readOnly: true },
      );
    },

    // ------------------------------------------------------------ permissões

    async listPermissions(
      userId: string,
      householdId: string,
      memberId: string,
    ): Promise<AccountPermission[]> {
      return withUserTransaction(
        db,
        userId,
        async (client) => {
          await requireRole(client, householdId, userId, ADMINS);
          const result = await client.query<{
            account_id: string;
            account_name: string;
            can_view: boolean;
            can_transact: boolean;
            can_edit: boolean;
          }>(
            `SELECT a.id AS account_id, a.name AS account_name,
                    COALESCE(p.can_view, false) AS can_view,
                    COALESCE(p.can_transact, false) AS can_transact,
                    COALESCE(p.can_edit, false) AS can_edit
               FROM accounts a
               LEFT JOIN account_member_permissions p
                 ON p.account_id = a.id AND p.member_id = $2
              WHERE a.household_id = $1 AND a.archived_at IS NULL
              ORDER BY a.name`,
            [householdId, memberId],
          );
          return result.rows.map((row) => ({
            accountId: row.account_id,
            accountName: row.account_name,
            memberId,
            canView: row.can_view,
            canTransact: row.can_transact,
            canEdit: row.can_edit,
          }));
        },
        { readOnly: true },
      );
    },

    async setPermissions(
      userId: string,
      householdId: string,
      memberId: string,
      input: SetAccountPermissionsRequest,
      ctx: RequestContext,
    ): Promise<AccountPermission[]> {
      return withUserTransaction(db, userId, async (client) => {
        await requireRole(client, householdId, userId, ADMINS);

        for (const permission of input.permissions) {
          if (!permission.canView) {
            await client.query(
              'DELETE FROM account_member_permissions WHERE account_id = $1 AND member_id = $2',
              [permission.accountId, memberId],
            );
            continue;
          }
          await client.query(
            `INSERT INTO account_member_permissions
               (household_id, account_id, member_id, can_view, can_transact, can_edit)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (account_id, member_id) DO UPDATE SET
               can_view = EXCLUDED.can_view,
               can_transact = EXCLUDED.can_transact,
               can_edit = EXCLUDED.can_edit`,
            [
              householdId,
              permission.accountId,
              memberId,
              permission.canView,
              permission.canTransact,
              permission.canEdit,
            ],
          );
        }

        await insertAuditLog(client, {
          householdId,
          actorUserId: userId,
          entityType: 'household_member',
          entityId: memberId,
          action: 'ACCOUNT_PERMISSIONS_UPDATED',
          afterData: { permissions: input.permissions.length },
          requestId: ctx.requestId,
        });

        const result = await client.query<{
          account_id: string;
          account_name: string;
          can_view: boolean;
          can_transact: boolean;
          can_edit: boolean;
        }>(
          `SELECT a.id AS account_id, a.name AS account_name,
                  COALESCE(p.can_view, false) AS can_view,
                  COALESCE(p.can_transact, false) AS can_transact,
                  COALESCE(p.can_edit, false) AS can_edit
             FROM accounts a
             LEFT JOIN account_member_permissions p
               ON p.account_id = a.id AND p.member_id = $2
            WHERE a.household_id = $1 AND a.archived_at IS NULL
            ORDER BY a.name`,
          [householdId, memberId],
        );
        return result.rows.map((row) => ({
          accountId: row.account_id,
          accountName: row.account_name,
          memberId,
          canView: row.can_view,
          canTransact: row.can_transact,
          canEdit: row.can_edit,
        }));
      });
    },

    // ------------------------------------------------------------ categorias

    async listCategories(
      userId: string,
      householdId: string,
      includeArchived: boolean,
    ): Promise<Category[]> {
      return withUserTransaction(
        db,
        userId,
        async (client) => {
          await requireRole(client, householdId, userId, EVERYONE);
          const result = await client.query<CategoryRow>(
            `SELECT id, household_id, parent_id, name, nature, icon, color, sort_order,
                    is_system, archived_at
               FROM categories
              WHERE household_id = $1 AND ($2::boolean OR archived_at IS NULL)
              ORDER BY nature, sort_order, name`,
            [householdId, includeArchived],
          );
          return result.rows.map(toCategory);
        },
        { readOnly: true },
      );
    },

    async createCategory(
      userId: string,
      householdId: string,
      input: CreateCategoryRequest,
      ctx: RequestContext,
    ): Promise<Category> {
      return withUserTransaction(db, userId, async (client) => {
        await requireRole(client, householdId, userId, OPERATORS);
        // A família nasce com categorias padrão, então repetir um nome é erro de
        // usuário, não falha do servidor: sem este mapeamento a violação de
        // unicidade sobe como 500 e a tela mostra "tente de novo" para sempre.
        const result = await client
          .query<CategoryRow>(
            `INSERT INTO categories (household_id, parent_id, name, nature, icon, color, sort_order)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING id, household_id, parent_id, name, nature, icon, color, sort_order,
                     is_system, archived_at`,
            [
              householdId,
              input.parentId ?? null,
              input.name,
              input.nature,
              input.icon ?? null,
              input.color ?? null,
              input.sortOrder,
            ],
          )
          .catch((cause: unknown) => {
            if (
              cause !== null &&
              typeof cause === 'object' &&
              'constraint' in cause &&
              cause.constraint === 'categories_household_name_unique'
            ) {
              throw new DomainError(
                'VALIDATION_ERROR',
                { name: input.name },
                'Já existe uma categoria com esse nome.',
              );
            }
            throw cause;
          });
        const row = result.rows[0];
        /* c8 ignore next */
        if (!row) throw new DomainError('INTERNAL_ERROR');

        await insertAuditLog(client, {
          householdId,
          actorUserId: userId,
          entityType: 'category',
          entityId: row.id,
          action: 'CATEGORY_CREATED',
          afterData: { name: row.name, nature: row.nature },
          requestId: ctx.requestId,
        });
        return toCategory(row);
      });
    },

    async updateCategory(
      userId: string,
      householdId: string,
      categoryId: string,
      input: UpdateCategoryRequest,
      ctx: RequestContext,
    ): Promise<Category> {
      return withUserTransaction(db, userId, async (client) => {
        await requireRole(client, householdId, userId, OPERATORS);
        const result = await client.query<CategoryRow>(
          `UPDATE categories SET
             name = COALESCE($3::text, name),
             icon = CASE WHEN $4::boolean THEN $5::text ELSE icon END,
             color = CASE WHEN $6::boolean THEN $7::text ELSE color END,
             sort_order = COALESCE($8::integer, sort_order),
             archived_at = CASE
               WHEN $9::boolean IS NULL THEN archived_at
               WHEN $9::boolean THEN COALESCE(archived_at, now())
               ELSE NULL
             END
           WHERE id = $1 AND household_id = $2
           RETURNING id, household_id, parent_id, name, nature, icon, color, sort_order,
                     is_system, archived_at`,
          [
            categoryId,
            householdId,
            input.name ?? null,
            input.icon !== undefined,
            input.icon ?? null,
            input.color !== undefined,
            input.color ?? null,
            input.sortOrder ?? null,
            input.archived ?? null,
          ],
        );
        const row = result.rows[0];
        if (!row) throw new DomainError('NOT_FOUND');

        await insertAuditLog(client, {
          householdId,
          actorUserId: userId,
          entityType: 'category',
          entityId: categoryId,
          action: 'CATEGORY_UPDATED',
          afterData: { name: row.name, archived: row.archived_at !== null },
          requestId: ctx.requestId,
        });
        return toCategory(row);
      });
    },
  };
}
