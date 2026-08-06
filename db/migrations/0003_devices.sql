-- `devices` — sessões revogáveis (docs/08 §devices, docs/10 §2).
--
-- Uma linha por instalação do app. O refresh token vive aqui SEMPRE em hash
-- (SHA-256): vazamento do banco não permite falsificar sessão. Cada uso do
-- refresh rotaciona o hash; reuso de um token antigo é detectado e revoga a
-- sessão inteira (defesa contra roubo de refresh token).

-- Up Migration

CREATE TABLE devices (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                uuid NOT NULL REFERENCES profiles (id) ON DELETE CASCADE,
  installation_id        text NOT NULL,
  platform               text NOT NULL,
  name                   text NOT NULL,
  app_version            text NOT NULL,
  os_version             text,
  push_token             text,
  refresh_token_hash     text,
  refresh_token_expires_at timestamptz,
  -- Incrementa a cada rotação; usado para diagnosticar reuso de token.
  refresh_rotation_count integer NOT NULL DEFAULT 0,
  last_seen_at           timestamptz NOT NULL DEFAULT now(),
  revoked_at             timestamptz,
  revoked_reason         text,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT devices_platform_check CHECK (platform IN ('ios', 'android', 'web')),
  CONSTRAINT devices_rotation_non_negative CHECK (refresh_rotation_count >= 0),
  CONSTRAINT devices_revoked_reason_requires_revoked_at
    CHECK (revoked_reason IS NULL OR revoked_at IS NOT NULL)
);

-- Uma sessão ativa por instalação e usuário; instalações revogadas ficam no
-- histórico e não colidem.
CREATE UNIQUE INDEX devices_user_installation_active_unique
  ON devices (user_id, installation_id)
  WHERE revoked_at IS NULL;
CREATE INDEX devices_user_id_idx ON devices (user_id);
CREATE INDEX devices_refresh_token_hash_idx ON devices (refresh_token_hash)
  WHERE refresh_token_hash IS NOT NULL;
CREATE INDEX devices_push_token_idx ON devices (push_token) WHERE push_token IS NOT NULL;

CREATE TRIGGER devices_set_updated_at
  BEFORE UPDATE ON devices
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

ALTER TABLE devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE devices FORCE ROW LEVEL SECURITY;

CREATE POLICY devices_auth_service ON devices
  FOR ALL TO ff_auth
  USING (true) WITH CHECK (true);

-- A aplicação lista e revoga as PRÓPRIAS sessões; não enxerga hash de refresh.
CREATE POLICY devices_self_select ON devices
  FOR SELECT TO ff_app
  USING (user_id = app.current_user_id());

CREATE POLICY devices_self_update ON devices
  FOR UPDATE TO ff_app
  USING (user_id = app.current_user_id())
  WITH CHECK (user_id = app.current_user_id());

SELECT app.grant_if_role_exists('ff_auth', 'SELECT, INSERT, UPDATE', 'public.devices');
SELECT app.grant_if_role_exists(
  'ff_app',
  'SELECT (id, user_id, installation_id, platform, name, app_version, os_version, push_token, last_seen_at, revoked_at, revoked_reason, created_at, updated_at)',
  'public.devices'
);
SELECT app.grant_if_role_exists(
  'ff_app',
  'UPDATE (push_token, name, last_seen_at, revoked_at, revoked_reason)',
  'public.devices'
);

-- Down Migration

DROP TABLE IF EXISTS devices;
