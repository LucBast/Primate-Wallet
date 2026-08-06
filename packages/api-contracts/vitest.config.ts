import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@ff/domain': fileURLToPath(new URL('../domain/src/index.ts', import.meta.url)),
      '@ff/validation': fileURLToPath(new URL('../validation/src/index.ts', import.meta.url)),
    },
  },
  test: { include: ['src/**/*.test.ts'] },
});
