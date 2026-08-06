-- Categorias, subcategorias e favorecidos (docs/08 §categories, §counterparties).
--
-- Categoria tem natureza (despesa/receita) e pode ter uma subcategoria — só um
-- nível, para a lista não virar árvore. Categoria em uso é ARQUIVADA, nunca
-- excluída (docs/04 §17).

-- Up Migration

CREATE TABLE categories (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES households (id) ON DELETE CASCADE,
  parent_id    uuid REFERENCES categories (id) ON DELETE RESTRICT,
  name         text NOT NULL,
  nature       text NOT NULL,
  icon         text,
  color        text,
  sort_order   integer NOT NULL DEFAULT 0,
  is_system    boolean NOT NULL DEFAULT false,
  archived_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT categories_name_not_blank CHECK (length(btrim(name)) > 0),
  CONSTRAINT categories_nature_check CHECK (nature IN ('EXPENSE', 'INCOME')),
  CONSTRAINT categories_parent_is_not_self CHECK (parent_id IS NULL OR parent_id <> id)
);

CREATE INDEX categories_household_id_idx ON categories (household_id);
CREATE INDEX categories_parent_id_idx ON categories (parent_id);
CREATE UNIQUE INDEX categories_household_name_unique
  ON categories (household_id, nature, COALESCE(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name))
  WHERE archived_at IS NULL;

CREATE TRIGGER categories_set_updated_at
  BEFORE UPDATE ON categories
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

/* Só um nível de subcategoria: o pai de uma categoria não pode ter pai. */
CREATE OR REPLACE FUNCTION app.enforce_single_category_level() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
  DECLARE
    v_grandparent uuid;
    v_parent_nature text;
    v_parent_household uuid;
  BEGIN
    IF NEW.parent_id IS NULL THEN RETURN NEW; END IF;

    SELECT parent_id, nature, household_id
      INTO v_grandparent, v_parent_nature, v_parent_household
      FROM categories WHERE id = NEW.parent_id;

    IF v_grandparent IS NOT NULL THEN
      RAISE EXCEPTION 'Categorias aceitam apenas um nível de subcategoria.'
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_parent_nature <> NEW.nature THEN
      RAISE EXCEPTION 'A subcategoria deve ter a mesma natureza da categoria.'
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_parent_household <> NEW.household_id THEN
      RAISE EXCEPTION 'A subcategoria deve pertencer à mesma família.'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END;
  $$;

CREATE TRIGGER categories_single_level
  BEFORE INSERT OR UPDATE ON categories
  FOR EACH ROW EXECUTE FUNCTION app.enforce_single_category_level();

-- Favorecidos / estabelecimentos, usados nas sugestões do lançamento rápido.
CREATE TABLE counterparties (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES households (id) ON DELETE CASCADE,
  name         text NOT NULL,
  type         text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT counterparties_name_not_blank CHECK (length(btrim(name)) > 0)
);

CREATE UNIQUE INDEX counterparties_household_name_unique
  ON counterparties (household_id, lower(name));

CREATE TRIGGER counterparties_set_updated_at
  BEFORE UPDATE ON counterparties
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories FORCE ROW LEVEL SECURITY;

-- Categorias são da família inteira: todo membro vê, quem opera edita.
CREATE POLICY categories_select ON categories
  FOR SELECT TO ff_app USING (app.is_member(household_id));

CREATE POLICY categories_write ON categories
  FOR ALL TO ff_app
  USING (app.can_operate(household_id))
  WITH CHECK (app.can_operate(household_id));

ALTER TABLE counterparties ENABLE ROW LEVEL SECURITY;
ALTER TABLE counterparties FORCE ROW LEVEL SECURITY;

CREATE POLICY counterparties_select ON counterparties
  FOR SELECT TO ff_app USING (app.is_member(household_id));

CREATE POLICY counterparties_write ON counterparties
  FOR ALL TO ff_app
  USING (app.is_member(household_id))
  WITH CHECK (app.is_member(household_id));

SELECT app.grant_if_role_exists('ff_app', 'SELECT, INSERT, UPDATE', 'public.categories');
SELECT app.grant_if_role_exists('ff_app', 'SELECT, INSERT, UPDATE', 'public.counterparties');

-- Down Migration

DROP TABLE IF EXISTS counterparties;
DROP TRIGGER IF EXISTS categories_single_level ON categories;
DROP FUNCTION IF EXISTS app.enforce_single_category_level();
DROP TABLE IF EXISTS categories;
