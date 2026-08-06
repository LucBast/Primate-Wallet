-- Família e membros (docs/08 §households, §household_members; docs/10 §3, §4).
--
-- Toda linha familiar carrega `household_id`, e as policies derivam de
-- `household_members`. Como as policies de `household_members` precisariam
-- consultar a própria tabela — o que o Postgres recusa por recursão —, os
-- helpers são funções SECURITY DEFINER. Por isso esta tabela NÃO usa
-- FORCE ROW LEVEL SECURITY: a função executa como dona e enxerga o vínculo.

-- Up Migration

CREATE TABLE households (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  currency_code char(3) NOT NULL DEFAULT 'BRL',
  timezone      text NOT NULL DEFAULT 'America/Sao_Paulo',
  created_by    uuid NOT NULL REFERENCES profiles (id) ON DELETE RESTRICT,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz,
  CONSTRAINT households_name_not_blank CHECK (length(btrim(name)) > 0),
  CONSTRAINT households_currency_upper CHECK (currency_code = upper(currency_code))
);

CREATE TABLE household_members (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id             uuid NOT NULL REFERENCES households (id) ON DELETE CASCADE,
  -- Nulo enquanto o convite não foi aceito: a família já lista a pessoa.
  user_id                  uuid REFERENCES profiles (id) ON DELETE SET NULL,
  display_name             text NOT NULL,
  role                     text NOT NULL,
  status                   text NOT NULL DEFAULT 'INVITED',
  is_supervised            boolean NOT NULL DEFAULT false,
  approval_mode            text NOT NULL DEFAULT 'NEVER',
  approval_threshold_minor bigint,
  color                    text,
  joined_at                timestamptz,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  version                  integer NOT NULL DEFAULT 1,
  CONSTRAINT household_members_role_check
    CHECK (role IN ('OWNER', 'ADMIN', 'ADULT', 'MEMBER', 'CHILD')),
  CONSTRAINT household_members_status_check
    CHECK (status IN ('INVITED', 'ACTIVE', 'SUSPENDED', 'REMOVED')),
  CONSTRAINT household_members_approval_mode_check
    CHECK (approval_mode IN ('NEVER', 'ALWAYS', 'ABOVE_THRESHOLD')),
  -- Limite só faz sentido — e é obrigatório — no modo por valor.
  CONSTRAINT household_members_threshold_requires_mode
    CHECK (
      (approval_mode = 'ABOVE_THRESHOLD' AND approval_threshold_minor IS NOT NULL
        AND approval_threshold_minor >= 0)
      OR (approval_mode <> 'ABOVE_THRESHOLD' AND approval_threshold_minor IS NULL)
    ),
  CONSTRAINT household_members_display_name_not_blank
    CHECK (length(btrim(display_name)) > 0),
  CONSTRAINT household_members_active_requires_user
    CHECK (status <> 'ACTIVE' OR user_id IS NOT NULL)
);

-- Uma pessoa entra uma vez por família (multi-família é suportado).
CREATE UNIQUE INDEX household_members_household_user_unique
  ON household_members (household_id, user_id)
  WHERE user_id IS NOT NULL AND status <> 'REMOVED';
CREATE INDEX household_members_household_id_idx ON household_members (household_id);
CREATE INDEX household_members_user_id_idx ON household_members (user_id);
CREATE INDEX household_members_role_idx ON household_members (household_id, role);

-- Exatamente um proprietário ativo por família (docs/05 §3).
CREATE UNIQUE INDEX household_members_single_owner
  ON household_members (household_id)
  WHERE role = 'OWNER' AND status = 'ACTIVE';

CREATE TRIGGER households_set_updated_at
  BEFORE UPDATE ON households
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

CREATE TRIGGER household_members_set_updated_at
  BEFORE UPDATE ON household_members
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

-- ---------------------------------------------------------------- helpers RLS
-- SECURITY DEFINER com search_path fixo: executa como dona da tabela (logo,
-- enxerga o vínculo sem recursão de policy) e não é sequestrável por search_path.

CREATE OR REPLACE FUNCTION app.member_id(p_household uuid) RETURNS uuid
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
    SELECT m.id
      FROM household_members m
     WHERE m.household_id = p_household
       AND m.user_id = app.current_user_id()
       AND m.status = 'ACTIVE'
     LIMIT 1
  $$;

CREATE OR REPLACE FUNCTION app.member_role(p_household uuid) RETURNS text
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
    SELECT m.role
      FROM household_members m
     WHERE m.household_id = p_household
       AND m.user_id = app.current_user_id()
       AND m.status = 'ACTIVE'
     LIMIT 1
  $$;

/* Membro ativo da família. */
CREATE OR REPLACE FUNCTION app.is_member(p_household uuid) RETURNS boolean
  LANGUAGE sql STABLE AS $$ SELECT app.member_id(p_household) IS NOT NULL $$;

/* Proprietário ou Administrador: gestão de membros, permissões e auditoria. */
CREATE OR REPLACE FUNCTION app.is_admin(p_household uuid) RETURNS boolean
  LANGUAGE sql STABLE AS $$ SELECT app.member_role(p_household) IN ('OWNER', 'ADMIN') $$;

CREATE OR REPLACE FUNCTION app.is_owner(p_household uuid) RETURNS boolean
  LANGUAGE sql STABLE AS $$ SELECT app.member_role(p_household) = 'OWNER' $$;

/* Perfis que operam finanças: baixa, transferência, pagamento, estorno. */
CREATE OR REPLACE FUNCTION app.can_operate(p_household uuid) RETURNS boolean
  LANGUAGE sql STABLE AS $$ SELECT app.member_role(p_household) IN ('OWNER', 'ADMIN', 'ADULT') $$;

-- ------------------------------------------------------------------ policies

ALTER TABLE households ENABLE ROW LEVEL SECURITY;
ALTER TABLE households FORCE ROW LEVEL SECURITY;

CREATE POLICY households_member_select ON households
  FOR SELECT TO ff_app
  USING (app.is_member(id) AND deleted_at IS NULL);

-- Criação: o servidor insere a família e, na mesma transação, o proprietário.
-- Por isso o INSERT só exige que o criador seja o próprio usuário da sessão.
CREATE POLICY households_create ON households
  FOR INSERT TO ff_app
  WITH CHECK (created_by = app.current_user_id());

CREATE POLICY households_admin_update ON households
  FOR UPDATE TO ff_app
  USING (app.is_admin(id) AND deleted_at IS NULL)
  WITH CHECK (app.is_admin(id));

ALTER TABLE household_members ENABLE ROW LEVEL SECURITY;
-- Sem FORCE: os helpers SECURITY DEFINER precisam ler o vínculo sem recursão.

CREATE POLICY household_members_select ON household_members
  FOR SELECT TO ff_app
  USING (app.is_member(household_id) OR user_id = app.current_user_id());

-- Só Proprietário/Admin gerenciam membros. A exceção é o primeiro membro da
-- família recém-criada, que ainda não tem quem o autorize: nesse caso a linha
-- precisa ser do próprio usuário, como OWNER.
CREATE POLICY household_members_admin_insert ON household_members
  FOR INSERT TO ff_app
  WITH CHECK (
    app.is_admin(household_id)
    OR (role = 'OWNER' AND user_id = app.current_user_id()
        AND NOT EXISTS (
          SELECT 1 FROM households h
           WHERE h.id = household_id AND h.created_by <> app.current_user_id()
        ))
  );

CREATE POLICY household_members_admin_update ON household_members
  FOR UPDATE TO ff_app
  USING (app.is_admin(household_id))
  WITH CHECK (app.is_admin(household_id));

SELECT app.grant_if_role_exists('ff_app', 'SELECT, INSERT, UPDATE', 'public.households');
SELECT app.grant_if_role_exists('ff_app', 'SELECT, INSERT, UPDATE', 'public.household_members');
SELECT app.grant_if_role_exists('ff_auth', 'SELECT', 'public.household_members');

-- Leitura da trilha de auditoria: Proprietário e Administradores (docs/10 §4).
CREATE POLICY audit_logs_admin_select ON audit_logs
  FOR SELECT TO ff_app
  USING (household_id IS NOT NULL AND app.is_admin(household_id));

SELECT app.grant_if_role_exists('ff_app', 'SELECT', 'public.audit_logs');

-- Down Migration

DROP POLICY IF EXISTS audit_logs_admin_select ON audit_logs;
DROP FUNCTION IF EXISTS app.can_operate(uuid);
DROP FUNCTION IF EXISTS app.is_owner(uuid);
DROP FUNCTION IF EXISTS app.is_admin(uuid);
DROP FUNCTION IF EXISTS app.is_member(uuid);
DROP FUNCTION IF EXISTS app.member_role(uuid);
DROP FUNCTION IF EXISTS app.member_id(uuid);
DROP TABLE IF EXISTS household_members;
DROP TABLE IF EXISTS households;
