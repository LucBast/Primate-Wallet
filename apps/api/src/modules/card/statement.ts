/**
 * Anexação de compras à fatura do cartão.
 *
 * Existem TRÊS caminhos que criam uma compra no cartão: o endpoint dedicado
 * (`POST /card-purchases`), uma despesa comum lançada em conta de cartão
 * (`POST /expenses`) e a baixa de uma conta prevista paga com cartão. Todos
 * precisam anexar a compra a uma fatura — senão a dívida aparece no saldo do
 * cartão, mas a fatura fica zerada e a compra nunca é cobrada.
 *
 * Esse era exatamente o defeito encontrado no gate visual da 1b: 6 compras
 * somando R$ 3.250,00 sem nenhuma linha em `card_statement_items`. Por isso a
 * lógica mora aqui, e não dentro de um dos serviços.
 */

import type { PoolClient } from 'pg';
import { cycleForPurchase, DomainError, isoDate } from '@ff/domain';

export type StatementCycle = {
  readonly cycleStart: string;
  readonly cycleEnd: string;
  readonly closingDate: string;
  readonly dueDate: string;
};

/** Devolve a fatura do ciclo, criando-a se ainda não existir. */
export async function ensureStatement(
  client: PoolClient,
  householdId: string,
  accountId: string,
  cycle: StatementCycle,
): Promise<string> {
  const existing = await client.query<{ id: string }>(
    `SELECT id FROM card_statements
      WHERE account_id = $1 AND cycle_start_date = $2::date AND cycle_end_date = $3::date`,
    [accountId, cycle.cycleStart, cycle.cycleEnd],
  );
  const found = existing.rows[0]?.id;
  if (found) return found;

  const created = await client.query<{ id: string }>(
    `INSERT INTO card_statements
       (household_id, account_id, cycle_start_date, cycle_end_date, closing_date, due_date)
     VALUES ($1, $2, $3::date, $4::date, $5::date, $6::date)
     ON CONFLICT (account_id, cycle_start_date, cycle_end_date) DO UPDATE
       SET updated_at = now()
     RETURNING id`,
    [householdId, accountId, cycle.cycleStart, cycle.cycleEnd, cycle.closingDate, cycle.dueDate],
  );
  const id = created.rows[0]?.id;
  /* c8 ignore next */
  if (!id) throw new DomainError('INTERNAL_ERROR');
  return id;
}

/**
 * Anexa uma transação já gravada à fatura do ciclo em que a compra caiu.
 *
 * Silenciosamente não faz nada se a conta não for cartão ou não tiver os dias
 * de fechamento/vencimento — quem chama nem sempre sabe o tipo da conta, e um
 * cartão sem ciclo configurado não deveria derrubar o lançamento.
 */
export async function attachPurchaseToStatement(
  client: PoolClient,
  householdId: string,
  accountId: string,
  transactionId: string,
  amountMinor: number,
  occurredOn: string,
): Promise<void> {
  const card = await client.query<{ closing_day: number | null; due_day: number | null }>(
    `SELECT closing_day, due_day FROM accounts
      WHERE id = $1 AND account_type = 'CREDIT_CARD'`,
    [accountId],
  );
  const found = card.rows[0];
  if (!found || found.closing_day === null || found.due_day === null) return;

  const cycle = cycleForPurchase(isoDate(occurredOn), found.closing_day, found.due_day);
  const statementId = await ensureStatement(client, householdId, accountId, cycle);
  await client.query(
    `INSERT INTO card_statement_items
       (household_id, card_statement_id, transaction_id, amount_minor)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (card_statement_id, transaction_id) DO NOTHING`,
    [householdId, statementId, transactionId, amountMinor],
  );
}
