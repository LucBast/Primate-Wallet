/**
 * Contratos de relatórios (docs/09 §10; telas 1b e 4a–4d).
 *
 * Toda leitura declara o MODO: `ACCRUAL` (competência) ou `CASH` (caixa).
 * Os dois nunca se misturam num mesmo número — é a regra de leitura mais
 * importante do produto (docs/04 §11).
 */

import { z } from 'zod';
import { isoDateSchema, minorUnitsSchema, uuidSchema } from '@ff/validation';

export const reportModeSchema = z.enum(['ACCRUAL', 'CASH']);
export type ReportMode = z.infer<typeof reportModeSchema>;

export const reportQuerySchema = z.object({
  mode: reportModeSchema.default('ACCRUAL'),
  from: isoDateSchema,
  to: isoDateSchema,
  accountId: uuidSchema.optional(),
  memberId: uuidSchema.optional(),
});
export type ReportQuery = z.infer<typeof reportQuerySchema>;

/** Resumo do mês (docs/09 §10). */
export const monthlySummarySchema = z.object({
  mode: reportModeSchema,
  from: z.string(),
  to: z.string(),
  incomeMinor: minorUnitsSchema,
  expenseMinor: minorUnitsSchema,
  resultMinor: minorUnitsSchema,
  /** Previsto do período, vindo das contas previstas. */
  plannedIncomeMinor: minorUnitsSchema,
  plannedExpenseMinor: minorUnitsSchema,
  /** Comparação com o mês anterior, para os KPI cards da tela 4a. */
  previousIncomeMinor: minorUnitsSchema,
  previousExpenseMinor: minorUnitsSchema,
});
export type MonthlySummary = z.infer<typeof monthlySummarySchema>;

export const dashboardSchema = z.object({
  mode: reportModeSchema,
  /** Saldo consolidado: contas + (dívida de cartões em aberto). */
  consolidatedBalanceMinor: minorUnitsSchema,
  availableBalanceMinor: minorUnitsSchema,
  cardDebtMinor: minorUnitsSchema,
  summary: monthlySummarySchema,
  overdueCount: z.int(),
  overdueMinor: minorUnitsSchema,
  upcoming: z.array(
    z.object({
      id: uuidSchema,
      kind: z.enum(['PLANNED_ENTRY', 'CARD_STATEMENT']),
      description: z.string(),
      amountMinor: minorUnitsSchema,
      dueDate: z.string(),
      nature: z.enum(['PAYABLE', 'RECEIVABLE']),
      overdue: z.boolean(),
      meta: z.string().nullable(),
    }),
  ),
  byMember: z.array(
    z.object({
      memberId: uuidSchema,
      memberName: z.string(),
      role: z.string(),
      expenseMinor: minorUnitsSchema,
    }),
  ),
});
export type Dashboard = z.infer<typeof dashboardSchema>;

export const categoryBreakdownSchema = z.object({
  mode: reportModeSchema,
  totalMinor: minorUnitsSchema,
  items: z.array(
    z.object({
      categoryId: uuidSchema.nullable(),
      categoryName: z.string(),
      parentId: uuidSchema.nullable(),
      amountMinor: minorUnitsSchema,
      percent: z.number(),
    }),
  ),
});
export type CategoryBreakdown = z.infer<typeof categoryBreakdownSchema>;

export const memberBreakdownSchema = z.object({
  mode: reportModeSchema,
  totalMinor: minorUnitsSchema,
  items: z.array(
    z.object({
      memberId: uuidSchema,
      memberName: z.string(),
      amountMinor: minorUnitsSchema,
      percent: z.number(),
      /** Parte que veio de rateio, e não de lançamento direto. */
      fromAllocationsMinor: minorUnitsSchema,
    }),
  ),
});
export type MemberBreakdown = z.infer<typeof memberBreakdownSchema>;

export const accountBreakdownSchema = z.object({
  mode: reportModeSchema,
  items: z.array(
    z.object({
      accountId: uuidSchema,
      accountName: z.string(),
      accountType: z.string(),
      incomeMinor: minorUnitsSchema,
      expenseMinor: minorUnitsSchema,
      balanceMinor: minorUnitsSchema,
    }),
  ),
});
export type AccountBreakdown = z.infer<typeof accountBreakdownSchema>;

/** Evolução dos últimos meses (gráfico da tela 4a). */
export const evolutionSchema = z.object({
  mode: reportModeSchema,
  months: z.array(
    z.object({
      month: z.string(),
      incomeMinor: minorUnitsSchema,
      expenseMinor: minorUnitsSchema,
      resultMinor: minorUnitsSchema,
    }),
  ),
});
export type Evolution = z.infer<typeof evolutionSchema>;

export const exportRequestSchema = z.object({
  format: z.enum(['CSV']).default('CSV'),
  mode: reportModeSchema.default('ACCRUAL'),
  from: isoDateSchema,
  to: isoDateSchema,
  content: z.enum(['TRANSACTIONS', 'PLANNED_ENTRIES']).default('TRANSACTIONS'),
  includeReversed: z.boolean().default(false),
});
export type ExportRequest = z.infer<typeof exportRequestSchema>;

export const exportResultSchema = z.object({
  fileName: z.string(),
  mimeType: z.string(),
  rowCount: z.int(),
  content: z.string(),
});
export type ExportResult = z.infer<typeof exportResultSchema>;
