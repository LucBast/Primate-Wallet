/**
 * Chamadas de baixa. Todo comando leva `Idempotency-Key`: se a rede cair depois
 * do servidor gravar, o reenvio devolve a MESMA baixa em vez de duplicar.
 */

import {
  settleResponseSchema,
  settlementSchema,
  type ReverseSettlementRequest,
  type Settlement,
  type SettlePlannedEntryRequest,
  type SettleResponse,
} from '@ff/api-contracts';
import { z } from 'zod';
import { request } from '../../services/api-client';

export async function settle(
  accessToken: string,
  householdId: string,
  entryId: string,
  input: SettlePlannedEntryRequest,
): Promise<SettleResponse> {
  return settleResponseSchema.parse(
    await request(`/households/${householdId}/planned-entries/${entryId}/settlements`, {
      method: 'POST',
      body: input,
      accessToken,
      requiresConnection: true,
      idempotencyKey: input.idempotencyKey,
    }),
  );
}

export async function listSettlements(
  accessToken: string,
  householdId: string,
  entryId: string,
): Promise<Settlement[]> {
  const body = await request(`/households/${householdId}/planned-entries/${entryId}/settlements`, {
    accessToken,
  });
  return z.object({ items: z.array(settlementSchema) }).parse(body).items;
}

export async function reverseSettlement(
  accessToken: string,
  householdId: string,
  settlementId: string,
  input: ReverseSettlementRequest,
): Promise<SettleResponse> {
  return settleResponseSchema.parse(
    await request(`/households/${householdId}/settlements/${settlementId}/reverse`, {
      method: 'POST',
      body: input,
      accessToken,
      requiresConnection: true,
      idempotencyKey: input.idempotencyKey,
    }),
  );
}
