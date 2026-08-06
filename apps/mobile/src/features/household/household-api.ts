/**
 * Chamadas de família, membros, convites e auditoria.
 * Toda resposta é validada pelo schema do contrato antes de virar estado.
 */

import {
  auditEntrySchema,
  householdSchema,
  invitationPreviewSchema,
  invitationSchema,
  memberSchema,
  type AuditEntry,
  type CreateHouseholdRequest,
  type Household,
  type Invitation,
  type InvitationPreview,
  type InviteMemberRequest,
  type Member,
  type UpdateMemberRequest,
} from '@ff/api-contracts';
import { z } from 'zod';
import { request } from '../../services/api-client';

const listOf = <T extends z.ZodType>(item: T) => z.object({ items: z.array(item) });

export async function listHouseholds(accessToken: string): Promise<Household[]> {
  const body = await request('/households', { accessToken });
  return listOf(householdSchema).parse(body).items;
}

export async function createHousehold(
  accessToken: string,
  input: CreateHouseholdRequest,
): Promise<Household> {
  return householdSchema.parse(
    await request('/households', { method: 'POST', body: input, accessToken }),
  );
}

export async function listMembers(accessToken: string, householdId: string): Promise<Member[]> {
  const body = await request(`/households/${householdId}/members`, { accessToken });
  return listOf(memberSchema).parse(body).items;
}

export async function updateMember(
  accessToken: string,
  householdId: string,
  memberId: string,
  input: UpdateMemberRequest,
): Promise<Member> {
  return memberSchema.parse(
    await request(`/households/${householdId}/members/${memberId}`, {
      method: 'PATCH',
      body: input,
      accessToken,
    }),
  );
}

export async function listInvitations(
  accessToken: string,
  householdId: string,
): Promise<Invitation[]> {
  const body = await request(`/households/${householdId}/invitations`, { accessToken });
  return listOf(invitationSchema).parse(body).items;
}

export async function inviteMember(
  accessToken: string,
  householdId: string,
  input: InviteMemberRequest,
): Promise<Invitation> {
  return invitationSchema.parse(
    await request(`/households/${householdId}/invitations`, {
      method: 'POST',
      body: input,
      accessToken,
    }),
  );
}

export async function revokeInvitation(
  accessToken: string,
  householdId: string,
  invitationId: string,
): Promise<void> {
  await request(`/households/${householdId}/invitations/${invitationId}`, {
    method: 'DELETE',
    accessToken,
  });
}

export async function previewInvitation(
  accessToken: string,
  token: string,
): Promise<InvitationPreview> {
  return invitationPreviewSchema.parse(
    await request(`/invitations/preview?token=${encodeURIComponent(token)}`, { accessToken }),
  );
}

export async function acceptInvitation(
  accessToken: string,
  token: string,
): Promise<{ householdId: string }> {
  return z
    .object({ householdId: z.uuid(), role: z.string() })
    .parse(await request('/invitations/accept', { method: 'POST', body: { token }, accessToken }));
}

export async function listAudit(accessToken: string, householdId: string): Promise<AuditEntry[]> {
  const body = await request(`/households/${householdId}/audit`, { accessToken });
  return listOf(auditEntrySchema).parse(body).items;
}
