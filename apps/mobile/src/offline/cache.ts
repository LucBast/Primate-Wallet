/**
 * Cache de leitura (docs/11 §1 "Leitura offline").
 *
 * Guarda o JSON do contrato inteiro em `payload` e espelha só as colunas de
 * consulta. Reidratar devolve exatamente o objeto que o servidor mandou — se um
 * campo novo aparece no contrato, ele já vem junto, sem migração de schema
 * local. É a mesma razão de o cache não somar nada: saldo, fatura e "vencido"
 * continuam derivados no Postgres.
 *
 * Cada gravação REESCREVE a lista daquela família: uma linha apagada no
 * servidor não pode sobreviver no aparelho.
 */

import { Q, type Model } from '@nozbe/watermelondb';
import { localDatabase } from './database';

export type CacheTable =
  'accounts' | 'categories' | 'members' | 'transactions' | 'planned_entries' | 'card_statements';

/** Colunas espelhadas por tabela, extraídas do próprio item do contrato. */
const MIRROR: Record<CacheTable, (item: Record<string, unknown>) => Record<string, unknown>> = {
  accounts: (item) => ({
    name: String(item['name'] ?? ''),
    account_type: String(item['accountType'] ?? ''),
    balance_minor: Number(item['balanceMinor'] ?? 0),
    archived: item['archivedAt'] !== null && item['archivedAt'] !== undefined,
  }),
  categories: (item) => ({
    name: String(item['name'] ?? ''),
    nature: String(item['nature'] ?? ''),
  }),
  members: (item) => ({
    display_name: String(item['displayName'] ?? ''),
    role: String(item['role'] ?? ''),
  }),
  transactions: (item) => ({
    occurred_at: String(item['occurredAt'] ?? ''),
    description: String(item['description'] ?? ''),
    amount_minor: Number(item['amountMinor'] ?? 0),
    transaction_type: String(item['transactionType'] ?? ''),
    status: String(item['status'] ?? ''),
  }),
  planned_entries: (item) => ({
    due_date: String(item['dueDate'] ?? ''),
    description: String(item['description'] ?? ''),
    outstanding_minor: Number(item['outstandingMinor'] ?? 0),
    nature: String(item['nature'] ?? ''),
    status: String(item['status'] ?? ''),
  }),
  card_statements: (item) => ({
    account_id: String(item['accountId'] ?? ''),
    due_date: String(item['dueDate'] ?? ''),
    total_minor: Number(item['totalMinor'] ?? 0),
    status: String(item['status'] ?? ''),
  }),
};

/** Ordem de leitura por tabela — a mesma que a tela espera. */
const ORDER: Partial<Record<CacheTable, { column: string; desc: boolean }>> = {
  transactions: { column: 'occurred_at', desc: true },
  planned_entries: { column: 'due_date', desc: false },
  card_statements: { column: 'due_date', desc: true },
};

type Writable = Model & Record<string, unknown>;

export async function writeList(
  table: CacheTable,
  householdId: string,
  items: ReadonlyArray<Record<string, unknown>>,
): Promise<void> {
  const database = localDatabase();
  const collection = database.get(table);
  const existing = await collection.query(Q.where('household_id', householdId)).fetch();
  const now = Date.now();

  await database.write(async () => {
    await database.batch(
      ...existing.map((row) => row.prepareDestroyPermanently()),
      ...items.map((item) =>
        collection.prepareCreate((row) => {
          const target = row as Writable;
          target['householdId'] = householdId;
          target['serverId'] = String(item['id'] ?? '');
          target['payload'] = JSON.stringify(item);
          target['cachedAt'] = now;
          for (const [column, value] of Object.entries(MIRROR[table](item))) {
            // As colunas espelhadas usam o nome do banco; o modelo as expõe em
            // camelCase, então a escrita passa pelo `_setRaw` do Watermelon.
            (row as unknown as { _setRaw: (key: string, value: unknown) => void })._setRaw(
              column,
              value,
            );
          }
        }),
      ),
    );
  });
}

export async function readList<T>(table: CacheTable, householdId: string): Promise<T[]> {
  const order = ORDER[table];
  const clauses = [
    Q.where('household_id', householdId),
    ...(order === undefined ? [] : [Q.sortBy(order.column, order.desc ? Q.desc : Q.asc)]),
  ];
  const rows = await localDatabase()
    .get(table)
    .query(...clauses)
    .fetch();
  return rows.map((row) => JSON.parse((row as Writable)['payload'] as string) as T);
}

/** Quando o cache foi gravado — a UI usa para dizer "dados de N minutos atrás". */
export async function cachedAt(table: CacheTable, householdId: string): Promise<Date | null> {
  const rows = await localDatabase()
    .get(table)
    .query(Q.where('household_id', householdId), Q.take(1))
    .fetch();
  const first = rows[0] as Writable | undefined;
  if (first === undefined) return null;
  return new Date(first['cachedAt'] as number);
}

/** Sair da conta apaga o cache: dado financeiro não fica para o próximo login. */
export async function clearAll(): Promise<void> {
  const database = localDatabase();
  await database.write(async () => {
    await database.unsafeResetDatabase();
  });
}
