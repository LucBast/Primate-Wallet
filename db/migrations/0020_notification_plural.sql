-- Correção de copy: "venceu há 1 dias".
--
-- O texto do aviso é concatenado no SQL, e a concatenação não sabia contar: com
-- um dia de atraso saía "venceu há 1 dias". A copy pt-BR é final e não se
-- parafraseia (CLAUDE.md item 5) — muito menos se erra a concordância na frase
-- que a pessoa lê primeiro, no aviso que chega antes de ela abrir o app.

-- Up Migration

/** "1 dia" / "3 dias". Existe porque a frase é montada em SQL. */
CREATE OR REPLACE FUNCTION app.plural_dias(p_dias integer) RETURNS text
  LANGUAGE sql
  IMMUTABLE
  AS $$ SELECT p_dias || CASE WHEN p_dias = 1 THEN ' dia' ELSE ' dias' END $$;

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
                     app.plural_dias(((now() AT TIME ZONE h.timezone)::date - p.due_date))
                WHEN p.due_date = (now() AT TIME ZONE h.timezone)::date
                THEN p.description || ' vence hoje'
                ELSE p.description || ' vence em ' ||
                     app.plural_dias((p.due_date - (now() AT TIME ZONE h.timezone)::date)) END,
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
           CASE WHEN s.closing_date = (now() AT TIME ZONE h.timezone)::date
                THEN 'Fatura do ' || a.name || ' fecha hoje'
                ELSE 'Fatura do ' || a.name || ' fecha em ' ||
                     app.plural_dias((s.closing_date - (now() AT TIME ZONE h.timezone)::date))
           END,
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

GRANT EXECUTE ON FUNCTION app.notifications_generate() TO PUBLIC;
GRANT EXECUTE ON FUNCTION app.plural_dias(integer) TO PUBLIC;

-- Os títulos já gravados carregam o texto errado; apagar deixa a próxima
-- passada regerar com a frase certa. Aviso é derivado, não fato acontecido.
DELETE FROM notifications WHERE kind IN ('DUE_SOON', 'OVERDUE', 'STATEMENT_CLOSING');

-- Down Migration

DROP FUNCTION IF EXISTS app.plural_dias(integer);
