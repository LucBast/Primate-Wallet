/**
 * Invariantes do schema que a suíte de comportamento NÃO consegue provar.
 *
 * O Postgres local roda com `ff_migrator` como POSTGRES_USER do contêiner —
 * isto é, superusuário com BYPASSRLS. As funções `SECURITY DEFINER` ali ignoram
 * RLS e passam em qualquer configuração. No Supabase, `ff_migrator` é papel
 * comum, e a mesma migração se comporta ao contrário. Foi assim que
 * `FORCE ROW LEVEL SECURITY` derrubou a criação de contas em produção com a
 * suíte inteira verde (migração 0021).
 *
 * Enquanto essa divergência de ambiente existir, o único jeito de defender esta
 * classe de defeito é olhar o CATÁLOGO, não o comportamento.
 */

import { afterAll, describe, expect, it } from 'vitest';
import { adminQuery, closeAdminPool } from './helpers.js';

afterAll(async () => {
  await closeAdminPool();
});

describe('invariantes de RLS', () => {
  it('nenhuma tabela usa FORCE ROW LEVEL SECURITY', async () => {
    // As políticas chamam funções `SECURITY DEFINER` que leem a própria tabela
    // protegida. FORCE sujeita a dona às políticas, e não há política para ela:
    // a leitura interna volta vazia e a função nega acesso a todo mundo.
    const linhas = await adminQuery<{ relname: string }>(
      `SELECT c.relname
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relforcerowsecurity
        ORDER BY 1`,
    );

    expect(linhas.map((l) => l.relname)).toEqual([]);
  });

  it('toda tabela com política continua com RLS habilitado', async () => {
    // O contrário do teste acima: tirar FORCE é intencional, tirar ENABLE seria
    // abrir a família inteira para qualquer sessão.
    const semRls = await adminQuery<{ relname: string }>(
      `SELECT DISTINCT c.relname
         FROM pg_policy p
         JOIN pg_class c ON c.oid = p.polrelid
        WHERE NOT c.relrowsecurity
        ORDER BY 1`,
    );

    expect(semRls.map((l) => l.relname)).toEqual([]);
  });
});
