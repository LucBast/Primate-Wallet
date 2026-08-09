/**
 * Outbox de comandos offline (docs/11 §1, §2, §3 e §4).
 *
 * O que faz um comando ser reenviável sem medo é a CHAVE DE IDEMPOTÊNCIA, que
 * nasce aqui, no aparelho, junto do item — não na hora do envio. O servidor
 * devolve a MESMA movimentação para uma chave repetida (docs/04 §14), então
 * reenviar depois de uma queda de rede nunca duplica dinheiro. Um item que
 * gerasse a chave no momento do envio perderia essa garantia exatamente no caso
 * em que ela importa: quando não se sabe se o primeiro envio chegou.
 *
 * Só entram aqui os quatro comandos que docs/11 §1 autoriza offline. Baixa,
 * pagamento de fatura, transferência, estorno e aprovação exigem conexão e
 * falham com `OFFLINE_OPERATION_REJECTED` — decidir sobre saldo disputado sem
 * ver o saldo de verdade seria inventar dinheiro.
 */

import { Q } from '@nozbe/watermelondb';
import { ApiRequestError } from '../services/api-client';
import { newIdempotencyKey } from '../services/idempotency';
import { localDatabase } from './database';
import { isPermanentFailure } from './retry-policy';
import { OUTBOX_TABLE } from './schema';
import type { OutboxItem, OutboxKind, OutboxStatus } from './models';

/** Rota de cada comando, relativa à família. */
const ENDPOINT: Record<OutboxKind, string> = {
  EXPENSE: '/expenses',
  INCOME: '/incomes',
  CARD_PURCHASE: '/card-purchases',
  PLANNED_ENTRY: '/planned-entries',
};

export type QueuedCommand = {
  readonly kind: OutboxKind;
  readonly householdId: string;
  readonly body: Record<string, unknown>;
};

export type OutboxSnapshot = {
  readonly id: string;
  readonly kind: OutboxKind;
  readonly status: OutboxStatus;
  readonly attempts: number;
  readonly lastError: string | null;
  readonly body: Record<string, unknown>;
  readonly idempotencyKey: string;
};

function collection() {
  return localDatabase().get<OutboxItem>(OUTBOX_TABLE);
}

function snapshot(item: OutboxItem): OutboxSnapshot {
  return {
    id: item.id,
    kind: item.kind,
    status: item.status,
    attempts: item.attempts,
    lastError: item.lastError,
    body: JSON.parse(item.payload) as Record<string, unknown>,
    idempotencyKey: item.idempotencyKey,
  };
}

/**
 * Enfileira o comando e devolve a chave que ele vai usar para sempre.
 *
 * A tela mostra "Salvo localmente · ◌ aguardando sincronização" a partir daqui,
 * como manda docs/11 §4 — o lançamento existe para a pessoa mesmo sem rede.
 */
export async function enqueue(command: QueuedCommand): Promise<OutboxSnapshot> {
  const key = newIdempotencyKey();
  const now = Date.now();
  const database = localDatabase();

  const created = await database.write(async () =>
    collection().create((item) => {
      item.householdId = command.householdId;
      item.kind = command.kind;
      item.idempotencyKey = key;
      item.payload = JSON.stringify({ ...command.body, idempotencyKey: key });
      item.status = 'pending';
      item.attempts = 0;
      item.lastError = null;
      item.lastErrorCode = null;
      item.createdAtDate = new Date(now);
      item.updatedAtDate = new Date(now);
    }),
  );

  return snapshot(created);
}

export async function pending(householdId: string): Promise<OutboxSnapshot[]> {
  const items = await collection()
    .query(Q.where('household_id', householdId), Q.where('status', Q.notEq('done')))
    .fetch();
  return items.map(snapshot);
}

/** Quantos lançamentos ainda não chegaram ao servidor — alimenta o banner. */
export async function pendingCount(householdId: string): Promise<number> {
  return collection()
    .query(Q.where('household_id', householdId), Q.where('status', Q.notEq('done')))
    .fetchCount();
}

export type FlushResult = {
  readonly sent: number;
  readonly failed: number;
  readonly stillPending: number;
};

/**
 * Envia o que está na fila, em ordem de criação.
 *
 * Para no primeiro erro de rede: se a conexão caiu, insistir nos outros itens
 * só gasta bateria — e a ORDEM importa, porque um lançamento pode depender do
 * anterior ter chegado (uma conta prevista criada offline e quitada em seguida).
 */
export async function flush(
  householdId: string,
  send: (path: string, body: unknown) => Promise<unknown>,
): Promise<FlushResult> {
  const database = localDatabase();
  const items = await collection()
    .query(
      Q.where('household_id', householdId),
      Q.where('status', Q.oneOf(['pending', 'failed'])),
      Q.sortBy('created_at', Q.asc),
    )
    .fetch();

  let sent = 0;
  let failed = 0;

  for (const item of items) {
    const body = JSON.parse(item.payload) as Record<string, unknown>;
    try {
      await send(`/households/${householdId}${ENDPOINT[item.kind]}`, body);
      await database.write(async () =>
        item.update((row) => {
          row.status = 'done';
          row.lastError = null;
          row.lastErrorCode = null;
          row.updatedAtDate = new Date();
        }),
      );
      sent += 1;
    } catch (cause) {
      const apiError = cause instanceof ApiRequestError ? cause : null;
      const permanent = isPermanentFailure(apiError?.code);

      await database.write(async () =>
        item.update((row) => {
          row.status = permanent ? 'failed' : 'pending';
          row.attempts = row.attempts + 1;
          row.lastError = apiError?.message ?? 'Falha ao sincronizar.';
          row.lastErrorCode = apiError?.code ?? null;
          row.updatedAtDate = new Date();
        }),
      );

      if (permanent) {
        failed += 1;
        continue;
      }
      // Rede caída: para por aqui e preserva a ordem da fila.
      break;
    }
  }

  return { sent, failed, stillPending: await pendingCount(householdId) };
}

/** Descarta um item que falhou de forma definitiva, por decisão da pessoa. */
export async function discard(itemId: string): Promise<void> {
  const database = localDatabase();
  const item = await collection().find(itemId);
  await database.write(async () => item.destroyPermanently());
}

/** Limpa o que já foi confirmado; roda depois de cada sincronização. */
export async function purgeDone(householdId: string): Promise<void> {
  const database = localDatabase();
  const done = await collection()
    .query(Q.where('household_id', householdId), Q.where('status', 'done'))
    .fetch();
  if (done.length === 0) return;
  await database.write(async () => {
    await database.batch(...done.map((item) => item.prepareDestroyPermanently()));
  });
}
