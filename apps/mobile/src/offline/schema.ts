/**
 * Schema local do WatermelonDB (docs/11 §1 e §2; docs/01-STACK-DECISIONS §Offline).
 *
 * Espelha SÓ o que a leitura offline precisa — contas, categorias, membros,
 * movimentações recentes, contas previstas próximas e faturas recentes — mais a
 * `outbox`, que é a única tabela de ESCRITA.
 *
 * Duas regras que o schema já protege:
 *
 *  - Dinheiro continua em centavos inteiros aqui também. Nenhuma coluna é
 *    `number` de ponto flutuante para valor; todas as colunas *_minor são
 *    inteiras e o app nunca soma dinheiro a partir do cache — ele só EXIBE o
 *    que o servidor calculou. Saldo, fatura e "vencido" continuam derivados no
 *    Postgres, que é a fonte de verdade.
 *  - O cache carrega `household_id` em toda linha, como no servidor: trocar de
 *    família não pode mostrar dado da outra, nem por um quadro de vídeo.
 */

import { appSchema, tableSchema } from '@nozbe/watermelondb';

export const OUTBOX_TABLE = 'outbox';

export const localSchema = appSchema({
  version: 1,
  tables: [
    tableSchema({
      name: 'accounts',
      columns: [
        { name: 'household_id', type: 'string', isIndexed: true },
        { name: 'server_id', type: 'string', isIndexed: true },
        { name: 'name', type: 'string' },
        { name: 'account_type', type: 'string' },
        { name: 'institution_name', type: 'string', isOptional: true },
        { name: 'balance_minor', type: 'number' },
        { name: 'credit_limit_minor', type: 'number', isOptional: true },
        { name: 'available_limit_minor', type: 'number', isOptional: true },
        { name: 'card_last_four', type: 'string', isOptional: true },
        { name: 'archived', type: 'boolean' },
        { name: 'payload', type: 'string' },
        { name: 'cached_at', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'categories',
      columns: [
        { name: 'household_id', type: 'string', isIndexed: true },
        { name: 'server_id', type: 'string', isIndexed: true },
        { name: 'name', type: 'string' },
        { name: 'nature', type: 'string' },
        { name: 'payload', type: 'string' },
        { name: 'cached_at', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'members',
      columns: [
        { name: 'household_id', type: 'string', isIndexed: true },
        { name: 'server_id', type: 'string', isIndexed: true },
        { name: 'display_name', type: 'string' },
        { name: 'role', type: 'string' },
        { name: 'payload', type: 'string' },
        { name: 'cached_at', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'transactions',
      columns: [
        { name: 'household_id', type: 'string', isIndexed: true },
        { name: 'server_id', type: 'string', isIndexed: true },
        { name: 'occurred_at', type: 'string', isIndexed: true },
        { name: 'description', type: 'string' },
        { name: 'amount_minor', type: 'number' },
        { name: 'transaction_type', type: 'string' },
        { name: 'status', type: 'string' },
        { name: 'payload', type: 'string' },
        { name: 'cached_at', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'planned_entries',
      columns: [
        { name: 'household_id', type: 'string', isIndexed: true },
        { name: 'server_id', type: 'string', isIndexed: true },
        { name: 'due_date', type: 'string', isIndexed: true },
        { name: 'description', type: 'string' },
        { name: 'outstanding_minor', type: 'number' },
        { name: 'nature', type: 'string' },
        { name: 'status', type: 'string' },
        { name: 'payload', type: 'string' },
        { name: 'cached_at', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'card_statements',
      columns: [
        { name: 'household_id', type: 'string', isIndexed: true },
        { name: 'server_id', type: 'string', isIndexed: true },
        { name: 'account_id', type: 'string', isIndexed: true },
        { name: 'due_date', type: 'string' },
        { name: 'total_minor', type: 'number' },
        { name: 'status', type: 'string' },
        { name: 'payload', type: 'string' },
        { name: 'cached_at', type: 'number' },
      ],
    }),
    // A ÚNICA tabela de escrita. Campos exigidos por docs/11 §2.
    tableSchema({
      name: OUTBOX_TABLE,
      columns: [
        { name: 'household_id', type: 'string', isIndexed: true },
        { name: 'kind', type: 'string' },
        /** Nasce no aparelho e nunca muda: é ela que torna o reenvio seguro. */
        { name: 'idempotency_key', type: 'string', isIndexed: true },
        { name: 'payload', type: 'string' },
        { name: 'status', type: 'string', isIndexed: true },
        { name: 'attempts', type: 'number' },
        { name: 'last_error', type: 'string', isOptional: true },
        { name: 'last_error_code', type: 'string', isOptional: true },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),
  ],
});
