import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@ff/domain': fileURLToPath(new URL('../../packages/domain/src/index.ts', import.meta.url)),
      '@ff/validation': fileURLToPath(
        new URL('../../packages/validation/src/index.ts', import.meta.url),
      ),
      '@ff/api-contracts': fileURLToPath(
        new URL('../../packages/api-contracts/src/index.ts', import.meta.url),
      ),
      '@ff/test-fixtures': fileURLToPath(
        new URL('../../packages/test-fixtures/src/index.ts', import.meta.url),
      ),
    },
  },
  test: {
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    // Testes de integração compartilham um Postgres: sem paralelismo entre arquivos.
    fileParallelism: false,
    hookTimeout: 30_000,
    testTimeout: 30_000,
    setupFiles: ['tests/setup.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // Rotas são casca fina sobre os serviços e já são exercidas ponta a ponta
      // pelos testes de integração; medi-las de novo só inflaria o número.
      exclude: ['src/main.ts', 'src/**/*.test.ts'],
      reporter: ['text-summary', 'json-summary'],
      /**
       * Piso, não meta. Serve para uma queda de cobertura aparecer no CI como
       * falha, e não como um número que ninguém olha. Fica logo abaixo do
       * medido em 2026-08-09 (linhas 92,2% · funções 92,8% · ramos 72,6% ·
       * instruções 88,2%), com folga só para não quebrar por ruído. Subir
       * quando a cobertura real subir; nunca baixar para fazer a barra passar.
       *
       * Ramos tem o piso mais baixo de propósito: boa parte deles são guardas
       * de erro de driver e caminhos de `?? null` que só disparam com o banco
       * em estado que o teste não consegue provocar sem trapaça.
       */
      thresholds: { lines: 90, functions: 90, branches: 70, statements: 85 },
    },
  },
});
