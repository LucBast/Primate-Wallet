/**
 * Chamadas de aprovação de lançamentos (tela 3c).
 * Toda resposta é validada pelo schema do contrato antes de virar estado.
 */

import {
  approvalListSchema,
  approvalRequestSchema,
  type ApprovalList,
  type ApprovalRequest,
  type ApprovalStatus,
  type DecideApprovalRequest,
} from '@ff/api-contracts';
import { request } from '../../services/api-client';

export async function listApprovals(
  accessToken: string,
  householdId: string,
  status?: ApprovalStatus,
): Promise<ApprovalList> {
  const query = status === undefined ? '' : `?status=${status}`;
  return approvalListSchema.parse(
    await request(`/households/${householdId}/approvals${query}`, { accessToken }),
  );
}

export async function approve(
  accessToken: string,
  householdId: string,
  approvalId: string,
  input: DecideApprovalRequest,
): Promise<ApprovalRequest> {
  return approvalRequestSchema.parse(
    await request(`/households/${householdId}/approvals/${approvalId}/approve`, {
      method: 'POST',
      body: input,
      accessToken,
    }),
  );
}

export async function reject(
  accessToken: string,
  householdId: string,
  approvalId: string,
  input: DecideApprovalRequest,
): Promise<ApprovalRequest> {
  return approvalRequestSchema.parse(
    await request(`/households/${householdId}/approvals/${approvalId}/reject`, {
      method: 'POST',
      body: input,
      accessToken,
    }),
  );
}
