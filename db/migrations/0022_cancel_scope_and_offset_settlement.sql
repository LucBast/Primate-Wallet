-- Três capacidades que faltavam nas contas previstas (docs/04):
--
--   1. cancelar "esta e as próximas" de uma série, não só uma por vez;
--   2. DESFAZER um cancelamento, porque errar é normal e cancelar não apaga;
--   3. baixar uma conta prevista com transações JÁ REGISTRADAS (compensação),
--      para o caso de "fiz consertos que eram do proprietário e ele mandou
--      abater do aluguel".
--
-- ---------------------------------------------------------------- 1 e 2

-- Cancelar em série toca N linhas. Sem saber QUAIS, desfazer viraria adivinhação
-- — "descancelar tudo que está cancelado" apagaria cancelamentos legítimos
-- anteriores. O lote identifica exatamente o que uma ação fez. Cancelamento de
-- uma conta só também recebe lote, de tamanho 1: uma regra só, sem exceção.
ALTER TABLE planned_entries ADD COLUMN cancel_batch_id uuid;

CREATE INDEX planned_entries_cancel_batch_idx
  ON planned_entries (cancel_batch_id) WHERE cancel_batch_id IS NOT NULL;

-- ------------------------------------------------------------------ 3

-- Duas naturezas de baixa, e a diferença é onde o dinheiro está:
--
--   CASH   — a baixa CRIA a movimentação: o dinheiro sai agora.
--   OFFSET — a baixa APROVEITA uma movimentação que já existe: o dinheiro já
--            saiu quando o conserto foi pago. Nada de novo se move, e por isso
--            `net_amount_minor` é zero.
--
-- Sem essa distinção, registrar o abatimento como baixa normal criaria uma
-- segunda saída de caixa e a despesa apareceria duas vezes.
ALTER TABLE settlements
  ADD COLUMN kind text NOT NULL DEFAULT 'CASH'
  CONSTRAINT settlements_kind_check CHECK (kind IN ('CASH', 'OFFSET'));

-- A identidade `net = principal + juros + multa − desconto` continua valendo
-- para a baixa em dinheiro. Para a compensação, o líquido é zero por definição:
-- juros, multa e desconto não fazem sentido num encontro de contas — o que se
-- compensa é o principal, pelo valor exato da transação escolhida.
ALTER TABLE settlements DROP CONSTRAINT settlements_net_matches;
ALTER TABLE settlements ADD CONSTRAINT settlements_net_matches CHECK (
  (kind = 'CASH' AND net_amount_minor = principal_amount_minor + interest_amount_minor
                                        + penalty_amount_minor - discount_amount_minor)
  OR
  (kind = 'OFFSET' AND net_amount_minor = 0 AND interest_amount_minor = 0
                   AND penalty_amount_minor = 0 AND discount_amount_minor = 0)
);

-- Uma transação não pode quitar duas coisas. Na baixa em dinheiro isso já era
-- verdade por construção (cada baixa cria a sua transação); na compensação a
-- transação vem de fora, e sem esta trava o mesmo conserto abateria o aluguel de
-- janeiro E o de fevereiro. Parcial em `reversed_at IS NULL`: estornada, a
-- transação volta a ficar livre para ser usada de novo.
CREATE UNIQUE INDEX settlements_transaction_unique
  ON settlements (transaction_id) WHERE reversed_at IS NULL;
