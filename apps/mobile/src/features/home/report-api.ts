/** Chamadas de dashboard, relatórios e exportação. */

import {
  accountBreakdownSchema,
  categoryBreakdownSchema,
  dashboardSchema,
  evolutionSchema,
  exportResultSchema,
  memberBreakdownSchema,
  monthlySummarySchema,
  type AccountBreakdown,
  type CategoryBreakdown,
  type Dashboard,
  type Evolution,
  type ExportRequest,
  type ExportResult,
  type MemberBreakdown,
  type MonthlySummary,
  type ReportMode,
} from '@ff/api-contracts';
import { request } from '../../services/api-client';

type Range = { mode: ReportMode; from: string; to: string };

function query(range: Range): string {
  return `mode=${range.mode}&from=${range.from}&to=${range.to}`;
}

export async function getDashboard(
  accessToken: string,
  householdId: string,
  range: Range,
): Promise<Dashboard> {
  return dashboardSchema.parse(
    await request(`/households/${householdId}/dashboard?${query(range)}`, { accessToken }),
  );
}

export async function getSummary(
  accessToken: string,
  householdId: string,
  range: Range,
): Promise<MonthlySummary> {
  return monthlySummarySchema.parse(
    await request(`/households/${householdId}/reports/summary?${query(range)}`, { accessToken }),
  );
}

export async function byCategory(
  accessToken: string,
  householdId: string,
  range: Range,
): Promise<CategoryBreakdown> {
  return categoryBreakdownSchema.parse(
    await request(`/households/${householdId}/reports/by-category?${query(range)}`, {
      accessToken,
    }),
  );
}

export async function byMember(
  accessToken: string,
  householdId: string,
  range: Range,
): Promise<MemberBreakdown> {
  return memberBreakdownSchema.parse(
    await request(`/households/${householdId}/reports/by-member?${query(range)}`, { accessToken }),
  );
}

export async function byAccount(
  accessToken: string,
  householdId: string,
  range: Range,
): Promise<AccountBreakdown> {
  return accountBreakdownSchema.parse(
    await request(`/households/${householdId}/reports/by-account?${query(range)}`, { accessToken }),
  );
}

export async function evolution(
  accessToken: string,
  householdId: string,
  mode: ReportMode,
  months = 6,
): Promise<Evolution> {
  return evolutionSchema.parse(
    await request(`/households/${householdId}/reports/evolution?mode=${mode}&months=${months}`, {
      accessToken,
    }),
  );
}

export async function exportData(
  accessToken: string,
  householdId: string,
  input: ExportRequest,
): Promise<ExportResult> {
  return exportResultSchema.parse(
    await request(`/households/${householdId}/reports/export`, {
      method: 'POST',
      body: input,
      accessToken,
    }),
  );
}
