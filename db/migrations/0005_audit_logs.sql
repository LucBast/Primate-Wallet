-- `audit_logs` — trilha de auditoria (docs/08 §audit_logs, docs/14 §4).
--
-- Já nasce na Fase 0 porque as ações sensíveis de autenticação (login, falha de
-- login, revogação de sessão) precisam ser auditadas desde o primeiro dia.
-- `household_id` é nulo enquanto a ação não pertence a uma família — as fases
-- seguintes preenchem esse campo.
--
-- A trilha é append-only: nem ff_app nem ff_auth podem alterar ou apagar linhas.

-- Up Migration

CREATE TABLE audit_logs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id  uuid,
  actor_user_id uuid REFERENCES profiles (id) ON DELETE SET NULL,
  entity_type   text NOT NULL,
  entity_id     uuid,
  action        text NOT NULL,
  before_data   jsonb,
  after_data    jsonb,
  metadata      jsonb,
  request_id    text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT audit_logs_entity_type_not_blank CHECK (length(btrim(entity_type)) > 0),
  CONSTRAINT audit_logs_action_not_blank CHECK (length(btrim(action)) > 0)
);

CREATE INDEX audit_logs_household_id_idx ON audit_logs (household_id, created_at DESC);
CREATE INDEX audit_logs_actor_idx ON audit_logs (actor_user_id, created_at DESC);
CREATE INDEX audit_logs_entity_idx ON audit_logs (entity_type, entity_id);
CREATE INDEX audit_logs_created_at_idx ON audit_logs (created_at DESC);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;

-- Escrita permitida; leitura da trilha familiar entra na Fase 1, junto com
-- household_members (a tela "Atividade" depende do vínculo com a família).
CREATE POLICY audit_logs_app_insert ON audit_logs
  FOR INSERT TO ff_app
  WITH CHECK (actor_user_id IS NOT DISTINCT FROM app.current_user_id());

CREATE POLICY audit_logs_auth_insert ON audit_logs
  FOR INSERT TO ff_auth
  WITH CHECK (true);

SELECT app.grant_if_role_exists('ff_app', 'INSERT', 'public.audit_logs');
SELECT app.grant_if_role_exists('ff_auth', 'INSERT', 'public.audit_logs');

-- Down Migration

DROP TABLE IF EXISTS audit_logs;
