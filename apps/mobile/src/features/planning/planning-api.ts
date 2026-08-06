/**
 * Chamadas de planejamento: contas previstas, cancelamento e anexos.
 */

import {
  attachmentSchema,
  attachmentUploadTicketSchema,
  plannedEntrySchema,
  planningListSchema,
  type Attachment,
  type AttachmentUploadTicket,
  type CancelPlannedEntryRequest,
  type CreateAttachmentRequest,
  type CreatePlannedEntryRequest,
  type PlannedEntry,
  type PlannedEntryNature,
  type PlanningList,
  type UpdatePlannedEntryRequest,
} from '@ff/api-contracts';
import { z } from 'zod';
import { request } from '../../services/api-client';

export async function listPlannedEntries(
  accessToken: string,
  householdId: string,
  params: { nature: PlannedEntryNature; from: string; to: string; includeSettled?: boolean },
): Promise<PlanningList> {
  const query = new URLSearchParams({
    nature: params.nature,
    from: params.from,
    to: params.to,
    includeSettled: String(params.includeSettled ?? true),
  });
  return planningListSchema.parse(
    await request(`/households/${householdId}/planned-entries?${query.toString()}`, {
      accessToken,
    }),
  );
}

export async function createPlannedEntry(
  accessToken: string,
  householdId: string,
  input: CreatePlannedEntryRequest,
): Promise<PlannedEntry[]> {
  const body = await request(`/households/${householdId}/planned-entries`, {
    method: 'POST',
    body: input,
    accessToken,
  });
  return z.object({ items: z.array(plannedEntrySchema) }).parse(body).items;
}

export async function getPlannedEntry(
  accessToken: string,
  householdId: string,
  entryId: string,
): Promise<PlannedEntry> {
  return plannedEntrySchema.parse(
    await request(`/households/${householdId}/planned-entries/${entryId}`, { accessToken }),
  );
}

export async function updatePlannedEntry(
  accessToken: string,
  householdId: string,
  entryId: string,
  input: UpdatePlannedEntryRequest,
): Promise<PlannedEntry> {
  return plannedEntrySchema.parse(
    await request(`/households/${householdId}/planned-entries/${entryId}`, {
      method: 'PATCH',
      body: input,
      accessToken,
    }),
  );
}

export async function cancelPlannedEntry(
  accessToken: string,
  householdId: string,
  entryId: string,
  input: CancelPlannedEntryRequest,
): Promise<PlannedEntry> {
  return plannedEntrySchema.parse(
    await request(`/households/${householdId}/planned-entries/${entryId}/cancel`, {
      method: 'POST',
      body: input,
      accessToken,
    }),
  );
}

export async function createAttachment(
  accessToken: string,
  householdId: string,
  input: CreateAttachmentRequest,
): Promise<AttachmentUploadTicket> {
  return attachmentUploadTicketSchema.parse(
    await request(`/households/${householdId}/attachments`, {
      method: 'POST',
      body: input,
      accessToken,
    }),
  );
}

export async function listAttachments(
  accessToken: string,
  householdId: string,
  entityType: string,
  entityId: string,
): Promise<Attachment[]> {
  const body = await request(
    `/households/${householdId}/attachments?entityType=${entityType}&entityId=${entityId}`,
    { accessToken },
  );
  return z.object({ items: z.array(attachmentSchema) }).parse(body).items;
}
