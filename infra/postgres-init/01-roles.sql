-- Executado uma única vez, na criação do volume do Postgres de desenvolvimento.
-- Em homologação/produção, o mesmo conteúdo é aplicado pelo runbook de provisionamento
-- (docs/02-ENVIRONMENTS.md) — as migrações NÃO criam roles nem definem senhas.
--
-- Três papéis, com privilégio mínimo:
--   ff_migrator — dono do schema, aplica DDL/migrações.
--   ff_app      — runtime da aplicação. NOBYPASSRLS: enxerga apenas as linhas
--                 permitidas pelas policies, com base no GUC `app.user_id`.
--   ff_auth     — usado EXCLUSIVAMENTE pelo serviço de autenticação, para as
--                 operações que acontecem ANTES de existir sessão (login,
--                 confirmação de e-mail, refresh). Enxerga somente as tabelas
--                 de autenticação, via policies próprias.

CREATE ROLE ff_app LOGIN PASSWORD 'ff_dev_password' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
CREATE ROLE ff_auth LOGIN PASSWORD 'ff_dev_password' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;

GRANT CONNECT ON DATABASE family_finance TO ff_app, ff_auth;
GRANT USAGE ON SCHEMA public TO ff_app, ff_auth;

-- Negar por padrão (docs/10 §1): NÃO existe privilégio padrão de tabela para
-- ff_app nem para ff_auth. Cada migração concede explicitamente as operações
-- (e, quando necessário, as colunas) de que aquela tabela precisa.
ALTER DEFAULT PRIVILEGES FOR ROLE ff_migrator IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO ff_app;
ALTER DEFAULT PRIVILEGES FOR ROLE ff_migrator IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO ff_app, ff_auth;
