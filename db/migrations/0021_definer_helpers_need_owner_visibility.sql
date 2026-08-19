-- Corrige o defeito que impedia CRIAR CONTA em produção (500 em POST /accounts).
--
-- Sintoma: a linha era inserida, o SELECT de volta não encontrava nada, e o
-- serviço levantava INTERNAL_ERROR — a transação inteira desfazia. Nenhuma
-- conta chegou a existir.
--
-- Causa: as políticas chamam funções auxiliares `SECURITY DEFINER` (app.can_view_account,
-- app.can_transact_account, app.notifications_generate e mais onze) que precisam
-- LER a própria tabela protegida para decidir. Elas executam como a dona das
-- tabelas, `ff_migrator`. Com FORCE ROW LEVEL SECURITY, a dona também fica sujeita
-- às políticas — e não existe política para `ff_migrator`, só `TO ff_app`. Então a
-- leitura interna devolvia zero linhas e `can_view_account` retornava false para
-- TODO MUNDO, inclusive o Proprietário da família.
--
-- Por que os testes não pegaram: no Postgres do docker, `ff_migrator` é o
-- POSTGRES_USER do contêiner, ou seja, superusuário com BYPASSRLS. As funções
-- ignoravam RLS e tudo passava. No Supabase, `ff_migrator` é papel comum
-- (bypassrls=false) e o mesmo código se comporta ao contrário. Essa divergência
-- de ambiente continua aberta e está registrada em PROGRESS.md: enquanto o
-- migrator local for superusuário, a suíte não consegue provar comportamento de
-- RLS. O teste `db/schema-invariants` cobre pelo menos a reincidência do FORCE.
--
-- Por que a correção não afrouxa o isolamento entre famílias: FORCE só muda o
-- comportamento para a DONA da tabela. O runtime nunca conecta como `ff_migrator`
-- — usa `ff_app` e `ff_auth`, que não são donas e continuam sujeitas às políticas
-- exatamente como antes. Além disso, a dona sempre pôde `ALTER TABLE ... DISABLE
-- ROW LEVEL SECURITY`: FORCE nunca foi barreira contra ela, era proteção contra
-- descuido em script de migração. Essa proteção custou um defeito que derrubou
-- uma funcionalidade inteira em produção, e sai.
--
-- Regra daqui em diante: política que chama função `SECURITY DEFINER` a qual lê a
-- tabela protegida é incompatível com FORCE ROW LEVEL SECURITY. Ver D-096.

ALTER TABLE profiles                    NO FORCE ROW LEVEL SECURITY;
ALTER TABLE devices                     NO FORCE ROW LEVEL SECURITY;
ALTER TABLE auth_tokens                 NO FORCE ROW LEVEL SECURITY;
ALTER TABLE audit_logs                  NO FORCE ROW LEVEL SECURITY;
ALTER TABLE households                  NO FORCE ROW LEVEL SECURITY;
ALTER TABLE invitations                 NO FORCE ROW LEVEL SECURITY;
ALTER TABLE accounts                    NO FORCE ROW LEVEL SECURITY;
ALTER TABLE account_member_permissions  NO FORCE ROW LEVEL SECURITY;
ALTER TABLE categories                  NO FORCE ROW LEVEL SECURITY;
ALTER TABLE counterparties              NO FORCE ROW LEVEL SECURITY;
ALTER TABLE transactions                NO FORCE ROW LEVEL SECURITY;
ALTER TABLE transaction_allocations     NO FORCE ROW LEVEL SECURITY;
ALTER TABLE planned_entries             NO FORCE ROW LEVEL SECURITY;
ALTER TABLE recurrence_rules            NO FORCE ROW LEVEL SECURITY;
ALTER TABLE settlements                 NO FORCE ROW LEVEL SECURITY;
ALTER TABLE attachments                 NO FORCE ROW LEVEL SECURITY;
ALTER TABLE card_statements             NO FORCE ROW LEVEL SECURITY;
ALTER TABLE card_statement_items        NO FORCE ROW LEVEL SECURITY;
ALTER TABLE card_statement_payments     NO FORCE ROW LEVEL SECURITY;
ALTER TABLE installment_groups          NO FORCE ROW LEVEL SECURITY;
ALTER TABLE approval_requests           NO FORCE ROW LEVEL SECURITY;
ALTER TABLE notifications               NO FORCE ROW LEVEL SECURITY;
ALTER TABLE notification_preferences    NO FORCE ROW LEVEL SECURITY;
