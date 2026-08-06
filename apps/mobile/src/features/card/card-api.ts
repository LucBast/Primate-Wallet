/** Chamadas de cartão: compras, reembolso, faturas e pagamento. */

import {
  cardStatementSchema,
  createCardPurchaseResponseSchema,
  type CardStatement,
  type CreateCardPurchaseRequest,
  type CreateCardPurchaseResponse,
  type CreateCardRefundRequest,
  type PayCardStatementRequest,
  type ReverseCardPaymentRequest,
} from '@ff/api-contracts';
import { z } from 'zod';
import { request } from '../../services/api-client';

export async function createPurchase(
  accessToken: string,
  householdId: string,
  input: CreateCardPurchaseRequest,
): Promise<CreateCardPurchaseResponse> {
  return createCardPurchaseResponseSchema.parse(
    await request(`/households/${householdId}/card-purchases`, {
      method: 'POST',
      body: input,
      accessToken,
      idempotencyKey: input.idempotencyKey,
    }),
  );
}

export async function createRefund(
  accessToken: string,
  householdId: string,
  input: CreateCardRefundRequest,
): Promise<{ transactionId: string }> {
  return z.object({ transactionId: z.uuid() }).parse(
    await request(`/households/${householdId}/card-refunds`, {
      method: 'POST',
      body: input,
      accessToken,
      idempotencyKey: input.idempotencyKey,
    }),
  );
}

export async function listStatements(
  accessToken: string,
  householdId: string,
  accountId: string,
): Promise<CardStatement[]> {
  const body = await request(`/households/${householdId}/card-statements?accountId=${accountId}`, {
    accessToken,
  });
  return z.object({ items: z.array(cardStatementSchema) }).parse(body).items;
}

export async function getStatement(
  accessToken: string,
  householdId: string,
  statementId: string,
): Promise<CardStatement> {
  return cardStatementSchema.parse(
    await request(`/households/${householdId}/card-statements/${statementId}`, { accessToken }),
  );
}

export async function closeStatement(
  accessToken: string,
  householdId: string,
  statementId: string,
  expectedVersion: number,
): Promise<CardStatement> {
  return cardStatementSchema.parse(
    await request(`/households/${householdId}/card-statements/${statementId}/close`, {
      method: 'POST',
      body: { expectedVersion },
      accessToken,
    }),
  );
}

export async function payStatement(
  accessToken: string,
  householdId: string,
  statementId: string,
  input: PayCardStatementRequest,
): Promise<CardStatement> {
  return cardStatementSchema.parse(
    await request(`/households/${householdId}/card-statements/${statementId}/payments`, {
      method: 'POST',
      body: input,
      accessToken,
      idempotencyKey: input.idempotencyKey,
    }),
  );
}

export async function reversePayment(
  accessToken: string,
  householdId: string,
  paymentId: string,
  input: ReverseCardPaymentRequest,
): Promise<CardStatement> {
  return cardStatementSchema.parse(
    await request(`/households/${householdId}/card-payments/${paymentId}/reverse`, {
      method: 'POST',
      body: input,
      accessToken,
      idempotencyKey: input.idempotencyKey,
    }),
  );
}
