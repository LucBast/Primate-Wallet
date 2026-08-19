-- Provisionamento dos roles no Supabase — equivalente de produção do
-- `infra/postgres-init/01-roles.sql`, que só roda na criação do volume local.
--
-- Rode UMA VEZ, no SQL Editor do Supabase, ANTES da primeira migração. O editor
-- executa como `postgres`, que é dono do banco no Supabase e tem CREATEROLE —
-- é dele que os privilégios abaixo derivam.
--
-- As migrações NÃO criam roles nem definem senhas, por desenho: `db/migrations`
-- é versionado e público dentro do repositório.
--
-- >>> Troque os três marcadores de senha antes de executar. <<<
--     Gere cada uma com:
--     node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"
--
-- Por que três roles e não o `postgres` do Supabase: o `postgres` ignora RLS.
-- Usá-lo como runtime da API tornaria decorativa toda a política de isolamento
-- por família — o `household_id` continuaria na tabela e deixaria de valer
-- alguma coisa. `ff_app` é NOBYPASSRLS justamente para que as policies mordam.

-- ---------------------------------------------------------------------------
-- 1. Os três papéis
-- ---------------------------------------------------------------------------
--   ff_migrator — dono do schema, aplica DDL/migrações.
--   ff_app      — runtime da API. NOBYPASSRLS: enxerga só o que a policy deixa,
--                 a partir do GUC `app.user_id` de cada transação.
--   ff_auth     — exclusivo do serviço de autenticação, para o que acontece
--                 ANTES de existir sessão (login, confirmação, refresh).

CREATE ROLE ff_migrator LOGIN PASSWORD 'TROQUE_SENHA_MIGRATOR'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
CREATE ROLE ff_app LOGIN PASSWORD 'TROQUE_SENHA_APP'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
CREATE ROLE ff_auth LOGIN PASSWORD 'TROQUE_SENHA_AUTH'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;

-- O `postgres` precisa ser MEMBRO de ff_migrator para poder executar o
-- `ALTER DEFAULT PRIVILEGES FOR ROLE ff_migrator` lá embaixo — o Postgres só
-- aceita alterar os padrões de um role do qual você faz parte.
GRANT ff_migrator TO postgres;

-- ---------------------------------------------------------------------------
-- 2. Conectar e criar
-- ---------------------------------------------------------------------------
-- No Supabase o banco se chama `postgres` (não `family_finance`).
GRANT CONNECT ON DATABASE postgres TO ff_migrator, ff_app, ff_auth;

-- A migração 0001 faz `CREATE SCHEMA app`, e para isso precisa de CREATE no
-- banco; e cria tabelas em `public`, e para isso precisa de CREATE no schema.
GRANT CREATE ON DATABASE postgres TO ff_migrator;
GRANT CREATE, USAGE ON SCHEMA public TO ff_migrator;
GRANT USAGE ON SCHEMA public TO ff_app, ff_auth;

-- ---------------------------------------------------------------------------
-- 3. citext
-- ---------------------------------------------------------------------------
-- A migração 0001 pede `CREATE EXTENSION IF NOT EXISTS citext`. No Supabase as
-- extensões moram no schema `extensions`, e se o citext já estiver lá o
-- IF NOT EXISTS vira no-op — o tipo existe, mas não é encontrado por quem não
-- tem `extensions` no search_path. Daí as duas linhas: instalar se faltar, e
-- garantir o caminho de busca para os três roles.
CREATE EXTENSION IF NOT EXISTS citext WITH SCHEMA extensions;
GRANT USAGE ON SCHEMA extensions TO ff_migrator, ff_app, ff_auth;

ALTER ROLE ff_migrator SET search_path = public, extensions;
ALTER ROLE ff_app      SET search_path = public, extensions;
ALTER ROLE ff_auth     SET search_path = public, extensions;

-- ---------------------------------------------------------------------------
-- 4. Negar por padrão
-- ---------------------------------------------------------------------------
-- Não existe privilégio padrão de TABELA para ff_app nem ff_auth: cada migração
-- concede explicitamente as operações (e, quando é o caso, as colunas) de que
-- aquela tabela precisa. Sequências e funções, sim — senão todo INSERT com
-- identidade e toda função SECURITY DEFINER precisariam de um GRANT manual.
ALTER DEFAULT PRIVILEGES FOR ROLE ff_migrator IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO ff_app;
ALTER DEFAULT PRIVILEGES FOR ROLE ff_migrator IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO ff_app, ff_auth;

-- ---------------------------------------------------------------------------
-- 5. Conferência
-- ---------------------------------------------------------------------------
-- Os três precisam sair com rolbypassrls = false. Se algum sair true, pare: a
-- RLS não estará valendo para ele.
SELECT rolname, rolcanlogin, rolbypassrls, rolsuper
  FROM pg_roles
 WHERE rolname IN ('ff_migrator', 'ff_app', 'ff_auth')
 ORDER BY rolname;
