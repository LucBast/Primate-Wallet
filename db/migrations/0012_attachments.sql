-- Anexos (docs/08 §attachments, docs/10 §7).
--
-- O arquivo em si vive em bucket privado; aqui fica só o ponteiro. O caminho
-- SEMPRE começa pelo household_id, para que uma URL assinada nunca possa ser
-- reaproveitada entre famílias.

-- Up Migration

CREATE TABLE attachments (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES households (id) ON DELETE CASCADE,
  entity_type  text NOT NULL,
  entity_id    uuid NOT NULL,
  storage_path text NOT NULL,
  file_name    text NOT NULL,
  mime_type    text NOT NULL,
  size_bytes   bigint NOT NULL,
  created_by   uuid NOT NULL REFERENCES profiles (id) ON DELETE RESTRICT,
  created_at   timestamptz NOT NULL DEFAULT now(),
  deleted_at   timestamptz,
  CONSTRAINT attachments_entity_type_check
    CHECK (entity_type IN ('planned_entry', 'transaction', 'settlement', 'card_statement')),
  CONSTRAINT attachments_size_positive CHECK (size_bytes > 0 AND size_bytes <= 26214400),
  -- Só formatos previstos; executável nunca entra (docs/10 §7).
  CONSTRAINT attachments_mime_check CHECK (
    mime_type IN ('image/jpeg', 'image/png', 'image/heic', 'image/webp', 'application/pdf')
  ),
  -- Caminho começa pelo household: isolamento também no storage.
  CONSTRAINT attachments_path_scoped CHECK (storage_path LIKE (household_id::text || '/%'))
);

CREATE INDEX attachments_entity_idx ON attachments (entity_type, entity_id)
  WHERE deleted_at IS NULL;
CREATE INDEX attachments_household_idx ON attachments (household_id);

ALTER TABLE attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE attachments FORCE ROW LEVEL SECURITY;

CREATE POLICY attachments_select ON attachments
  FOR SELECT TO ff_app
  USING (app.is_member(household_id) AND deleted_at IS NULL);

CREATE POLICY attachments_insert ON attachments
  FOR INSERT TO ff_app
  WITH CHECK (app.is_member(household_id) AND created_by = app.current_user_id());

CREATE POLICY attachments_update ON attachments
  FOR UPDATE TO ff_app
  USING (app.can_operate(household_id) OR created_by = app.current_user_id())
  WITH CHECK (app.is_member(household_id));

SELECT app.grant_if_role_exists('ff_app', 'SELECT, INSERT, UPDATE', 'public.attachments');

-- Down Migration

DROP TABLE IF EXISTS attachments;
