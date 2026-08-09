/**
 * Modelos do WatermelonDB.
 *
 * As tabelas de leitura são CACHE, não fonte de verdade: cada linha guarda o
 * JSON do contrato em `payload` e algumas colunas espelhadas só para consultar
 * e ordenar. Assim o app reidrata exatamente o objeto que o servidor mandou —
 * sem um segundo modelo de dados no cliente que pudesse divergir do contrato.
 *
 * A `outbox` é a exceção: ela é fonte de verdade da INTENÇÃO até o servidor
 * confirmar. Depois disso o servidor volta a mandar.
 */

import { Model } from '@nozbe/watermelondb';
import { date, field, text } from '@nozbe/watermelondb/decorators';

/** Estados do item de outbox (docs/11 §2 e §4). */
export type OutboxStatus = 'pending' | 'syncing' | 'done' | 'failed';

/** Comandos que podem sair do aparelho sem conexão (docs/11 §1). */
export type OutboxKind = 'EXPENSE' | 'INCOME' | 'CARD_PURCHASE' | 'PLANNED_ENTRY';

class CachedRecord extends Model {
  @text('household_id') householdId!: string;
  @text('server_id') serverId!: string;
  @text('payload') payload!: string;
  @field('cached_at') cachedAt!: number;
}

export class CachedAccount extends CachedRecord {
  static override table = 'accounts';
  @text('name') name!: string;
  @text('account_type') accountType!: string;
  @field('balance_minor') balanceMinor!: number;
  @field('archived') archived!: boolean;
}

export class CachedCategory extends CachedRecord {
  static override table = 'categories';
  @text('name') name!: string;
  @text('nature') nature!: string;
}

export class CachedMember extends CachedRecord {
  static override table = 'members';
  @text('display_name') displayName!: string;
  @text('role') role!: string;
}

export class CachedTransaction extends CachedRecord {
  static override table = 'transactions';
  @text('occurred_at') occurredAt!: string;
  @text('description') description!: string;
  @field('amount_minor') amountMinor!: number;
  @text('transaction_type') transactionType!: string;
  @text('status') status!: string;
}

export class CachedPlannedEntry extends CachedRecord {
  static override table = 'planned_entries';
  @text('due_date') dueDate!: string;
  @text('description') description!: string;
  @field('outstanding_minor') outstandingMinor!: number;
  @text('nature') nature!: string;
  @text('status') status!: string;
}

export class CachedCardStatement extends CachedRecord {
  static override table = 'card_statements';
  @text('account_id') accountId!: string;
  @text('due_date') dueDate!: string;
  @field('total_minor') totalMinor!: number;
  @text('status') status!: string;
}

export class OutboxItem extends Model {
  static override table = 'outbox';

  @text('household_id') householdId!: string;
  @text('kind') kind!: OutboxKind;
  @text('idempotency_key') idempotencyKey!: string;
  @text('payload') payload!: string;
  @text('status') status!: OutboxStatus;
  @field('attempts') attempts!: number;
  @text('last_error') lastError!: string | null;
  @text('last_error_code') lastErrorCode!: string | null;
  @date('created_at') createdAtDate!: Date;
  @date('updated_at') updatedAtDate!: Date;
}

export const modelClasses = [
  CachedAccount,
  CachedCategory,
  CachedMember,
  CachedTransaction,
  CachedPlannedEntry,
  CachedCardStatement,
  OutboxItem,
];
