-- Geração de avisos e materialização de recorrência como funções privilegiadas.
--
-- O job não tem usuário na sessão, e a RLS — corretamente — não deixa uma
-- sessão sem GUC enxergar linha nenhuma. Havia dois caminhos:
--
--   (a) dar ao processo da API a credencial de MIGRAÇÃO, que tem DDL;
--   (b) expor o trabalho como funções SECURITY DEFINER, que o `ff_app` chama.
--
-- (a) foi descartado: a configuração de runtime valida que
-- `DATABASE_MIGRATION_URL` existe mas NÃO a expõe ao processo, de propósito —
-- a API nunca deve segurar credencial capaz de alterar schema. Dar DDL a ela
-- para gerar aviso de vencimento seria trocar uma conveniência por uma
-- superfície de ataque permanente.
--
-- (b) é o mesmo padrão de `app.account_balance` e `app.member_id`: função de
-- dona da tabela, com `search_path` fixo, fazendo exatamente uma coisa.

-- Up Migration

/**
 * Cancela avisos que deixaram de fazer sentido (docs/12 §5).
 *
 * Conta quitada ou cancelada, fatura fechada, aprovação decidida — e o aviso
 * cuja DATA de vencimento mudou, que é o outro lado de "recalcular após
 * mudança de vencimento": a `dedupe_key` carrega a data antiga, então ela
 * deixa de bater com a linha e o aviso cai.
 */
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
                   OR n.dedupe_key <> split_part(n.dedupe_key, ':', 1) || ':' ||
                      p.id::text || ':' || p.due_date::text)
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

/**
 * Gera os avisos pendentes (docs/12 §5).
 *
 * `ON CONFLICT DO NOTHING` sobre a chave única de deduplicação: rodar duas
 * vezes, ou em duas instâncias, produz um aviso por fato. Todo horário sai do
 * fuso da PRÓPRIA família — "9h" é nove da manhã onde a família vive.
 */
CREATE OR REPLACE FUNCTION app.notifications_generate() RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
  DECLARE
    v_total integer := 0;
    v_count integer;
  BEGIN
    -- Contas previstas a vencer e vencidas.
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
             || p.id::text || ':' || p.due_date::text
      FROM planned_entries p
      JOIN households h ON h.id = p.household_id
      JOIN household_members m ON m.household_id = p.household_id AND m.status = 'ACTIVE'
      JOIN notification_preferences prefs ON prefs.member_id = m.id
     -- OPEN/PARTIAL/SETTLED são DERIVADOS do saldo (0011); só CANCELED é
     -- persistido. Por isso o filtro é "não cancelada e ainda deve algo".
     WHERE p.status <> 'CANCELED'
       AND prefs.due_enabled
       AND p.due_date <= (now() AT TIME ZONE h.timezone)::date + prefs.due_days_before
       AND app.planned_entry_outstanding(p.id) > 0
    ON CONFLICT (household_id, dedupe_key) DO NOTHING;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_total := v_total + v_count;

    -- Faturas prestes a fechar.
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
           'STATEMENT_CLOSING:' || s.id::text || ':' || s.closing_date::text
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

    -- Pedidos de aprovação: alerta imediato para quem decide, nunca para quem pediu.
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

/**
 * Garante a linha de preferências de todo membro ativo.
 *
 * Sem ela o membro não recebe aviso nenhum — as consultas acima entram por
 * `JOIN notification_preferences`. Criar aqui, e não na entrada do membro,
 * cobre também as famílias que já existiam antes desta migração.
 */
CREATE OR REPLACE FUNCTION app.notification_preferences_backfill() RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
  DECLARE
    v_count integer;
  BEGIN
    INSERT INTO notification_preferences (household_id, member_id)
    SELECT m.household_id, m.id
      FROM household_members m
      LEFT JOIN notification_preferences p ON p.member_id = m.id
     WHERE m.status = 'ACTIVE' AND p.id IS NULL;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
  END;
  $$;

/** Regras de recorrência que precisam de mais ocorrências. */
CREATE OR REPLACE FUNCTION app.recurrence_due_rules(p_horizon_days integer)
  RETURNS TABLE (
    id uuid, household_id uuid, frequency text, interval_count integer,
    start_date date, end_date date, max_occurrences integer, day_of_month integer,
    days_of_week integer[], next_generation_date date, template_payload jsonb,
    created_by uuid
  )
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
    SELECT r.id, r.household_id, r.frequency, r.interval_count, r.start_date, r.end_date,
           r.max_occurrences, r.day_of_month, r.days_of_week, r.next_generation_date,
           r.template_payload, r.created_by
      FROM recurrence_rules r
      JOIN households h ON h.id = r.household_id
     WHERE r.is_active
       AND r.next_generation_date <= (now() AT TIME ZONE h.timezone)::date + p_horizon_days
       AND (r.end_date IS NULL OR r.next_generation_date < r.end_date)
  $$;

/**
 * Cria UMA ocorrência da regra e avança o horizonte.
 *
 * O cálculo de QUAL data fica no `@ff/domain`, em TypeScript — a mesma função
 * que o serviço usa ao criar a conta recorrente. Se o SQL recalculasse a regra,
 * uma correção em "todo dia 31 em meses de 30" valeria para um caminho e não
 * para o outro. Aqui só acontece a inserção privilegiada.
 */
CREATE OR REPLACE FUNCTION app.recurrence_materialize(p_rule uuid, p_due date)
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
  DECLARE
    v_rule  recurrence_rules%ROWTYPE;
    v_count integer;
  BEGIN
    SELECT * INTO v_rule FROM recurrence_rules WHERE id = p_rule;
    IF NOT FOUND THEN RETURN 0; END IF;

    INSERT INTO planned_entries (
      household_id, nature, description, original_amount_minor, competence_date,
      due_date, expected_account_id, member_id, category_id, recurrence_rule_id,
      idempotency_key, created_by
    )
    VALUES (
      v_rule.household_id,
      v_rule.template_payload->>'nature',
      v_rule.template_payload->>'description',
      (v_rule.template_payload->>'originalAmountMinor')::bigint,
      p_due, p_due,
      NULLIF(v_rule.template_payload->>'expectedAccountId', '')::uuid,
      (v_rule.template_payload->>'memberId')::uuid,
      NULLIF(v_rule.template_payload->>'categoryId', '')::uuid,
      v_rule.id,
      -- Determinística: mesma regra + mesmo vencimento = mesma chave. É a mesma
      -- garantia que protege o outbox offline, pelo mesmo mecanismo.
      'rec-' || v_rule.id::text || '-' || p_due::text,
      v_rule.created_by
    )
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_count = ROW_COUNT;

    UPDATE recurrence_rules
       SET next_generation_date = GREATEST(next_generation_date, p_due)
     WHERE id = p_rule;

    RETURN v_count;
  END;
  $$;

GRANT EXECUTE ON FUNCTION app.notifications_generate() TO PUBLIC;
GRANT EXECUTE ON FUNCTION app.notifications_cancel_resolved() TO PUBLIC;
GRANT EXECUTE ON FUNCTION app.notification_preferences_backfill() TO PUBLIC;
GRANT EXECUTE ON FUNCTION app.recurrence_due_rules(integer) TO PUBLIC;
GRANT EXECUTE ON FUNCTION app.recurrence_materialize(uuid, date) TO PUBLIC;

-- Down Migration

DROP FUNCTION IF EXISTS app.recurrence_materialize(uuid, date);
DROP FUNCTION IF EXISTS app.recurrence_due_rules(integer);
DROP FUNCTION IF EXISTS app.notification_preferences_backfill();
DROP FUNCTION IF EXISTS app.notifications_generate();
DROP FUNCTION IF EXISTS app.notifications_cancel_resolved();
