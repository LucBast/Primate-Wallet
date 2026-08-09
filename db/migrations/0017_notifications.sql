-- Notificações e preferências (docs/12 §3, §4 e §5; tela 6d).
--
-- Duas regras do pacote moram no schema, não no código:
--
--  1. "Evitar duplicidade" (§5). Um aviso é identificado por `dedupe_key` —
--     algo como `DUE_SOON:<id da conta prevista>:2026-08-08`. O índice único
--     torna impossível gerar o mesmo aviso duas vezes, mesmo que o job rode
--     duas vezes, mesmo que rodem duas instâncias ao mesmo tempo. Sem isso, a
--     pessoa acordaria com três avisos da mesma conta.
--
--  2. "Cancelar notificações de itens pagos ou cancelados" (§5). O aviso NÃO é
--     apagado: ganha `canceled_at` e um motivo. Apagar perderia a explicação de
--     por que o aviso sumiu, e a auditoria de um app financeiro não se dá ao
--     luxo de perder explicação.
--
-- `scheduled_for` é timestamptz calculado a partir do fuso da FAMÍLIA — "9h"
-- significa nove da manhã onde a família vive, não onde o servidor roda.

-- Up Migration

CREATE TABLE notifications (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id    uuid NOT NULL REFERENCES households (id) ON DELETE CASCADE,
  -- Destinatário. Um aviso é sempre de alguém: não existe aviso "da família".
  member_id       uuid NOT NULL REFERENCES household_members (id) ON DELETE CASCADE,
  kind            text NOT NULL,
  title           text NOT NULL,
  body            text,
  /** Para onde o toque leva (docs/12 §6). */
  entity_type     text,
  entity_id       uuid,
  amount_minor    bigint,
  scheduled_for   timestamptz NOT NULL,
  delivered_at    timestamptz,
  read_at         timestamptz,
  canceled_at     timestamptz,
  canceled_reason text,
  dedupe_key      text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notifications_kind_check CHECK (
    kind IN (
      'DUE_SOON', 'OVERDUE', 'STATEMENT_CLOSING', 'STATEMENT_DUE',
      'CARD_LIMIT', 'APPROVAL_REQUESTED', 'INVITE', 'SYNC_FAILED',
      'SECURITY', 'DAILY_SUMMARY'
    )
  ),
  CONSTRAINT notifications_title_not_blank CHECK (length(btrim(title)) > 0),
  CONSTRAINT notifications_canceled_has_reason
    CHECK (canceled_at IS NULL OR canceled_reason IS NOT NULL)
);

-- O que torna a geração idempotente.
CREATE UNIQUE INDEX notifications_dedupe_unique ON notifications (household_id, dedupe_key);
-- A consulta da central: os avisos de uma pessoa, os mais novos primeiro.
CREATE INDEX notifications_member_idx
  ON notifications (member_id, scheduled_for DESC)
  WHERE canceled_at IS NULL;
CREATE INDEX notifications_household_idx ON notifications (household_id);
-- Fila de entrega: o que já venceu a hora e ainda não saiu.
CREATE INDEX notifications_pending_idx
  ON notifications (scheduled_for)
  WHERE delivered_at IS NULL AND canceled_at IS NULL;

/**
 * Preferências por PESSOA, não por família (docs/12 §4).
 *
 * Quem paga as contas quer o aviso de vencimento; quem só registra o próprio
 * gasto, talvez não. Uma linha por membro, criada sob demanda com os padrões
 * da 6d — que são os do screenshot: vencimentos 3 dias antes às 9h, faturas e
 * aprovações ligados, resumo diário desligado.
 */
CREATE TABLE notification_preferences (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id          uuid NOT NULL REFERENCES households (id) ON DELETE CASCADE,
  member_id             uuid NOT NULL REFERENCES household_members (id) ON DELETE CASCADE,
  due_enabled           boolean NOT NULL DEFAULT true,
  due_days_before       integer NOT NULL DEFAULT 3,
  due_hour              integer NOT NULL DEFAULT 9,
  statement_enabled     boolean NOT NULL DEFAULT true,
  approval_enabled      boolean NOT NULL DEFAULT true,
  daily_summary_enabled boolean NOT NULL DEFAULT false,
  daily_summary_hour    integer NOT NULL DEFAULT 20,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  version               integer NOT NULL DEFAULT 1,
  CONSTRAINT notification_preferences_member_unique UNIQUE (member_id),
  CONSTRAINT notification_preferences_days_range
    CHECK (due_days_before BETWEEN 0 AND 30),
  CONSTRAINT notification_preferences_due_hour_range CHECK (due_hour BETWEEN 0 AND 23),
  CONSTRAINT notification_preferences_summary_hour_range
    CHECK (daily_summary_hour BETWEEN 0 AND 23)
);

CREATE INDEX notification_preferences_household_idx
  ON notification_preferences (household_id);

CREATE TRIGGER notification_preferences_set_updated_at
  BEFORE UPDATE ON notification_preferences
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

-- ------------------------------------------------------------------ policies

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications FORCE ROW LEVEL SECURITY;

-- Aviso é correspondência pessoal: só o destinatário lê, nem o Proprietário.
CREATE POLICY notifications_own_select ON notifications
  FOR SELECT TO ff_app
  USING (member_id = app.member_id(household_id));

-- Marcar como lido e dispensar — nada além disso parte do cliente.
CREATE POLICY notifications_own_update ON notifications
  FOR UPDATE TO ff_app
  USING (member_id = app.member_id(household_id))
  WITH CHECK (member_id = app.member_id(household_id));

ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_preferences FORCE ROW LEVEL SECURITY;

CREATE POLICY notification_preferences_own ON notification_preferences
  FOR ALL TO ff_app
  USING (member_id = app.member_id(household_id))
  WITH CHECK (member_id = app.member_id(household_id));

SELECT app.grant_if_role_exists('ff_app', 'SELECT, UPDATE', 'public.notifications');
SELECT app.grant_if_role_exists(
  'ff_app', 'SELECT, INSERT, UPDATE', 'public.notification_preferences'
);

-- Down Migration

DROP TABLE IF EXISTS notification_preferences;
DROP TABLE IF EXISTS notifications;
