-- Supervisão familiar: pedidos de aprovação (docs/04 §16, docs/05 §4.1; tela 3c).
--
-- A movimentação proposta NÃO é copiada para cá. Ela nasce em `transactions`
-- com status `PENDING_APPROVAL` — status que a tabela já previa desde a 0010 e
-- que o saldo, o limite do cartão e os relatórios já ignoram, porque todos
-- somam apenas `status = 'POSTED'`. É isso que cumpre "não afeta saldo enquanto
-- pendente" sem nenhuma regra nova de cálculo.
--
-- Esta tabela guarda o que a movimentação não sabe: quem pediu, QUAL REGRA
-- estava valendo no momento do pedido (não a de hoje — o adulto pode ter
-- mudado o limite depois), quem decidiu, quando e com que mensagem.
--
-- "Devem preservar o conteúdo original enviado" (docs/04 §16) é garantido por
-- gatilho: enquanto pendente, nenhuma coluna de conteúdo da transação pode
-- mudar, e a saída de PENDING_APPROVAL exige perfil que possa operar.

-- Up Migration

CREATE TABLE approval_requests (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id           uuid NOT NULL REFERENCES households (id) ON DELETE CASCADE,
  -- Uma pendência por movimentação: aprovar duas vezes é impossível por schema.
  transaction_id         uuid NOT NULL UNIQUE REFERENCES transactions (id) ON DELETE CASCADE,
  requested_by_member_id uuid NOT NULL REFERENCES household_members (id) ON DELETE RESTRICT,
  requested_by_user_id   uuid NOT NULL REFERENCES profiles (id) ON DELETE RESTRICT,
  status                 text NOT NULL DEFAULT 'PENDING',
  -- Foto da regra no instante do pedido, para a linha "Regra acionada" da 3c.
  rule_mode              text NOT NULL,
  rule_threshold_minor   bigint,
  decided_by_member_id   uuid REFERENCES household_members (id) ON DELETE SET NULL,
  decided_by_user_id     uuid REFERENCES profiles (id) ON DELETE SET NULL,
  decided_at             timestamptz,
  decision_message       text,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  version                integer NOT NULL DEFAULT 1,
  CONSTRAINT approval_requests_status_check
    CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  CONSTRAINT approval_requests_rule_mode_check
    CHECK (rule_mode IN ('ALWAYS', 'ABOVE_THRESHOLD')),
  -- Decidido implica decisor e data; pendente implica nenhum dos dois.
  CONSTRAINT approval_requests_decision_complete
    CHECK (
      (status = 'PENDING' AND decided_at IS NULL AND decided_by_member_id IS NULL)
      OR (status <> 'PENDING' AND decided_at IS NOT NULL AND decided_by_member_id IS NOT NULL)
    ),
  CONSTRAINT approval_requests_message_not_blank
    CHECK (decision_message IS NULL OR length(btrim(decision_message)) > 0)
);

CREATE INDEX approval_requests_household_idx ON approval_requests (household_id);
-- A consulta quente é "quantas pendências tem esta família" (selo da 3a).
CREATE INDEX approval_requests_pending_idx
  ON approval_requests (household_id, created_at DESC)
  WHERE status = 'PENDING';
CREATE INDEX approval_requests_requester_idx
  ON approval_requests (requested_by_member_id, created_at DESC);

CREATE TRIGGER approval_requests_set_updated_at
  BEFORE UPDATE ON approval_requests
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

-- ------------------------------------------------- conteúdo original imutável

/**
 * Protege a movimentação pendente (docs/04 §16).
 *
 * Enquanto o pedido não é decidido, o que foi enviado não muda: nem valor, nem
 * descrição, nem conta, nem categoria, nem data. E sair de PENDING_APPROVAL —
 * aprovar ou recusar — é privilégio de quem opera finanças, checado no banco e
 * não só no serviço, como manda o CLAUDE.md.
 *
 * A checagem de perfil só roda quando existe usuário na sessão: migração e
 * seed rodam sem GUC e não podem ser barrados por ela.
 */
CREATE OR REPLACE FUNCTION app.guard_pending_transaction() RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
  BEGIN
    IF OLD.status <> 'PENDING_APPROVAL' THEN
      RETURN NEW;
    END IF;

    IF NEW.amount_minor       IS DISTINCT FROM OLD.amount_minor
    OR NEW.description        IS DISTINCT FROM OLD.description
    OR NEW.account_id         IS DISTINCT FROM OLD.account_id
    OR NEW.category_id        IS DISTINCT FROM OLD.category_id
    OR NEW.member_id          IS DISTINCT FROM OLD.member_id
    OR NEW.transaction_type   IS DISTINCT FROM OLD.transaction_type
    OR NEW.competence_date    IS DISTINCT FROM OLD.competence_date
    OR NEW.occurred_at        IS DISTINCT FROM OLD.occurred_at THEN
      RAISE EXCEPTION 'movimentação pendente de aprovação é imutável'
        USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.status <> OLD.status
       AND app.current_user_id() IS NOT NULL
       AND NOT app.can_operate(OLD.household_id) THEN
      RAISE EXCEPTION 'apenas Proprietário, Administrador ou Adulto decide aprovação'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    RETURN NEW;
  END;
  $$;

CREATE TRIGGER transactions_guard_pending
  BEFORE UPDATE ON transactions
  FOR EACH ROW EXECUTE FUNCTION app.guard_pending_transaction();

-- ------------------------------------------------------------------ policies

ALTER TABLE approval_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_requests FORCE ROW LEVEL SECURITY;

-- Quem decide vê tudo; quem pediu vê o próprio pedido e o desfecho dele.
CREATE POLICY approval_requests_select ON approval_requests
  FOR SELECT TO ff_app
  USING (app.can_operate(household_id) OR requested_by_user_id = app.current_user_id());

-- O pedido nasce em nome de quem está lançando — nunca em nome de terceiro.
CREATE POLICY approval_requests_insert ON approval_requests
  FOR INSERT TO ff_app
  WITH CHECK (
    app.is_member(household_id)
    AND requested_by_user_id = app.current_user_id()
    AND status = 'PENDING'
  );

CREATE POLICY approval_requests_decide ON approval_requests
  FOR UPDATE TO ff_app
  USING (app.can_operate(household_id))
  WITH CHECK (app.can_operate(household_id));

SELECT app.grant_if_role_exists('ff_app', 'SELECT, INSERT, UPDATE', 'public.approval_requests');

-- Down Migration

DROP TRIGGER IF EXISTS transactions_guard_pending ON transactions;
DROP FUNCTION IF EXISTS app.guard_pending_transaction();
DROP TABLE IF EXISTS approval_requests;
