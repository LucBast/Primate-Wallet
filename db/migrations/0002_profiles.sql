-- `profiles` — identidade da pessoa (docs/08 §profiles).
--
-- O pacote original apontava para `auth.users` do Supabase; como a stack passou
-- a ter autenticação própria (docs/01), as credenciais moram aqui, isoladas por
-- privilégio: só o role `ff_auth` enxerga a tabela inteira. O role da aplicação
-- (`ff_app`) enxerga apenas a própria linha e NUNCA o hash de senha.

-- Up Migration

CREATE TABLE profiles (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email          citext NOT NULL,
  password_hash  text,
  name           text NOT NULL,
  phone          text,
  avatar_url     text,
  email_verified_at timestamptz,
  -- Bloqueio temporário por tentativas de login (proteção contra força bruta).
  locked_until   timestamptz,
  failed_login_count integer NOT NULL DEFAULT 0,
  last_login_at  timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  deleted_at     timestamptz,
  CONSTRAINT profiles_email_format CHECK (position('@' IN email) > 1),
  CONSTRAINT profiles_name_not_blank CHECK (length(btrim(name)) > 0),
  CONSTRAINT profiles_failed_login_count_non_negative CHECK (failed_login_count >= 0)
);

-- Unicidade case-insensitive: citext já compara sem diferenciar maiúsculas.
CREATE UNIQUE INDEX profiles_email_unique ON profiles (email) WHERE deleted_at IS NULL;
CREATE INDEX profiles_created_at_idx ON profiles (created_at);

CREATE TRIGGER profiles_set_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles FORCE ROW LEVEL SECURITY;

-- Serviço de autenticação: acesso total (login, cadastro, confirmação).
CREATE POLICY profiles_auth_service ON profiles
  FOR ALL TO ff_auth
  USING (true) WITH CHECK (true);

-- Aplicação: apenas a própria linha, e só quando existe sessão.
CREATE POLICY profiles_self_select ON profiles
  FOR SELECT TO ff_app
  USING (id = app.current_user_id() AND deleted_at IS NULL);

CREATE POLICY profiles_self_update ON profiles
  FOR UPDATE TO ff_app
  USING (id = app.current_user_id() AND deleted_at IS NULL)
  WITH CHECK (id = app.current_user_id());

SELECT app.grant_if_role_exists('ff_auth', 'SELECT, INSERT, UPDATE', 'public.profiles');

-- Defesa em profundidade: além da policy, o role da aplicação recebe privilégio
-- por COLUNA. `password_hash`, `locked_until` e `failed_login_count` ficam fora —
-- são exclusivos do serviço de autenticação.
SELECT app.grant_if_role_exists(
  'ff_app',
  'SELECT (id, email, name, phone, avatar_url, email_verified_at, last_login_at, created_at, updated_at, deleted_at)',
  'public.profiles'
);
SELECT app.grant_if_role_exists('ff_app', 'UPDATE (name, phone, avatar_url)', 'public.profiles');

-- Down Migration

DROP TABLE IF EXISTS profiles;
