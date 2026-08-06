-- Movimentações realizadas (docs/08 §transactions, §transaction_allocations).
--
-- Esta é a espinha dorsal financeira: saldo de conta, relatórios e faturas
-- derivam daqui. Regras estruturais gravadas no schema:
--
--  * Valor em CENTAVOS INTEIROS (bigint). Sinal vem do tipo, não do número:
--    todo lançamento é positivo, exceto ADJUSTMENT, que é o único que pode ser
--    negativo por natureza.
--  * Movimentação postada não é excluída: correção é ESTORNO, que cria uma
--    linha REVERSAL apontando para a original (docs/04 §8).
--  * `idempotency_key` é única por família: a mesma chave nunca produz dois
--    efeitos financeiros (docs/04 §14).
--  * TRANSFER e CARD_PAYMENT exigem conta de destino diferente da origem.

-- Up Migration

CREATE TABLE transactions (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id           uuid NOT NULL REFERENCES households (id) ON DELETE CASCADE,
  transaction_type       text NOT NULL,
  description            text NOT NULL,
  amount_minor           bigint NOT NULL,
  occurred_at            timestamptz NOT NULL DEFAULT now(),
  competence_date        date NOT NULL,
  account_id             uuid NOT NULL REFERENCES accounts (id) ON DELETE RESTRICT,
  destination_account_id uuid REFERENCES accounts (id) ON DELETE RESTRICT,
  member_id              uuid NOT NULL REFERENCES household_members (id) ON DELETE RESTRICT,
  category_id            uuid REFERENCES categories (id) ON DELETE RESTRICT,
  counterparty_id        uuid REFERENCES counterparties (id) ON DELETE SET NULL,
  source                 text NOT NULL DEFAULT 'MANUAL',
  status                 text NOT NULL DEFAULT 'POSTED',
  notes                  text,
  reason                 text,
  idempotency_key        text NOT NULL,
  created_by             uuid NOT NULL REFERENCES profiles (id) ON DELETE RESTRICT,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  reversed_transaction_id uuid REFERENCES transactions (id) ON DELETE RESTRICT,
  reversed_at            timestamptz,
  approval_request_id    uuid,
  version                integer NOT NULL DEFAULT 1,

  CONSTRAINT transactions_type_check CHECK (
    transaction_type IN (
      'EXPENSE', 'INCOME', 'TRANSFER', 'CARD_PURCHASE', 'CARD_PAYMENT',
      'ADJUSTMENT', 'REFUND', 'REVERSAL'
    )
  ),
  CONSTRAINT transactions_status_check CHECK (
    status IN ('PENDING_APPROVAL', 'POSTED', 'REVERSED', 'REJECTED')
  ),
  CONSTRAINT transactions_source_check CHECK (
    source IN ('MANUAL', 'BOTTOM_ACTION', 'SHORTCUT', 'NOTIFICATION', 'RECURRENCE', 'SETTLEMENT', 'IMPORT', 'SYSTEM')
  ),
  CONSTRAINT transactions_description_not_blank CHECK (length(btrim(description)) > 0),
  -- Só ajuste pode ser negativo; os demais têm sinal dado pelo tipo.
  CONSTRAINT transactions_amount_sign CHECK (
    transaction_type = 'ADJUSTMENT' OR amount_minor > 0
  ),
  CONSTRAINT transactions_adjustment_not_zero CHECK (
    transaction_type <> 'ADJUSTMENT' OR amount_minor <> 0
  ),
  -- Transferência e pagamento de fatura exigem destino, e origem ≠ destino.
  CONSTRAINT transactions_transfer_requires_destination CHECK (
    transaction_type NOT IN ('TRANSFER', 'CARD_PAYMENT') OR destination_account_id IS NOT NULL
  ),
  CONSTRAINT transactions_destination_differs CHECK (
    destination_account_id IS NULL OR destination_account_id <> account_id
  ),
  -- Estorno aponta para a original; ninguém mais aponta.
  CONSTRAINT transactions_reversal_points_to_original CHECK (
    (transaction_type = 'REVERSAL') = (reversed_transaction_id IS NOT NULL)
  ),
  CONSTRAINT transactions_reversal_requires_reason CHECK (
    transaction_type <> 'REVERSAL' OR length(btrim(coalesce(reason, ''))) > 0
  ),
  CONSTRAINT transactions_adjustment_requires_reason CHECK (
    transaction_type <> 'ADJUSTMENT' OR length(btrim(coalesce(reason, ''))) > 0
  )
);

-- Idempotência: uma chave, um efeito financeiro, por família.
CREATE UNIQUE INDEX transactions_idempotency_unique
  ON transactions (household_id, idempotency_key);
-- Uma movimentação só pode ser estornada uma vez.
CREATE UNIQUE INDEX transactions_single_reversal
  ON transactions (reversed_transaction_id)
  WHERE reversed_transaction_id IS NOT NULL;

CREATE INDEX transactions_household_idx ON transactions (household_id);
CREATE INDEX transactions_account_idx ON transactions (account_id);
CREATE INDEX transactions_destination_idx ON transactions (destination_account_id);
CREATE INDEX transactions_member_idx ON transactions (member_id);
CREATE INDEX transactions_category_idx ON transactions (category_id);
CREATE INDEX transactions_competence_idx ON transactions (household_id, competence_date);
CREATE INDEX transactions_occurred_idx ON transactions (household_id, occurred_at DESC);
CREATE INDEX transactions_status_idx ON transactions (household_id, status);

CREATE TRIGGER transactions_set_updated_at
  BEFORE UPDATE ON transactions
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

-- Rateio (docs/04 §12): a soma das partes é EXATAMENTE o valor da movimentação.
CREATE TABLE transaction_allocations (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id   uuid NOT NULL REFERENCES households (id) ON DELETE CASCADE,
  transaction_id uuid NOT NULL REFERENCES transactions (id) ON DELETE CASCADE,
  category_id    uuid REFERENCES categories (id) ON DELETE RESTRICT,
  member_id      uuid NOT NULL REFERENCES household_members (id) ON DELETE RESTRICT,
  amount_minor   bigint NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT transaction_allocations_amount_positive CHECK (amount_minor > 0)
);

CREATE INDEX transaction_allocations_transaction_idx
  ON transaction_allocations (transaction_id);
CREATE INDEX transaction_allocations_member_idx ON transaction_allocations (member_id);

-- ------------------------------------------------------------------ saldos
--
-- O saldo é DERIVADO (docs/04 §13): saldo inicial + movimentações postadas.
-- Existe cache em outra camada, mas a fonte de verdade é reconciliável — é
-- exatamente esta função.
--
-- Conta comum: receita entra, despesa sai, transferência move, pagamento de
-- fatura sai, ajuste soma com o próprio sinal. Compra no cartão NÃO mexe na
-- conta bancária.
--
-- Cartão: o "saldo" é a dívida (positiva = deve). Compras somam, reembolsos e
-- pagamentos recebidos abatem.

CREATE OR REPLACE FUNCTION app.account_balance(p_account uuid) RETURNS bigint
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
    SELECT CASE
      WHEN a.account_type = 'CREDIT_CARD' THEN
        COALESCE((
          SELECT sum(
            CASE t.transaction_type
              WHEN 'CARD_PURCHASE' THEN t.amount_minor
              WHEN 'REFUND' THEN -t.amount_minor
              WHEN 'ADJUSTMENT' THEN t.amount_minor
              ELSE 0
            END
          )
          FROM transactions t
          WHERE t.account_id = a.id AND t.status = 'POSTED'
        ), 0)
        - COALESCE((
          SELECT sum(t.amount_minor) FROM transactions t
           WHERE t.destination_account_id = a.id
             AND t.transaction_type = 'CARD_PAYMENT'
             AND t.status = 'POSTED'
        ), 0)
      ELSE
        a.opening_balance_minor
        + COALESCE((
          SELECT sum(
            CASE t.transaction_type
              WHEN 'INCOME' THEN t.amount_minor
              WHEN 'REFUND' THEN t.amount_minor
              WHEN 'EXPENSE' THEN -t.amount_minor
              WHEN 'TRANSFER' THEN -t.amount_minor
              WHEN 'CARD_PAYMENT' THEN -t.amount_minor
              WHEN 'ADJUSTMENT' THEN t.amount_minor
              ELSE 0
            END
          )
          FROM transactions t
          WHERE t.account_id = a.id AND t.status = 'POSTED'
        ), 0)
        + COALESCE((
          SELECT sum(t.amount_minor) FROM transactions t
           WHERE t.destination_account_id = a.id
             AND t.transaction_type = 'TRANSFER'
             AND t.status = 'POSTED'
        ), 0)
    END
    FROM accounts a WHERE a.id = p_account
  $$;

/* Limite disponível do cartão: limite − dívida atual. */
CREATE OR REPLACE FUNCTION app.card_available_limit(p_account uuid) RETURNS bigint
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
    SELECT COALESCE(a.credit_limit_minor, 0) - app.account_balance(a.id)
      FROM accounts a
     WHERE a.id = p_account AND a.account_type = 'CREDIT_CARD'
  $$;

-- ------------------------------------------------------------------ policies

ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions FORCE ROW LEVEL SECURITY;

-- Enxerga a movimentação quem enxerga a conta envolvida (origem ou destino).
CREATE POLICY transactions_select ON transactions
  FOR SELECT TO ff_app
  USING (
    app.can_view_account(account_id)
    OR (destination_account_id IS NOT NULL AND app.can_view_account(destination_account_id))
  );

CREATE POLICY transactions_insert ON transactions
  FOR INSERT TO ff_app
  WITH CHECK (
    app.can_transact_account(account_id)
    AND created_by = app.current_user_id()
    AND (destination_account_id IS NULL OR app.can_view_account(destination_account_id))
  );

-- Atualização é restrita: o serviço só marca estorno e aprovação. Não existe
-- caminho de UPDATE que reescreva valor de uma linha postada.
CREATE POLICY transactions_update ON transactions
  FOR UPDATE TO ff_app
  USING (app.can_transact_account(account_id))
  WITH CHECK (app.can_transact_account(account_id));

ALTER TABLE transaction_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE transaction_allocations FORCE ROW LEVEL SECURITY;

CREATE POLICY transaction_allocations_select ON transaction_allocations
  FOR SELECT TO ff_app
  USING (EXISTS (
    SELECT 1 FROM transactions t
     WHERE t.id = transaction_id AND app.can_view_account(t.account_id)
  ));

CREATE POLICY transaction_allocations_write ON transaction_allocations
  FOR ALL TO ff_app
  USING (EXISTS (
    SELECT 1 FROM transactions t
     WHERE t.id = transaction_id AND app.can_transact_account(t.account_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM transactions t
     WHERE t.id = transaction_id AND app.can_transact_account(t.account_id)
  ));

SELECT app.grant_if_role_exists('ff_app', 'SELECT, INSERT, UPDATE', 'public.transactions');
SELECT app.grant_if_role_exists(
  'ff_app', 'SELECT, INSERT, UPDATE, DELETE', 'public.transaction_allocations'
);

-- Down Migration

DROP FUNCTION IF EXISTS app.card_available_limit(uuid);
DROP FUNCTION IF EXISTS app.account_balance(uuid);
DROP TABLE IF EXISTS transaction_allocations;
DROP TABLE IF EXISTS transactions;
