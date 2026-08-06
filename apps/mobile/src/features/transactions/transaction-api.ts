/**
 * Chamadas de movimentações realizadas.
 *
 * `Idempotency-Key` acompanha todo comando financeiro: o servidor devolve a
 * MESMA movimentação se o pedido chegar duas vezes.
 */

import {
  transactionPageSchema,
  transactionSchema,
  type CreateExpenseRequest,
  type CreateIncomeRequest,
  type CreateTransferRequest,
  type ReverseTransactionRequest,
  type Transaction,
  type TransactionFilter,
  type TransactionPage,
  type UpdateAllocationsRequest,
} from '@ff/api-contracts';
import { request } from '../../services/api-client';

function queryOf(filter: Partial<TransactionFilter>): string {
  const params = new URLSearchParams();
  for (const [name, value] of Object.entries(filter)) {
    if (value !== undefined && value !== null && value !== '') params.set(name, String(value));
  }
  const query = params.toString();
  return query === '' ? '' : `?${query}`;
}

export async function listTransactions(
  accessToken: string,
  householdId: string,
  filter: Partial<TransactionFilter> = {},
): Promise<TransactionPage> {
  return transactionPageSchema.parse(
    await request(`/households/${householdId}/transactions${queryOf(filter)}`, { accessToken }),
  );
}

export async function getTransaction(
  accessToken: string,
  householdId: string,
  transactionId: string,
): Promise<Transaction> {
  return transactionSchema.parse(
    await request(`/households/${householdId}/transactions/${transactionId}`, { accessToken }),
  );
}

export async function createExpense(
  accessToken: string,
  householdId: string,
  input: CreateExpenseRequest,
): Promise<Transaction> {
  return transactionSchema.parse(
    await request(`/households/${householdId}/expenses`, {
      method: 'POST',
      body: input,
      accessToken,
      idempotencyKey: input.idempotencyKey,
    }),
  );
}

export async function createIncome(
  accessToken: string,
  householdId: string,
  input: CreateIncomeRequest,
): Promise<Transaction> {
  return transactionSchema.parse(
    await request(`/households/${householdId}/incomes`, {
      method: 'POST',
      body: input,
      accessToken,
      idempotencyKey: input.idempotencyKey,
    }),
  );
}

export async function createTransfer(
  accessToken: string,
  householdId: string,
  input: CreateTransferRequest,
): Promise<Transaction> {
  return transactionSchema.parse(
    await request(`/households/${householdId}/transfers`, {
      method: 'POST',
      body: input,
      accessToken,
      idempotencyKey: input.idempotencyKey,
    }),
  );
}

export async function reverseTransaction(
  accessToken: string,
  householdId: string,
  transactionId: string,
  input: ReverseTransactionRequest,
): Promise<Transaction> {
  return transactionSchema.parse(
    await request(`/households/${householdId}/transactions/${transactionId}/reverse`, {
      method: 'POST',
      body: input,
      accessToken,
      idempotencyKey: input.idempotencyKey,
    }),
  );
}

export async function setAllocations(
  accessToken: string,
  householdId: string,
  transactionId: string,
  input: UpdateAllocationsRequest,
): Promise<Transaction> {
  return transactionSchema.parse(
    await request(`/households/${householdId}/transactions/${transactionId}/allocations`, {
      method: 'PUT',
      body: input,
      accessToken,
    }),
  );
}
