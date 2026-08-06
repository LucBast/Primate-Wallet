-- Contas previstas e baixas (docs/08 §planned_entries, §settlements;
-- docs/04 §3–§7).
--
-- Uma conta prevista é uma OBRIGAÇÃO (a pagar) ou uma EXPECTATIVA (a receber).
-- Ela não altera saldo até existir baixa — o saldo vem de `transactions`.
--
-- Saldo em aberto e "vencido" são DERIVADOS, nunca persistidos:
--   outstanding = valor original − principal das baixas válidas
--   vencido     = due_date < hoje(fuso da família) AND outstanding > 0
--                 AND status <> 'CANCELED'
-- `status` é persistido porque CANCELED é decisão do usuário, e OPEN/PARTIAL/
-- SETTLED precisam ser filtráveis por índice; o serviço recalcula a cada baixa.

-- Up Migration

CREATE TABLE installment_groups (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id       uuid NOT NULL REFERENCES households (id) ON DELETE CASCADE,
  description        text NOT NULL,
  total_amount_minor bigint NOT NULL,
  installment_count  integer NOT NULL,
  account_id         uuid REFERENCES accounts (id) ON DELETE RESTRICT,
  purchase_date      date NOT NULL,
  created_by         uuid NOT NULL REFERENCES profiles (id) ON DELETE RESTRICT,
  created_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT installment_groups_total_positive CHECK (total_amount_minor > 0),
  CONSTRAINT installment_groups_count_range CHECK (installment_count BETWEEN 1 AND 120)
);

CREATE INDEX installment_groups_household_idx ON installment_groups (household_id);

CREATE TABLE recurrence_rules (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id          uuid NOT NULL REFERENCES households (id) ON DELETE CASCADE,
  frequency             text NOT NULL,
  interval_count        integer NOT NULL DEFAULT 1,
  start_date            date NOT NULL,
  end_date              date,
  max_occurrences       integer,
  day_of_month          integer,
  days_of_week          integer[],
  next_generation_date  date NOT NULL,
  template_payload      jsonb NOT NULL,
  is_active             boolean NOT NULL DEFAULT true,
  created_by            uuid NOT NULL REFERENCES profiles (id) ON DELETE RESTRICT,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  version               integer NOT NULL DEFAULT 1,
  CONSTRAINT recurrence_rules_frequency_check
    CHECK (frequency IN ('DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY')),
  CONSTRAINT recurrence_rules_interval_positive CHECK (interval_count BETWEEN 1 AND 60),
  CONSTRAINT recurrence_rules_day_of_month_range
    CHECK (day_of_month IS NULL OR day_of_month BETWEEN 1 AND 31),
  CONSTRAINT recurrence_rules_end_after_start CHECK (end_date IS NULL OR end_date >= start_date),
  CONSTRAINT recurrence_rules_max_occurrences_positive
    CHECK (max_occurrences IS NULL OR max_occurrences > 0)
);

CREATE INDEX recurrence_rules_household_idx ON recurrence_rules (household_id);
CREATE INDEX recurrence_rules_next_generation_idx
  ON recurrence_rules (next_generation_date) WHERE is_active;

CREATE TRIGGER recurrence_rules_set_updated_at
  BEFORE UPDATE ON recurrence_rules
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

CREATE TABLE planned_entries (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id          uuid NOT NULL REFERENCES households (id) ON DELETE CASCADE,
  nature                text NOT NULL,
  description           text NOT NULL,
  original_amount_minor bigint NOT NULL,
  competence_date       date NOT NULL,
  due_date              date NOT NULL,
  expected_account_id   uuid REFERENCES accounts (id) ON DELETE SET NULL,
  member_id             uuid NOT NULL REFERENCES household_members (id) ON DELETE RESTRICT,
  category_id           uuid REFERENCES categories (id) ON DELETE RESTRICT,
  counterparty_id       uuid REFERENCES counterparties (id) ON DELETE SET NULL,
  status                text NOT NULL DEFAULT 'OPEN',
  recurrence_rule_id    uuid REFERENCES recurrence_rules (id) ON DELETE SET NULL,
  installment_group_id  uuid REFERENCES installment_groups (id) ON DELETE SET NULL,
  installment_number    integer,
  installment_total     integer,
  notes                 text,
  /** Lembrete: dias antes do vencimento; nulo usa a preferência da família. */
  reminder_days_before  integer,
  created_by            uuid NOT NULL REFERENCES profiles (id) ON DELETE RESTRICT,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  canceled_at           timestamptz,
  cancel_reason         text,
  idempotency_key       text NOT NULL,
  version               integer NOT NULL DEFAULT 1,

  CONSTRAINT planned_entries_nature_check CHECK (nature IN ('PAYABLE', 'RECEIVABLE')),
  CONSTRAINT planned_entries_status_check
    CHECK (status IN ('OPEN', 'PARTIAL', 'SETTLED', 'CANCELED')),
  CONSTRAINT planned_entries_amount_positive CHECK (original_amount_minor > 0),
  CONSTRAINT planned_entries_description_not_blank CHECK (length(btrim(description)) > 0),
  CONSTRAINT planned_entries_installment_pair CHECK (
    (installment_number IS NULL) = (installment_total IS NULL)
  ),
  CONSTRAINT planned_entries_installment_range CHECK (
    installment_number IS NULL OR (installment_number >= 1 AND installment_number <= installment_total)
  ),
  CONSTRAINT planned_entries_canceled_consistency CHECK (
    (status = 'CANCELED') = (canceled_at IS NOT NULL)
  ),
  CONSTRAINT planned_entries_reminder_range CHECK (
    reminder_days_before IS NULL OR reminder_days_before BETWEEN 0 AND 60
  )
);

CREATE UNIQUE INDEX planned_entries_idempotency_unique
  ON planned_entries (household_id, idempotency_key);
CREATE INDEX planned_entries_household_idx ON planned_entries (household_id);
CREATE INDEX planned_entries_due_date_idx ON planned_entries (household_id, due_date);
CREATE INDEX planned_entries_competence_idx ON planned_entries (household_id, competence_date);
CREATE INDEX planned_entries_status_idx ON planned_entries (household_id, status);
CREATE INDEX planned_entries_member_idx ON planned_entries (member_id);
CREATE INDEX planned_entries_category_idx ON planned_entries (category_id);
CREATE INDEX planned_entries_recurrence_idx ON planned_entries (recurrence_rule_id);
CREATE INDEX planned_entries_installment_group_idx ON planned_entries (installment_group_id);

CREATE TRIGGER planned_entries_set_updated_at
  BEFORE UPDATE ON planned_entries
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

-- Baixas (docs/08 §settlements). Cada baixa gera uma movimentação e pode ser
-- estornada — nunca apagada.
CREATE TABLE settlements (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id            uuid NOT NULL REFERENCES households (id) ON DELETE CASCADE,
  planned_entry_id        uuid NOT NULL REFERENCES planned_entries (id) ON DELETE RESTRICT,
  transaction_id          uuid NOT NULL REFERENCES transactions (id) ON DELETE RESTRICT,
  account_id              uuid NOT NULL REFERENCES accounts (id) ON DELETE RESTRICT,
  principal_amount_minor  bigint NOT NULL,
  interest_amount_minor   bigint NOT NULL DEFAULT 0,
  penalty_amount_minor    bigint NOT NULL DEFAULT 0,
  discount_amount_minor   bigint NOT NULL DEFAULT 0,
  /** principal + juros + multa − desconto: o que de fato sai/entra na conta. */
  net_amount_minor        bigint NOT NULL,
  settled_at              date NOT NULL,
  created_by              uuid NOT NULL REFERENCES profiles (id) ON DELETE RESTRICT,
  created_at              timestamptz NOT NULL DEFAULT now(),
  reversed_at             timestamptz,
  reversed_by             uuid REFERENCES profiles (id) ON DELETE SET NULL,
  reversal_reason         text,
  idempotency_key         text NOT NULL,
  CONSTRAINT settlements_principal_positive CHECK (principal_amount_minor > 0),
  CONSTRAINT settlements_charges_non_negative CHECK (
    interest_amount_minor >= 0 AND penalty_amount_minor >= 0 AND discount_amount_minor >= 0
  ),
  CONSTRAINT settlements_net_matches CHECK (
    net_amount_minor = principal_amount_minor + interest_amount_minor
                       + penalty_amount_minor - discount_amount_minor
  ),
  CONSTRAINT settlements_reversal_requires_reason CHECK (
    reversed_at IS NULL OR length(btrim(coalesce(reversal_reason, ''))) > 0
  )
);

CREATE UNIQUE INDEX settlements_idempotency_unique
  ON settlements (household_id, idempotency_key);
CREATE INDEX settlements_planned_entry_idx ON settlements (planned_entry_id);
CREATE INDEX settlements_transaction_idx ON settlements (transaction_id);
CREATE INDEX settlements_household_idx ON settlements (household_id, settled_at DESC);

-- ------------------------------------------------------------------ derivados

/**
 * Saldo em aberto: valor original menos o PRINCIPAL das baixas não estornadas.
 * Juros e multa não aumentam o saldo em aberto — eles são encargos da baixa,
 * informados separadamente (docs/04 §7).
 */
CREATE OR REPLACE FUNCTION app.planned_entry_outstanding(p_entry uuid) RETURNS bigint
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
    SELECT e.original_amount_minor - COALESCE((
      SELECT sum(s.principal_amount_minor)
        FROM settlements s
       WHERE s.planned_entry_id = e.id AND s.reversed_at IS NULL
    ), 0)
    FROM planned_entries e
    WHERE e.id = p_entry
  $$;

/** Status derivado do saldo em aberto; CANCELED é decisão explícita. */
CREATE OR REPLACE FUNCTION app.planned_entry_status(p_entry uuid) RETURNS text
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
    SELECT CASE
      WHEN e.canceled_at IS NOT NULL THEN 'CANCELED'
      WHEN app.planned_entry_outstanding(e.id) <= 0 THEN 'SETTLED'
      WHEN EXISTS (
        SELECT 1 FROM settlements s
         WHERE s.planned_entry_id = e.id AND s.reversed_at IS NULL
      ) THEN 'PARTIAL'
      ELSE 'OPEN'
    END
    FROM planned_entries e WHERE e.id = p_entry
  $$;

-- ------------------------------------------------------------------ policies

ALTER TABLE installment_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE installment_groups FORCE ROW LEVEL SECURITY;
CREATE POLICY installment_groups_select ON installment_groups
  FOR SELECT TO ff_app USING (app.is_member(household_id));
CREATE POLICY installment_groups_write ON installment_groups
  FOR ALL TO ff_app
  USING (app.is_member(household_id))
  WITH CHECK (app.is_member(household_id) AND created_by = app.current_user_id());

ALTER TABLE recurrence_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE recurrence_rules FORCE ROW LEVEL SECURITY;
CREATE POLICY recurrence_rules_select ON recurrence_rules
  FOR SELECT TO ff_app USING (app.is_member(household_id));
CREATE POLICY recurrence_rules_write ON recurrence_rules
  FOR ALL TO ff_app
  USING (app.can_operate(household_id))
  WITH CHECK (app.can_operate(household_id));

ALTER TABLE planned_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE planned_entries FORCE ROW LEVEL SECURITY;

-- Enxerga a conta prevista quem enxerga a conta esperada; sem conta esperada,
-- todo membro da família enxerga.
CREATE POLICY planned_entries_select ON planned_entries
  FOR SELECT TO ff_app
  USING (
    app.is_member(household_id)
    AND (expected_account_id IS NULL OR app.can_view_account(expected_account_id))
  );

CREATE POLICY planned_entries_insert ON planned_entries
  FOR INSERT TO ff_app
  WITH CHECK (
    app.is_member(household_id)
    AND created_by = app.current_user_id()
    AND (expected_account_id IS NULL OR app.can_transact_account(expected_account_id))
  );

CREATE POLICY planned_entries_update ON planned_entries
  FOR UPDATE TO ff_app
  USING (app.can_operate(household_id))
  WITH CHECK (app.can_operate(household_id));

ALTER TABLE settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE settlements FORCE ROW LEVEL SECURITY;

CREATE POLICY settlements_select ON settlements
  FOR SELECT TO ff_app
  USING (app.is_member(household_id) AND app.can_view_account(account_id));

CREATE POLICY settlements_insert ON settlements
  FOR INSERT TO ff_app
  WITH CHECK (app.can_operate(household_id) AND app.can_transact_account(account_id));

CREATE POLICY settlements_update ON settlements
  FOR UPDATE TO ff_app
  USING (app.can_operate(household_id))
  WITH CHECK (app.can_operate(household_id));

SELECT app.grant_if_role_exists('ff_app', 'SELECT, INSERT, UPDATE', 'public.installment_groups');
SELECT app.grant_if_role_exists('ff_app', 'SELECT, INSERT, UPDATE', 'public.recurrence_rules');
SELECT app.grant_if_role_exists('ff_app', 'SELECT, INSERT, UPDATE', 'public.planned_entries');
SELECT app.grant_if_role_exists('ff_app', 'SELECT, INSERT, UPDATE', 'public.settlements');

-- Down Migration

DROP FUNCTION IF EXISTS app.planned_entry_status(uuid);
DROP FUNCTION IF EXISTS app.planned_entry_outstanding(uuid);
DROP TABLE IF EXISTS settlements;
DROP TABLE IF EXISTS planned_entries;
DROP TABLE IF EXISTS recurrence_rules;
DROP TABLE IF EXISTS installment_groups;
