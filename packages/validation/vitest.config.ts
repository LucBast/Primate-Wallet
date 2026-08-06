import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Aponta os pacotes do workspace para o fonte, para que os testes rodem sem
  // depender de um `build` prévio. Em runtime (backend/app) vale o `dist`.
  resolve: {
    alias: {
      '@ff/domain': fileURLToPath(new URL('../domain/src/index.ts', import.meta.url)),
    },
  },
  test: { include: ['src/**/*.test.ts'] },
});
