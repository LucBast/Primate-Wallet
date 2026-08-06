-- Fundação do banco: schema utilitário `app`, identidade da sessão (GUC) e
-- gatilho de updated_at. Nenhuma tabela de negócio aqui.
--
-- Identidade da sessão (docs/10 §3): cada request abre uma transação e executa
-- `SET LOCAL app.user_id = '<uuid>'`. Todas as policies derivam daí. O cliente
-- nunca informa household ou role — o servidor resolve.

-- Up Migration

CREATE EXTENSION IF NOT EXISTS citext;

CREATE SCHEMA IF NOT EXISTS app;
GRANT USAGE ON SCHEMA app TO ff_app, ff_auth;

-- Usuário autenticado da transação corrente. NULL quando não há sessão —
-- e policies que dependem dele então não liberam nada (negar por padrão).
CREATE OR REPLACE FUNCTION app.current_user_id() RETURNS uuid
  LANGUAGE sql
  STABLE
  AS $$
    SELECT NULLIF(current_setting('app.user_id', true), '')::uuid
  $$;

COMMENT ON FUNCTION app.current_user_id() IS
  'ID do usuário da transação corrente, vindo do GUC app.user_id definido por SET LOCAL.';

CREATE OR REPLACE FUNCTION app.set_updated_at() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
  BEGIN
    NEW.updated_at := now();
    RETURN NEW;
  END;
  $$;

-- Concede privilégios apenas se o role já foi provisionado no ambiente.
-- Roles são criados fora das migrações (infra/postgres-init, runbook de ops).
CREATE OR REPLACE FUNCTION app.grant_if_role_exists(
  p_role text,
  p_privileges text,
  p_object text
) RETURNS void
  LANGUAGE plpgsql
  AS $$
  BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = p_role) THEN
      EXECUTE format('GRANT %s ON %s TO %I', p_privileges, p_object, p_role);
    END IF;
  END;
  $$;

REVOKE ALL ON FUNCTION app.grant_if_role_exists(text, text, text) FROM PUBLIC;

-- Down Migration

DROP FUNCTION IF EXISTS app.grant_if_role_exists(text, text, text);
DROP FUNCTION IF EXISTS app.set_updated_at();
DROP FUNCTION IF EXISTS app.current_user_id();
DROP SCHEMA IF EXISTS app;
