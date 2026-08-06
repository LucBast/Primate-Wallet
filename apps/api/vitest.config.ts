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
  },
});
