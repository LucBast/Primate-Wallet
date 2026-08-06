/**
 * Relatórios e dashboard (docs/04 §11; telas 1b e 4a–4d).
 *
 * Duas regras de leitura mandam em tudo aqui:
 *
 *  - COMPETÊNCIA (`ACCRUAL`) usa `competence_date`: a despesa aparece no mês em
 *    que foi gerada, mesmo que o dinheiro saia depois (é o caso da compra no
 *    cartão). CAIXA (`CASH`) usa `occurred_at` e considera só o que de fato
 *    movimentou conta bancária.
 *  - O que NÃO é receita nem despesa fica fora dos totais: transferência,
 *    pagamento de fatura, ajuste de saldo e qualquer linha estornada.
 *
 * Em CAIXA, a compra no cartão não conta — o que conta é o pagamento da fatura,
 * que é quando o dinheiro sai. É por isso que os dois modos dão números
 * diferentes, e por isso a UI nunca os mistura.
 */

import { DomainError, familyToday } from '@ff/domain';
import type {
  AccountBreakdown,
  CategoryBreakdown,
  Dashboard,
  Evolution,
  ExportRequest,
  ExportResult,
  MemberBreakdown,
  MonthlySummary,
  ReportMode,
  ReportQuery,
} from '@ff/api-contracts';
import { withUserTransaction, type Database, type PoolClient } from '../../db/pool.js';
import { insertAuditLog } from '../auth/repository.js';
import type { RequestContext } from '../auth/service.js';

/**
 * Fragmento SQL que seleciona as linhas que compõem receita e despesa no modo
 * pedido. Mantido em um lugar só: qualquer relatório novo herda a mesma regra.
 */
function scopeFor(mode: ReportMode): { dateColumn: string; typeFilter: string } {
  if (mode === 'ACCRUAL') {
    return {
      dateColumn: 't.competence_date',
      // Competência: compra no cartão conta como despesa; pagamento de fatura não.
      typeFilter: `t.transaction_type IN ('INCOME', 'EXPENSE', 'CARD_PURCHASE', 'REFUND')`,
    };
  }
  return {
    dateColumn: 't.occurred_at::date',
    // Caixa: o que moveu conta bancária. Compra no cartão não; a fatura paga sim.
    typeFilter: `t.transaction_type IN ('INCOME', 'EXPENSE', 'CARD_PAYMENT', 'REFUND')`,
  };
}

/** Sinal de cada tipo: receita soma, despesa subtrai. */
const INCOME_TYPES = `('INCOME', 'REFUND')`;
const EXPENSE_TYPES = `('EXPENSE', 'CARD_PURCHASE', 'CARD_PAYMENT')`;

async function context(
  client: PoolClient,
  householdId: string,
  userId: string,
): Promise<{ role: string; timezone: string; memberId: string }> {
  const result = await client.query<{ role: string; timezone: string; member_id: string }>(
    `SELECT m.role, h.timezone, m.id AS member_id
       FROM household_members m
       JOIN households h ON h.id = m.household_id
      WHERE m.household_id = $1 AND m.user_id = $2 AND m.status = 'ACTIVE'`,
    [householdId, userId],
  );
  const row = result.rows[0];
  if (!row) throw new DomainError('HOUSEHOLD_NOT_FOUND');
  return { role: row.role, timezone: row.timezone, memberId: row.member_id };
}

/** Mês anterior ao intervalo, para a comparação dos KPI cards. */
function previousRange(from: string, to: string): { from: string; to: string } {
  const start = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  const previousEnd = new Date(start.getTime() - 86_400_000);
  const span = end.getTime() - start.getTime();
  const previousStart = new Date(previousEnd.getTime() - span);
  return {
    from: previousStart.toISOString().slice(0, 10),
    to: previousEnd.toISOString().slice(0, 10),
  };
}

export type ReportService = ReturnType<typeof createReportService>;

export function createReportService(deps: { readonly db: Database }) {
  const { db } = deps;

  /** Receita e despesa do período, no modo pedido. */
  async function totalsFor(
    client: PoolClient,
    householdId: string,
    mode: ReportMode,
    from: string,
    to: string,
  ): Promise<{ incomeMinor: number; expenseMinor: number }> {
    const { dateColumn, typeFilter } = scopeFor(mode);
    const result = await client.query<{ income: string; expense: string }>(
      `SELECT
         COALESCE(sum(CASE WHEN t.transaction_type IN ${INCOME_TYPES} THEN t.amount_minor END), 0)
           AS income,
         COALESCE(sum(CASE WHEN t.transaction_type IN ${EXPENSE_TYPES} THEN t.amount_minor END), 0)
           AS expense
       FROM transactions t
      WHERE t.household_id = $1
        AND t.status = 'POSTED'
        AND ${typeFilter}
        AND ${dateColumn} >= $2::date
        AND ${dateColumn} <= $3::date`,
      [householdId, from, to],
    );
    return {
      incomeMinor: Number(result.rows[0]?.income ?? 0),
      expenseMinor: Number(result.rows[0]?.expense ?? 0),
    };
  }

  async function plannedFor(
    client: PoolClient,
    householdId: string,
    from: string,
    to: string,
  ): Promise<{ plannedIncomeMinor: number; plannedExpenseMinor: number }> {
    const result = await client.query<{ income: string; expense: string }>(
      `SELECT
         COALESCE(sum(CASE WHEN nature = 'RECEIVABLE' THEN original_amount_minor END), 0) AS income,
         COALESCE(sum(CASE WHEN nature = 'PAYABLE' THEN original_amount_minor END), 0) AS expense
       FROM planned_entries
      WHERE household_id = $1 AND canceled_at IS NULL
        AND competence_date >= $2::date AND competence_date <= $3::date`,
      [householdId, from, to],
    );
    return {
      plannedIncomeMinor: Number(result.rows[0]?.income ?? 0),
      plannedExpenseMinor: Number(result.rows[0]?.expense ?? 0),
    };
  }

  return {
    async summary(
      userId: string,
      householdId: string,
      query: ReportQuery,
    ): Promise<MonthlySummary> {
      return withUserTransaction(
        db,
        userId,
        async (client) => {
          await context(client, householdId, userId);
          const current = await totalsFor(client, householdId, query.mode, query.from, query.to);
          const planned = await plannedFor(client, householdId, query.from, query.to);
          const previousWindow = previousRange(query.from, query.to);
          const previous = await totalsFor(
            client,
            householdId,
            query.mode,
            previousWindow.from,
            previousWindow.to,
          );

          return {
            mode: query.mode,
            from: query.from,
            to: query.to,
            incomeMinor: current.incomeMinor,
            expenseMinor: current.expenseMinor,
            resultMinor: current.incomeMinor - current.expenseMinor,
            plannedIncomeMinor: planned.plannedIncomeMinor,
            plannedExpenseMinor: planned.plannedExpenseMinor,
            previousIncomeMinor: previous.incomeMinor,
            previousExpenseMinor: previous.expenseMinor,
          };
        },
        { readOnly: true },
      );
    },

    /** Tela 1b: saldo consolidado, previsto × realizado e próximos compromissos. */
    async dashboard(userId: string, householdId: string, query: ReportQuery): Promise<Dashboard> {
      return withUserTransaction(
        db,
        userId,
        async (client) => {
          const { timezone } = await context(client, householdId, userId);
          const today = familyToday(timezone);

          const balances = await client.query<{
            available: string;
            card_debt: string;
          }>(
            `SELECT
               COALESCE(sum(CASE WHEN a.account_type <> 'CREDIT_CARD'
                                 THEN app.account_balance(a.id) END), 0) AS available,
               COALESCE(sum(CASE WHEN a.account_type = 'CREDIT_CARD'
                                 THEN app.account_balance(a.id) END), 0) AS card_debt
             FROM accounts a
            WHERE a.household_id = $1 AND a.archived_at IS NULL`,
            [householdId],
          );
          const available = Number(balances.rows[0]?.available ?? 0);
          const cardDebt = Number(balances.rows[0]?.card_debt ?? 0);

          const current = await totalsFor(client, householdId, query.mode, query.from, query.to);
          const planned = await plannedFor(client, householdId, query.from, query.to);
          const previousWindow = previousRange(query.from, query.to);
          const previous = await totalsFor(
            client,
            householdId,
            query.mode,
            previousWindow.from,
            previousWindow.to,
          );

          // Vencidas: conta prevista em aberto com vencimento no passado.
          const overdue = await client.query<{ count: string; total: string }>(
            `SELECT count(*) AS count,
                    COALESCE(sum(app.planned_entry_outstanding(e.id)), 0) AS total
               FROM planned_entries e
              WHERE e.household_id = $1 AND e.canceled_at IS NULL
                AND e.due_date < $2::date
                AND app.planned_entry_outstanding(e.id) > 0`,
            [householdId, today],
          );

          const upcomingEntries = await client.query<{
            id: string;
            description: string;
            amount: string;
            due_date: Date;
            nature: 'PAYABLE' | 'RECEIVABLE';
            category_name: string | null;
          }>(
            `SELECT e.id, e.description, app.planned_entry_outstanding(e.id) AS amount,
                    e.due_date, e.nature, c.name AS category_name
               FROM planned_entries e
               LEFT JOIN categories c ON c.id = e.category_id
              WHERE e.household_id = $1 AND e.canceled_at IS NULL
                AND app.planned_entry_outstanding(e.id) > 0
              ORDER BY e.due_date
              LIMIT 5`,
            [householdId],
          );

          const upcomingStatements = await client.query<{
            id: string;
            account_name: string;
            card_last_four: string | null;
            total: string;
            paid: string;
            due_date: Date;
            closing_date: Date;
          }>(
            `SELECT s.id, a.name AS account_name, a.card_last_four,
                    app.card_statement_total(s.id) AS total,
                    app.card_statement_paid(s.id) AS paid,
                    s.due_date, s.closing_date
               FROM card_statements s
               JOIN accounts a ON a.id = s.account_id
              WHERE s.household_id = $1
                AND app.card_statement_total(s.id) > app.card_statement_paid(s.id)
              ORDER BY s.due_date
              LIMIT 3`,
            [householdId],
          );

          const byMember = await client.query<{
            member_id: string;
            member_name: string;
            role: string;
            expense: string;
          }>(
            `SELECT m.id AS member_id, m.display_name AS member_name, m.role,
                    COALESCE(sum(t.amount_minor), 0) AS expense
               FROM household_members m
               LEFT JOIN transactions t
                 ON t.member_id = m.id
                AND t.status = 'POSTED'
                AND t.transaction_type IN ${EXPENSE_TYPES}
                AND ${scopeFor(query.mode).dateColumn} >= $2::date
                AND ${scopeFor(query.mode).dateColumn} <= $3::date
              WHERE m.household_id = $1 AND m.status = 'ACTIVE'
              GROUP BY m.id, m.display_name, m.role
              ORDER BY expense DESC`,
            [householdId, query.from, query.to],
          );

          const upcoming: Dashboard['upcoming'] = [
            ...upcomingEntries.rows.map((row) => {
              const dueDate = row.due_date.toISOString().slice(0, 10);
              return {
                id: row.id,
                kind: 'PLANNED_ENTRY' as const,
                description: row.description,
                amountMinor: Number(row.amount),
                dueDate,
                nature: row.nature,
                overdue: dueDate < today,
                meta: row.category_name,
              };
            }),
            ...upcomingStatements.rows.map((row) => {
              const dueDate = row.due_date.toISOString().slice(0, 10);
              return {
                id: row.id,
                kind: 'CARD_STATEMENT' as const,
                description:
                  row.card_last_four === null
                    ? `Fatura · ${row.account_name}`
                    : `Fatura · ${row.account_name} • • • • ${row.card_last_four}`,
                amountMinor: Number(row.total) - Number(row.paid),
                dueDate,
                nature: 'PAYABLE' as const,
                overdue: dueDate < today,
                meta: `fecha ${row.closing_date.toISOString().slice(5, 10).split('-').reverse().join('/')}`,
              };
            }),
          ]
            .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
            .slice(0, 5);

          return {
            mode: query.mode,
            consolidatedBalanceMinor: available - cardDebt,
            availableBalanceMinor: available,
            cardDebtMinor: cardDebt,
            summary: {
              mode: query.mode,
              from: query.from,
              to: query.to,
              incomeMinor: current.incomeMinor,
              expenseMinor: current.expenseMinor,
              resultMinor: current.incomeMinor - current.expenseMinor,
              plannedIncomeMinor: planned.plannedIncomeMinor,
              plannedExpenseMinor: planned.plannedExpenseMinor,
              previousIncomeMinor: previous.incomeMinor,
              previousExpenseMinor: previous.expenseMinor,
            },
            overdueCount: Number(overdue.rows[0]?.count ?? 0),
            overdueMinor: Number(overdue.rows[0]?.total ?? 0),
            upcoming,
            byMember: byMember.rows.map((row) => ({
              memberId: row.member_id,
              memberName: row.member_name,
              role: row.role,
              expenseMinor: Number(row.expense),
            })),
          };
        },
        { readOnly: true },
      );
    },

    async byCategory(
      userId: string,
      householdId: string,
      query: ReportQuery,
    ): Promise<CategoryBreakdown> {
      return withUserTransaction(
        db,
        userId,
        async (client) => {
          await context(client, householdId, userId);
          const { dateColumn } = scopeFor(query.mode);

          const result = await client.query<{
            category_id: string | null;
            category_name: string | null;
            parent_id: string | null;
            total: string;
          }>(
            `SELECT t.category_id, c.name AS category_name, c.parent_id,
                    COALESCE(sum(t.amount_minor), 0) AS total
               FROM transactions t
               LEFT JOIN categories c ON c.id = t.category_id
              WHERE t.household_id = $1
                AND t.status = 'POSTED'
                AND t.transaction_type IN ${EXPENSE_TYPES}
                AND t.transaction_type <> 'CARD_PAYMENT'
                AND ${dateColumn} >= $2::date AND ${dateColumn} <= $3::date
              GROUP BY t.category_id, c.name, c.parent_id
              ORDER BY total DESC`,
            [householdId, query.from, query.to],
          );

          const total = result.rows.reduce((sum, row) => sum + Number(row.total), 0);
          return {
            mode: query.mode,
            totalMinor: total,
            items: result.rows.map((row) => ({
              categoryId: row.category_id,
              categoryName: row.category_name ?? 'Sem categoria',
              parentId: row.parent_id,
              amountMinor: Number(row.total),
              percent: total === 0 ? 0 : (Number(row.total) * 100) / total,
            })),
          };
        },
        { readOnly: true },
      );
    },

    /**
     * Por membro: soma pelos RATEIOS quando existem, e pelo membro do
     * lançamento quando não existem (docs/04 §12, tela 4c).
     */
    async byMember(
      userId: string,
      householdId: string,
      query: ReportQuery,
    ): Promise<MemberBreakdown> {
      return withUserTransaction(
        db,
        userId,
        async (client) => {
          await context(client, householdId, userId);
          const { dateColumn } = scopeFor(query.mode);

          const result = await client.query<{
            member_id: string;
            member_name: string;
            direct: string;
            allocated: string;
          }>(
            `WITH scoped AS (
               SELECT t.id, t.member_id, t.amount_minor
                 FROM transactions t
                WHERE t.household_id = $1
                  AND t.status = 'POSTED'
                  AND t.transaction_type IN ('EXPENSE', 'CARD_PURCHASE')
                  AND ${dateColumn} >= $2::date AND ${dateColumn} <= $3::date
             ),
             allocated AS (
               SELECT al.member_id, sum(al.amount_minor) AS total
                 FROM transaction_allocations al
                 JOIN scoped s ON s.id = al.transaction_id
                GROUP BY al.member_id
             ),
             direct AS (
               SELECT s.member_id, sum(s.amount_minor) AS total
                 FROM scoped s
                WHERE NOT EXISTS (
                  SELECT 1 FROM transaction_allocations al WHERE al.transaction_id = s.id
                )
                GROUP BY s.member_id
             )
             SELECT m.id AS member_id, m.display_name AS member_name,
                    COALESCE(d.total, 0) AS direct,
                    COALESCE(a.total, 0) AS allocated
               FROM household_members m
               LEFT JOIN direct d ON d.member_id = m.id
               LEFT JOIN allocated a ON a.member_id = m.id
              WHERE m.household_id = $1 AND m.status = 'ACTIVE'
              ORDER BY (COALESCE(d.total, 0) + COALESCE(a.total, 0)) DESC`,
            [householdId, query.from, query.to],
          );

          const items = result.rows.map((row) => ({
            memberId: row.member_id,
            memberName: row.member_name,
            amountMinor: Number(row.direct) + Number(row.allocated),
            fromAllocationsMinor: Number(row.allocated),
            percent: 0,
          }));
          const total = items.reduce((sum, item) => sum + item.amountMinor, 0);

          return {
            mode: query.mode,
            totalMinor: total,
            items: items.map((item) => ({
              ...item,
              percent: total === 0 ? 0 : (item.amountMinor * 100) / total,
            })),
          };
        },
        { readOnly: true },
      );
    },

    async byAccount(
      userId: string,
      householdId: string,
      query: ReportQuery,
    ): Promise<AccountBreakdown> {
      return withUserTransaction(
        db,
        userId,
        async (client) => {
          await context(client, householdId, userId);
          const { dateColumn, typeFilter } = scopeFor(query.mode);

          const result = await client.query<{
            account_id: string;
            account_name: string;
            account_type: string;
            income: string;
            expense: string;
            balance: string;
          }>(
            `SELECT a.id AS account_id, a.name AS account_name, a.account_type,
                    COALESCE(sum(CASE WHEN t.transaction_type IN ${INCOME_TYPES}
                                      THEN t.amount_minor END), 0) AS income,
                    COALESCE(sum(CASE WHEN t.transaction_type IN ${EXPENSE_TYPES}
                                      THEN t.amount_minor END), 0) AS expense,
                    app.account_balance(a.id) AS balance
               FROM accounts a
               LEFT JOIN transactions t
                 ON t.account_id = a.id
                AND t.status = 'POSTED'
                AND ${typeFilter}
                AND ${dateColumn} >= $2::date AND ${dateColumn} <= $3::date
              WHERE a.household_id = $1 AND a.archived_at IS NULL
              GROUP BY a.id, a.name, a.account_type
              ORDER BY a.name`,
            [householdId, query.from, query.to],
          );

          return {
            mode: query.mode,
            items: result.rows.map((row) => ({
              accountId: row.account_id,
              accountName: row.account_name,
              accountType: row.account_type,
              incomeMinor: Number(row.income),
              expenseMinor: Number(row.expense),
              balanceMinor: Number(row.balance),
            })),
          };
        },
        { readOnly: true },
      );
    },

    /** Últimos N meses, para o gráfico de evolução da tela 4a. */
    async evolution(
      userId: string,
      householdId: string,
      mode: ReportMode,
      months: number,
    ): Promise<Evolution> {
      return withUserTransaction(
        db,
        userId,
        async (client) => {
          const { timezone } = await context(client, householdId, userId);
          const { dateColumn } = scopeFor(mode);
          const today = familyToday(timezone);

          const result = await client.query<{
            month: string;
            income: string;
            expense: string;
          }>(
            `SELECT to_char(date_trunc('month', ${dateColumn}), 'YYYY-MM') AS month,
                    COALESCE(sum(CASE WHEN t.transaction_type IN ${INCOME_TYPES}
                                      THEN t.amount_minor END), 0) AS income,
                    COALESCE(sum(CASE WHEN t.transaction_type IN ${EXPENSE_TYPES}
                                      THEN t.amount_minor END), 0) AS expense
               FROM transactions t
              WHERE t.household_id = $1
                AND t.status = 'POSTED'
                AND ${dateColumn} > ($2::date - make_interval(months => $3))
                AND ${dateColumn} <= $2::date
              GROUP BY 1
              ORDER BY 1`,
            [householdId, today, months],
          );

          return {
            mode,
            months: result.rows.map((row) => ({
              month: row.month,
              incomeMinor: Number(row.income),
              expenseMinor: Number(row.expense),
              resultMinor: Number(row.income) - Number(row.expense),
            })),
          };
        },
        { readOnly: true },
      );
    },

    /**
     * Exportação em CSV (tela 4d). É um evento de auditoria — quem exportou e
     * quando fica registrado. Filho supervisionado não exporta (docs/10 §4).
     */
    async exportData(
      userId: string,
      householdId: string,
      input: ExportRequest,
      ctx: RequestContext,
    ): Promise<ExportResult> {
      return withUserTransaction(db, userId, async (client) => {
        const { role } = await context(client, householdId, userId);
        if (role === 'CHILD') {
          throw new DomainError(
            'INSUFFICIENT_PERMISSION',
            undefined,
            'Filhos supervisionados não exportam dados da família.',
          );
        }

        const { dateColumn } = scopeFor(input.mode);
        const rows =
          input.content === 'TRANSACTIONS'
            ? await client.query<Record<string, unknown>>(
                `SELECT ${dateColumn} AS data, t.description AS descricao,
                        t.transaction_type AS tipo, t.amount_minor AS valor_centavos,
                        a.name AS conta, c.name AS categoria, m.display_name AS membro,
                        t.status
                   FROM transactions t
                   LEFT JOIN accounts a ON a.id = t.account_id
                   LEFT JOIN categories c ON c.id = t.category_id
                   LEFT JOIN household_members m ON m.id = t.member_id
                  WHERE t.household_id = $1
                    AND ($4::boolean OR t.status = 'POSTED')
                    AND ${dateColumn} >= $2::date AND ${dateColumn} <= $3::date
                  ORDER BY 1`,
                [householdId, input.from, input.to, input.includeReversed],
              )
            : await client.query<Record<string, unknown>>(
                `SELECT e.due_date AS vencimento, e.competence_date AS competencia,
                        e.description AS descricao, e.nature AS natureza,
                        e.original_amount_minor AS valor_centavos,
                        app.planned_entry_outstanding(e.id) AS saldo_centavos,
                        app.planned_entry_status(e.id) AS status,
                        c.name AS categoria, m.display_name AS membro
                   FROM planned_entries e
                   LEFT JOIN categories c ON c.id = e.category_id
                   LEFT JOIN household_members m ON m.id = e.member_id
                  WHERE e.household_id = $1
                    AND e.competence_date >= $2::date AND e.competence_date <= $3::date
                  ORDER BY e.due_date`,
                [householdId, input.from, input.to],
              );

        const headers = rows.fields.map((field) => field.name);
        const escape = (value: unknown): string => {
          if (value === null || value === undefined) return '';
          const text = value instanceof Date ? value.toISOString().slice(0, 10) : String(value);
          // CSV pt-BR: campo com ; ou aspas vai entre aspas duplicadas.
          return /[";\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
        };
        const content = [
          headers.join(';'),
          ...rows.rows.map((row) => headers.map((header) => escape(row[header])).join(';')),
        ].join('\n');

        await insertAuditLog(client, {
          householdId,
          actorUserId: userId,
          entityType: 'export',
          action: 'EXPORT_REQUESTED',
          metadata: {
            content: input.content,
            from: input.from,
            to: input.to,
            rows: rows.rowCount ?? 0,
          },
          requestId: ctx.requestId,
        });

        return {
          fileName: `familia-${input.content.toLowerCase()}-${input.from}-a-${input.to}.csv`,
          mimeType: 'text/csv;charset=utf-8',
          rowCount: rows.rowCount ?? 0,
          content,
        };
      });
    },
  };
}
