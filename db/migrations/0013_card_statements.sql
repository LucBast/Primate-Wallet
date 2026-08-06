-- Faturas de cartão (docs/08 §card_statements, §card_statement_items;
-- docs/04 §10; telas 1f e 2e).
--
-- A fatura agrupa as compras de um ciclo. O ciclo é derivado do dia de
-- fechamento do cartão; a data de vencimento, do dia de vencimento.
--
-- Regra que o schema protege: pagamento de fatura NÃO é despesa. Ele é uma
-- transação do tipo CARD_PAYMENT, ligada aqui por `card_statement_payments` —
-- as despesas já foram as compras.

-- Up Migration

CREATE TABLE card_statements (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id     uuid NOT NULL REFERENCES households (id) ON DELETE CASCADE,
  account_id       uuid NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  cycle_start_date date NOT NULL,
  cycle_end_date   date NOT NULL,
  closing_date     date NOT NULL,
  due_date         date NOT NULL,
  status           text NOT NULL DEFAULT 'OPEN',
  closed_at        timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  version          integer NOT NULL DEFAULT 1,
  CONSTRAINT card_statements_status_check
    CHECK (status IN ('OPEN', 'CLOSED', 'PARTIAL', 'PAID')),
  CONSTRAINT card_statements_cycle_order CHECK (cycle_end_date >= cycle_start_date),
  CONSTRAINT card_statements_due_after_closing CHECK (due_date >= closing_date),
  CONSTRAINT card_statements_unique_cycle UNIQUE (account_id, cycle_start_date, cycle_end_date)
);

CREATE INDEX card_statements_household_idx ON card_statements (household_id);
CREATE INDEX card_statements_account_idx ON card_statements (account_id, cycle_start_date DESC);
CREATE INDEX card_statements_due_idx ON card_statements (household_id, due_date);

CREATE TRIGGER card_statements_set_updated_at
  BEFORE UPDATE ON card_statements
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

-- Uma compra pertence a exatamente uma fatura.
CREATE TABLE card_statement_items (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id      uuid NOT NULL REFERENCES households (id) ON DELETE CASCADE,
  card_statement_id uuid NOT NULL REFERENCES card_statements (id) ON DELETE CASCADE,
  transaction_id    uuid NOT NULL REFERENCES transactions (id) ON DELETE RESTRICT,
  amount_minor      bigint NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT card_statement_items_unique UNIQUE (card_statement_id, transaction_id)
);

CREATE INDEX card_statement_items_statement_idx ON card_statement_items (card_statement_id);
CREATE INDEX card_statement_items_transaction_idx ON card_statement_items (transaction_id);

-- Pagamentos da fatura: uma fatura pode receber vários pagamentos parciais.
CREATE TABLE card_statement_payments (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id      uuid NOT NULL REFERENCES households (id) ON DELETE CASCADE,
  card_statement_id uuid NOT NULL REFERENCES card_statements (id) ON DELETE CASCADE,
  transaction_id    uuid NOT NULL REFERENCES transactions (id) ON DELETE RESTRICT,
  amount_minor      bigint NOT NULL,
  paid_at           date NOT NULL,
  created_by        uuid NOT NULL REFERENCES profiles (id) ON DELETE RESTRICT,
  created_at        timestamptz NOT NULL DEFAULT now(),
  reversed_at       timestamptz,
  reversal_reason   text,
  idempotency_key   text NOT NULL,
  CONSTRAINT card_statement_payments_amount_positive CHECK (amount_minor > 0),
  CONSTRAINT card_statement_payments_unique UNIQUE (card_statement_id, transaction_id)
);

CREATE UNIQUE INDEX card_statement_payments_idempotency_unique
  ON card_statement_payments (household_id, idempotency_key);
CREATE INDEX card_statement_payments_statement_idx
  ON card_statement_payments (card_statement_id);

-- ------------------------------------------------------------------ derivados

/** Total da fatura: compras do ciclo, menos reembolsos, sem estornadas. */
CREATE OR REPLACE FUNCTION app.card_statement_total(p_statement uuid) RETURNS bigint
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
    SELECT COALESCE(sum(
      CASE t.transaction_type
        WHEN 'REFUND' THEN -i.amount_minor
        ELSE i.amount_minor
      END
    ), 0)
    FROM card_statement_items i
    JOIN transactions t ON t.id = i.transaction_id
    WHERE i.card_statement_id = p_statement AND t.status = 'POSTED'
  $$;

/** Já pago da fatura: pagamentos não estornados. */
CREATE OR REPLACE FUNCTION app.card_statement_paid(p_statement uuid) RETURNS bigint
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
    SELECT COALESCE(sum(p.amount_minor), 0)
      FROM card_statement_payments p
     WHERE p.card_statement_id = p_statement AND p.reversed_at IS NULL
  $$;

/**
 * Status derivado (STATES-AND-MATRICES §3): Aberta → Fechada → Parcial → Paga;
 * sem pagamento até vencer → Vencida (esta última é derivada na leitura, com o
 * fuso da família, e por isso não entra no status persistido).
 */
CREATE OR REPLACE FUNCTION app.card_statement_status(p_statement uuid) RETURNS text
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
    SELECT CASE
      WHEN s.closed_at IS NULL THEN 'OPEN'
      WHEN app.card_statement_paid(s.id) >= app.card_statement_total(s.id)
           AND app.card_statement_total(s.id) > 0 THEN 'PAID'
      WHEN app.card_statement_paid(s.id) > 0 THEN 'PARTIAL'
      ELSE 'CLOSED'
    END
    FROM card_statements s WHERE s.id = p_statement
  $$;

-- ------------------------------------------------------------------ policies

ALTER TABLE card_statements ENABLE ROW LEVEL SECURITY;
ALTER TABLE card_statements FORCE ROW LEVEL SECURITY;

CREATE POLICY card_statements_select ON card_statements
  FOR SELECT TO ff_app USING (app.can_view_account(account_id));

CREATE POLICY card_statements_write ON card_statements
  FOR ALL TO ff_app
  USING (app.can_operate(household_id) AND app.can_view_account(account_id))
  WITH CHECK (app.can_operate(household_id));

ALTER TABLE card_statement_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE card_statement_items FORCE ROW LEVEL SECURITY;

CREATE POLICY card_statement_items_select ON card_statement_items
  FOR SELECT TO ff_app
  USING (EXISTS (
    SELECT 1 FROM card_statements s
     WHERE s.id = card_statement_id AND app.can_view_account(s.account_id)
  ));

CREATE POLICY card_statement_items_write ON card_statement_items
  FOR ALL TO ff_app
  USING (app.is_member(household_id))
  WITH CHECK (app.is_member(household_id));

ALTER TABLE card_statement_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE card_statement_payments FORCE ROW LEVEL SECURITY;

CREATE POLICY card_statement_payments_select ON card_statement_payments
  FOR SELECT TO ff_app
  USING (EXISTS (
    SELECT 1 FROM card_statements s
     WHERE s.id = card_statement_id AND app.can_view_account(s.account_id)
  ));

CREATE POLICY card_statement_payments_write ON card_statement_payments
  FOR ALL TO ff_app
  USING (app.can_operate(household_id))
  WITH CHECK (app.can_operate(household_id) AND created_by = app.current_user_id());

SELECT app.grant_if_role_exists('ff_app', 'SELECT, INSERT, UPDATE', 'public.card_statements');
SELECT app.grant_if_role_exists(
  'ff_app', 'SELECT, INSERT, UPDATE, DELETE', 'public.card_statement_items'
);
SELECT app.grant_if_role_exists(
  'ff_app', 'SELECT, INSERT, UPDATE', 'public.card_statement_payments'
);

-- Down Migration

DROP FUNCTION IF EXISTS app.card_statement_status(uuid);
DROP FUNCTION IF EXISTS app.card_statement_paid(uuid);
DROP FUNCTION IF EXISTS app.card_statement_total(uuid);
DROP TABLE IF EXISTS card_statement_payments;
DROP TABLE IF EXISTS card_statement_items;
DROP TABLE IF EXISTS card_statements;
