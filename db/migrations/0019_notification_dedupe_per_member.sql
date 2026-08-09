-- Correção: a chave de deduplicação precisa incluir o DESTINATÁRIO.
--
-- O defeito, encontrado ao olhar a 6d com a família de demonstração: numa casa
-- com três membros, só UM recebia o aviso de vencimento — e qual deles era
-- decidido pela ordem em que o banco devolveu as linhas.
--
-- A causa: `dedupe_key` era `DUE_SOON:<conta>:<data>`, e o índice único é por
-- `(household_id, dedupe_key)`. A primeira linha inserida ganhava, e o
-- `ON CONFLICT DO NOTHING` engolia as outras duas em silêncio. O aviso de
-- aprovação já fazia certo — a chave dele termina no id de quem decide —, e foi
-- justamente por isso que ele apareceu para a Ana enquanto os vencimentos não.
--
-- A chave passa a terminar no `member_id` nos três geradores. Os avisos já
-- gravados com a chave antiga são apagados (e não cancelados): eles não são
-- fato acontecido, são derivados que serão regerados na próxima passada, agora
-- para todo mundo.

-- Up Migration

DELETE FROM notifications
 WHERE kind IN ('DUE_SOON', 'OVERDUE', 'STATEMENT_CLOSING')
   AND dedupe_key !~ ':[0-9a-f-]{36}$';

CREATE OR REPLACE FUNCTION app.notifications_generate() RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
  DECLARE
    v_total integer := 0;
    v_count integer;
  BEGIN
    INSERT INTO notifications (
      household_id, member_id, kind, title, body, entity_type, entity_id,
      amount_minor, scheduled_for, dedupe_key
    )
    SELECT p.household_id,
           m.id,
           CASE WHEN p.due_date < (now() AT TIME ZONE h.timezone)::date
                THEN 'OVERDUE' ELSE 'DUE_SOON' END,
           CASE WHEN p.due_date < (now() AT TIME ZONE h.timezone)::date
                THEN p.description || ' venceu há ' ||
                     ((now() AT TIME ZONE h.timezone)::date - p.due_date) || ' dias'
                ELSE p.description || ' vence em ' ||
                     (p.due_date - (now() AT TIME ZONE h.timezone)::date) || ' dias' END,
           'toque para dar baixa',
           'planned_entry',
           p.id,
           app.planned_entry_outstanding(p.id),
           (((p.due_date - prefs.due_days_before)::text || ' ' ||
             lpad(prefs.due_hour::text, 2, '0') || ':00:00')::timestamp
            AT TIME ZONE h.timezone),
           CASE WHEN p.due_date < (now() AT TIME ZONE h.timezone)::date
                THEN 'OVERDUE:' ELSE 'DUE_SOON:' END
             || p.id::text || ':' || p.due_date::text || ':' || m.id::text
      FROM planned_entries p
      JOIN households h ON h.id = p.household_id
      JOIN household_members m ON m.household_id = p.household_id AND m.status = 'ACTIVE'
      JOIN notification_preferences prefs ON prefs.member_id = m.id
     WHERE p.status <> 'CANCELED'
       AND prefs.due_enabled
       AND p.due_date <= (now() AT TIME ZONE h.timezone)::date + prefs.due_days_before
       AND app.planned_entry_outstanding(p.id) > 0
    ON CONFLICT (household_id, dedupe_key) DO NOTHING;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_total := v_total + v_count;

    INSERT INTO notifications (
      household_id, member_id, kind, title, body, entity_type, entity_id,
      amount_minor, scheduled_for, dedupe_key
    )
    SELECT s.household_id,
           m.id,
           'STATEMENT_CLOSING',
           'Fatura do ' || a.name || ' fecha em ' ||
             (s.closing_date - (now() AT TIME ZONE h.timezone)::date) || ' dias',
           'vence ' || to_char(s.due_date, 'DD/MM'),
           'card_statement',
           s.id,
           app.card_statement_total(s.id),
           ((s.closing_date::text || ' 09:00:00')::timestamp AT TIME ZONE h.timezone),
           'STATEMENT_CLOSING:' || s.id::text || ':' || s.closing_date::text || ':' || m.id::text
      FROM card_statements s
      JOIN accounts a ON a.id = s.account_id
      JOIN households h ON h.id = s.household_id
      JOIN household_members m ON m.household_id = s.household_id AND m.status = 'ACTIVE'
      JOIN notification_preferences prefs ON prefs.member_id = m.id
     WHERE s.closed_at IS NULL
       AND prefs.statement_enabled
       AND s.closing_date BETWEEN (now() AT TIME ZONE h.timezone)::date
                              AND (now() AT TIME ZONE h.timezone)::date + 5
    ON CONFLICT (household_id, dedupe_key) DO NOTHING;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_total := v_total + v_count;

    INSERT INTO notifications (
      household_id, member_id, kind, title, body, entity_type, entity_id,
      amount_minor, scheduled_for, dedupe_key
    )
    SELECT ar.household_id,
           decisor.id,
           'APPROVAL_REQUESTED',
           rm.display_name || ' pediu aprovação',
           t.description,
           'approval_request',
           ar.id,
           t.amount_minor,
           ar.created_at,
           'APPROVAL_REQUESTED:' || ar.id::text || ':' || decisor.id::text
      FROM approval_requests ar
      JOIN transactions t ON t.id = ar.transaction_id
      JOIN household_members rm ON rm.id = ar.requested_by_member_id
      JOIN household_members decisor
        ON decisor.household_id = ar.household_id
       AND decisor.status = 'ACTIVE'
       AND decisor.role IN ('OWNER', 'ADMIN', 'ADULT')
       AND decisor.id <> ar.requested_by_member_id
      JOIN notification_preferences prefs ON prefs.member_id = decisor.id
     WHERE ar.status = 'PENDING'
       AND prefs.approval_enabled
    ON CONFLICT (household_id, dedupe_key) DO NOTHING;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_total := v_total + v_count;

    RETURN v_total;
  END;
  $$;

-- O cancelamento comparava a chave inteira para detectar mudança de data; com
-- o membro no fim, a comparação passa a ser só das três primeiras partes.
CREATE OR REPLACE FUNCTION app.notifications_cancel_resolved() RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
  DECLARE
    v_count integer;
  BEGIN
    UPDATE notifications n
       SET canceled_at = now(), canceled_reason = 'RESOLVED'
     WHERE n.canceled_at IS NULL
       AND (
         (n.entity_type = 'planned_entry' AND EXISTS (
           SELECT 1 FROM planned_entries p
            WHERE p.id = n.entity_id
              AND (p.status = 'CANCELED'
                   OR app.planned_entry_outstanding(p.id) <= 0
                   -- A data mudou: a chave carrega a data antiga.
                   OR split_part(n.dedupe_key, ':', 3) <> p.due_date::text)
         ))
         OR (n.kind = 'STATEMENT_CLOSING' AND n.entity_type = 'card_statement' AND EXISTS (
           SELECT 1 FROM card_statements s
            WHERE s.id = n.entity_id AND s.closed_at IS NOT NULL
         ))
         OR (n.entity_type = 'approval_request' AND EXISTS (
           SELECT 1 FROM approval_requests ar
            WHERE ar.id = n.entity_id AND ar.status <> 'PENDING'
         ))
       );
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
  END;
  $$;

GRANT EXECUTE ON FUNCTION app.notifications_generate() TO PUBLIC;
GRANT EXECUTE ON FUNCTION app.notifications_cancel_resolved() TO PUBLIC;

-- Down Migration
-- Roll-forward: a versão anterior das funções está na 0018 e não é restaurada
-- aqui, porque voltar a ela reintroduziria o defeito.
