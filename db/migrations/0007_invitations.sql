-- Convites (docs/08 §invitations, docs/05 §6b).
--
-- O token viaja por e-mail e é guardado só em hash, como os demais tokens de
-- uso único. Um convite vale para UM e-mail, expira, e pode ser revogado.

-- Up Migration

CREATE TABLE invitations (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id   uuid NOT NULL REFERENCES households (id) ON DELETE CASCADE,
  -- Membro já criado com status INVITED, para a família enxergar a pendência.
  member_id      uuid REFERENCES household_members (id) ON DELETE CASCADE,
  email          citext NOT NULL,
  token_hash     text NOT NULL,
  role           text NOT NULL,
  expires_at     timestamptz NOT NULL,
  accepted_at    timestamptz,
  revoked_at     timestamptz,
  created_by     uuid NOT NULL REFERENCES profiles (id) ON DELETE RESTRICT,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT invitations_role_check CHECK (role IN ('ADMIN', 'ADULT', 'MEMBER', 'CHILD')),
  CONSTRAINT invitations_expires_after_creation CHECK (expires_at > created_at),
  CONSTRAINT invitations_not_accepted_and_revoked
    CHECK (accepted_at IS NULL OR revoked_at IS NULL)
);

CREATE UNIQUE INDEX invitations_token_hash_unique ON invitations (token_hash);
-- Um convite pendente por e-mail e família.
CREATE UNIQUE INDEX invitations_pending_unique
  ON invitations (household_id, email)
  WHERE accepted_at IS NULL AND revoked_at IS NULL;
CREATE INDEX invitations_household_id_idx ON invitations (household_id);
CREATE INDEX invitations_email_idx ON invitations (email);

ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations FORCE ROW LEVEL SECURITY;

-- A família enxerga os convites pendentes; só Proprietário/Admin cria e revoga.
CREATE POLICY invitations_member_select ON invitations
  FOR SELECT TO ff_app
  USING (app.is_member(household_id));

CREATE POLICY invitations_admin_insert ON invitations
  FOR INSERT TO ff_app
  WITH CHECK (app.is_admin(household_id) AND created_by = app.current_user_id());

CREATE POLICY invitations_admin_update ON invitations
  FOR UPDATE TO ff_app
  USING (app.is_admin(household_id))
  WITH CHECK (app.is_admin(household_id));

-- Quem aceita o convite AINDA NÃO é membro da família — nenhuma policy baseada
-- em `app.is_member` poderia autorizá-lo. A troca do token pela associação roda,
-- portanto, pela conexão de autenticação, que é a mesma que já trata identidade
-- antes de existir vínculo. O serviço valida token, expiração e e-mail.
CREATE POLICY invitations_auth_service ON invitations
  FOR ALL TO ff_auth
  USING (true) WITH CHECK (true);

CREATE POLICY household_members_auth_service ON household_members
  FOR ALL TO ff_auth
  USING (true) WITH CHECK (true);

CREATE POLICY households_auth_service ON households
  FOR SELECT TO ff_auth
  USING (true);

SELECT app.grant_if_role_exists('ff_app', 'SELECT, INSERT, UPDATE', 'public.invitations');
SELECT app.grant_if_role_exists('ff_auth', 'SELECT, INSERT, UPDATE', 'public.invitations');
SELECT app.grant_if_role_exists('ff_auth', 'SELECT, INSERT, UPDATE', 'public.household_members');
SELECT app.grant_if_role_exists('ff_auth', 'SELECT', 'public.households');

-- Down Migration

DROP TABLE IF EXISTS invitations;
