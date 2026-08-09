-- Índices da paginação por cursor (docs/11 §5 e §6).
--
-- A lista da 1g pagina por cursor `(occurred_at, id) < (?, ?)` e ordena por
-- `occurred_at DESC, id DESC`. O índice existente parava em `occurred_at`, então
-- todo grupo de movimentações do MESMO instante — que é o caso comum, porque o
-- seed de um dia e os lançamentos em lote nascem com o mesmo timestamp — saía do
-- índice sem ordem e precisava de um sort extra para desempatar pelo id. Com o
-- `id DESC` no índice, a página inteira sai do índice já ordenada.
--
-- E `transactions_household_idx` some: `household_id` sozinho é prefixo do
-- índice composto, então ele nunca era escolhido para nada que o composto não
-- resolvesse — só custava escrita em toda inserção.

-- Up Migration

CREATE INDEX transactions_cursor_idx
  ON transactions (household_id, occurred_at DESC, id DESC);

DROP INDEX IF EXISTS transactions_occurred_idx;
DROP INDEX IF EXISTS transactions_household_idx;

-- Mesma história na lista de contas previstas, que ordena por vencimento e
-- desempata pelo id.
CREATE INDEX planned_entries_cursor_idx
  ON planned_entries (household_id, due_date, id);

DROP INDEX IF EXISTS planned_entries_due_date_idx;

-- Down Migration

CREATE INDEX planned_entries_due_date_idx ON planned_entries (household_id, due_date);
DROP INDEX IF EXISTS planned_entries_cursor_idx;

CREATE INDEX transactions_household_idx ON transactions (household_id);
CREATE INDEX transactions_occurred_idx ON transactions (household_id, occurred_at DESC);
DROP INDEX IF EXISTS transactions_cursor_idx;
