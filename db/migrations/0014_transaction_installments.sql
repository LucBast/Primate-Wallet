-- Parcela da compra no cartão dentro da própria movimentação (tela 1f).
--
-- A compra parcelada já criava um `installment_groups` e uma transação por
-- parcela, mas nada ligava as duas coisas: a única marca da parcela era o
-- sufixo " · parcela 03/10" grudado na descrição. O screenshot 1f-fatura.png
-- mostra o contrário — o título é "Curso de inglês — Caio" e a parcela é um
-- selo ao lado. Sem estas colunas o app teria de fatiar texto para desenhar a
-- tela, e "parcela" viraria parte do nome da compra em todo relatório.

-- Up Migration

ALTER TABLE transactions
  ADD COLUMN installment_group_id uuid REFERENCES installment_groups (id) ON DELETE SET NULL,
  ADD COLUMN installment_number   integer,
  ADD COLUMN installment_total    integer;

ALTER TABLE transactions
  ADD CONSTRAINT transactions_installment_pair CHECK (
    (installment_number IS NULL) = (installment_total IS NULL)
  ),
  ADD CONSTRAINT transactions_installment_range CHECK (
    installment_number IS NULL
    OR (installment_number >= 1 AND installment_number <= installment_total)
  );

CREATE INDEX transactions_installment_group_idx
  ON transactions (installment_group_id)
  WHERE installment_group_id IS NOT NULL;

-- Recupera as parcelas já gravadas: o sufixo da descrição é a única fonte que
-- existe hoje, e depois desta migração ele deixa de ser escrito.
UPDATE transactions
   SET installment_number = NULLIF(substring(description from ' · parcela (\d+)/\d+$'), '')::integer,
       installment_total  = NULLIF(substring(description from ' · parcela \d+/(\d+)$'), '')::integer,
       description        = regexp_replace(description, ' · parcela \d+/\d+$', '')
 WHERE description ~ ' · parcela \d+/\d+$';

-- Down Migration

DROP INDEX IF EXISTS transactions_installment_group_idx;
ALTER TABLE transactions
  DROP CONSTRAINT IF EXISTS transactions_installment_range,
  DROP CONSTRAINT IF EXISTS transactions_installment_pair;
ALTER TABLE transactions
  DROP COLUMN IF EXISTS installment_total,
  DROP COLUMN IF EXISTS installment_number,
  DROP COLUMN IF EXISTS installment_group_id;
