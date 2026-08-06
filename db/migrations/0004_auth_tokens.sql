-- `auth_tokens` — tokens de uso único: confirmação de e-mail e magic link
-- (docs/10 §2). Armazenados apenas como hash SHA-256, com expiração curta e
-- consumo idempotente (`consumed_at`).
--
-- A tabela é invisível para o role da aplicação: só o serviço de autenticação
-- toca nela.

-- Up Migration

CREATE TABLE auth_tokens (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES profiles (id) ON DELETE CASCADE,
  purpose      text NOT NULL,
  token_hash   text NOT NULL,
  expires_at   timestamptz NOT NULL,
  consumed_at  timestamptz,
  -- Contexto de emissão, para auditoria (IP e user agent truncados).
  requested_ip inet,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT auth_tokens_purpose_check
    CHECK (purpose IN ('EMAIL_VERIFICATION', 'MAGIC_LINK', 'PASSWORD_RESET')),
  CONSTRAINT auth_tokens_expires_after_creation CHECK (expires_at > created_at)
);

CREATE UNIQUE INDEX auth_tokens_token_hash_unique ON auth_tokens (token_hash);
CREATE INDEX auth_tokens_user_purpose_idx ON auth_tokens (user_id, purpose);
CREATE INDEX auth_tokens_expires_at_idx ON auth_tokens (expires_at);

ALTER TABLE auth_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_tokens FORCE ROW LEVEL SECURITY;

CREATE POLICY auth_tokens_auth_service ON auth_tokens
  FOR ALL TO ff_auth
  USING (true) WITH CHECK (true);

-- Nenhuma policy e nenhum GRANT para ff_app: a tabela não existe para a aplicação.
SELECT app.grant_if_role_exists('ff_auth', 'SELECT, INSERT, UPDATE, DELETE', 'public.auth_tokens');

-- Down Migration

DROP TABLE IF EXISTS auth_tokens;
