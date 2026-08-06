-- Contas e cartões na MESMA tabela (docs/04, invariante nº 2; docs/08 §accounts).
--
-- Um cartão de crédito é uma conta com `account_type = 'CREDIT_CARD'` e os
-- campos de cartão preenchidos. As constraints garantem os dois lados: cartão
-- exige limite/fechamento/vencimento, e conta não-cartão não pode ter esses
-- campos — é o que impede o modelo de derivar para duas tabelas disfarçadas.
--
-- Visibilidade (docs/10 §5): HOUSEHOLD, ADULTS_ONLY, SELECTED_MEMBERS e
-- OWNER_ONLY, aplicadas por RLS. Conta restrita simplesmente não chega ao
-- cliente — a UI não "borra" nada.

-- Up Migration

CREATE TABLE accounts (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id          uuid NOT NULL REFERENCES households (id) ON DELETE CASCADE,
  name                  text NOT NULL,
  account_type          text NOT NULL,
  institution_name      text,
  currency_code         char(3) NOT NULL DEFAULT 'BRL',
  opening_balance_minor bigint NOT NULL DEFAULT 0,
  opening_balance_date  date NOT NULL DEFAULT CURRENT_DATE,
  primary_member_id     uuid REFERENCES household_members (id) ON DELETE SET NULL,
  visibility_scope      text NOT NULL DEFAULT 'HOUSEHOLD',
  color                 text,
  icon                  text,

  -- Campos exclusivos de cartão de crédito.
  card_brand                 text,
  card_last_four             char(4),
  credit_limit_minor         bigint,
  closing_day                smallint,
  due_day                    smallint,
  default_payment_account_id uuid REFERENCES accounts (id) ON DELETE SET NULL,

  created_by  uuid NOT NULL REFERENCES profiles (id) ON DELETE RESTRICT,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  version     integer NOT NULL DEFAULT 1,

  CONSTRAINT accounts_name_not_blank CHECK (length(btrim(name)) > 0),
  CONSTRAINT accounts_type_check CHECK (
    account_type IN ('CHECKING', 'SAVINGS', 'CASH', 'DIGITAL_WALLET', 'INVESTMENT', 'CREDIT_CARD')
  ),
  CONSTRAINT accounts_visibility_check CHECK (
    visibility_scope IN ('HOUSEHOLD', 'ADULTS_ONLY', 'SELECTED_MEMBERS', 'OWNER_ONLY')
  ),
  -- Cartão exige limite, dia de fechamento e dia de vencimento.
  CONSTRAINT accounts_card_requires_fields CHECK (
    account_type <> 'CREDIT_CARD'
    OR (credit_limit_minor IS NOT NULL AND closing_day IS NOT NULL AND due_day IS NOT NULL)
  ),
  -- Conta que não é cartão não carrega campos de cartão.
  CONSTRAINT accounts_non_card_has_no_card_fields CHECK (
    account_type = 'CREDIT_CARD'
    OR (card_brand IS NULL AND card_last_four IS NULL AND credit_limit_minor IS NULL
        AND closing_day IS NULL AND due_day IS NULL AND default_payment_account_id IS NULL)
  ),
  CONSTRAINT accounts_closing_day_range CHECK (closing_day IS NULL OR closing_day BETWEEN 1 AND 31),
  CONSTRAINT accounts_due_day_range CHECK (due_day IS NULL OR due_day BETWEEN 1 AND 31),
  CONSTRAINT accounts_credit_limit_non_negative
    CHECK (credit_limit_minor IS NULL OR credit_limit_minor >= 0),
  CONSTRAINT accounts_card_last_four_digits
    CHECK (card_last_four IS NULL OR card_last_four ~ '^[0-9]{4}$'),
  CONSTRAINT accounts_payment_account_is_not_self
    CHECK (default_payment_account_id IS NULL OR default_payment_account_id <> id)
);

CREATE INDEX accounts_household_id_idx ON accounts (household_id);
CREATE INDEX accounts_household_active_idx ON accounts (household_id) WHERE archived_at IS NULL;
CREATE INDEX accounts_primary_member_idx ON accounts (primary_member_id);
CREATE UNIQUE INDEX accounts_household_name_unique
  ON accounts (household_id, lower(name)) WHERE archived_at IS NULL;

CREATE TRIGGER accounts_set_updated_at
  BEFORE UPDATE ON accounts
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

-- Permissões por conta e membro (docs/08 §account_member_permissions).
CREATE TABLE account_member_permissions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES households (id) ON DELETE CASCADE,
  account_id   uuid NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  member_id    uuid NOT NULL REFERENCES household_members (id) ON DELETE CASCADE,
  can_view     boolean NOT NULL DEFAULT true,
  can_transact boolean NOT NULL DEFAULT false,
  can_edit     boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT account_member_permissions_unique UNIQUE (account_id, member_id),
  -- Não faz sentido lançar ou editar sem poder ver.
  CONSTRAINT account_member_permissions_transact_requires_view
    CHECK (NOT (can_transact OR can_edit) OR can_view)
);

CREATE INDEX account_member_permissions_member_idx ON account_member_permissions (member_id);
CREATE INDEX account_member_permissions_account_idx ON account_member_permissions (account_id);

CREATE TRIGGER account_member_permissions_set_updated_at
  BEFORE UPDATE ON account_member_permissions
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

-- ------------------------------------------------------------------ helpers
--
-- Visibilidade efetiva de uma conta para o usuário da sessão. SECURITY DEFINER
-- porque precisa consultar accounts e account_member_permissions sem cair na
-- policy que está justamente sendo avaliada.

CREATE OR REPLACE FUNCTION app.can_view_account(p_account uuid) RETURNS boolean
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
  DECLARE
    v_household uuid;
    v_scope     text;
    v_owner     uuid;
    v_role      text;
    v_member    uuid;
  BEGIN
    SELECT a.household_id, a.visibility_scope, a.primary_member_id
      INTO v_household, v_scope, v_owner
      FROM accounts a WHERE a.id = p_account;

    IF v_household IS NULL THEN RETURN false; END IF;

    v_role := app.member_role(v_household);
    IF v_role IS NULL THEN RETURN false; END IF;

    -- Proprietário e Administrador enxergam todas as contas da família.
    IF v_role IN ('OWNER', 'ADMIN') THEN RETURN true; END IF;

    v_member := app.member_id(v_household);

    -- Permissão explícita vence o escopo, para mais ou para menos.
    IF EXISTS (
      SELECT 1 FROM account_member_permissions p
       WHERE p.account_id = p_account AND p.member_id = v_member AND p.can_view
    ) THEN
      RETURN true;
    END IF;

    RETURN CASE v_scope
      WHEN 'HOUSEHOLD' THEN true
      WHEN 'ADULTS_ONLY' THEN v_role = 'ADULT'
      WHEN 'OWNER_ONLY' THEN v_member = v_owner
      ELSE false  -- SELECTED_MEMBERS: só com permissão explícita, já testada acima
    END;
  END;
  $$;

/** Pode lançar na conta: precisa ver, e ter permissão de transacionar. */
CREATE OR REPLACE FUNCTION app.can_transact_account(p_account uuid) RETURNS boolean
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
  DECLARE
    v_household uuid;
    v_role      text;
    v_member    uuid;
  BEGIN
    IF NOT app.can_view_account(p_account) THEN RETURN false; END IF;

    SELECT a.household_id INTO v_household FROM accounts a WHERE a.id = p_account;
    v_role := app.member_role(v_household);
    IF v_role IN ('OWNER', 'ADMIN', 'ADULT') THEN RETURN true; END IF;

    v_member := app.member_id(v_household);
    RETURN EXISTS (
      SELECT 1 FROM account_member_permissions p
       WHERE p.account_id = p_account AND p.member_id = v_member AND p.can_transact
    );
  END;
  $$;

-- ------------------------------------------------------------------ policies

ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts FORCE ROW LEVEL SECURITY;

CREATE POLICY accounts_select ON accounts
  FOR SELECT TO ff_app
  USING (app.can_view_account(id));

-- Criar e editar contas: Proprietário, Admin e Adulto (matriz de permissões).
CREATE POLICY accounts_insert ON accounts
  FOR INSERT TO ff_app
  WITH CHECK (app.can_operate(household_id) AND created_by = app.current_user_id());

CREATE POLICY accounts_update ON accounts
  FOR UPDATE TO ff_app
  USING (app.can_operate(household_id) AND app.can_view_account(id))
  WITH CHECK (app.can_operate(household_id));

ALTER TABLE account_member_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_member_permissions FORCE ROW LEVEL SECURITY;

CREATE POLICY account_member_permissions_select ON account_member_permissions
  FOR SELECT TO ff_app
  USING (app.is_admin(household_id) OR member_id = app.member_id(household_id));

CREATE POLICY account_member_permissions_admin_write ON account_member_permissions
  FOR ALL TO ff_app
  USING (app.is_admin(household_id))
  WITH CHECK (app.is_admin(household_id));

SELECT app.grant_if_role_exists('ff_app', 'SELECT, INSERT, UPDATE', 'public.accounts');
SELECT app.grant_if_role_exists(
  'ff_app', 'SELECT, INSERT, UPDATE, DELETE', 'public.account_member_permissions'
);

-- Down Migration

DROP FUNCTION IF EXISTS app.can_transact_account(uuid);
DROP FUNCTION IF EXISTS app.can_view_account(uuid);
DROP TABLE IF EXISTS account_member_permissions;
DROP TABLE IF EXISTS accounts;
