const path = require('node:path');

/**
 * Jest do app.
 *
 * Os pacotes do workspace são resolvidos no `dist` compilado — o mesmo caminho
 * que o Metro usa em runtime, então teste e bundle enxergam exatamente o mesmo
 * código. O script `test` roda `tsc -b` antes, garantindo que o dist existe.
 */
module.exports = {
  preset: '@react-native/jest-preset',
  setupFilesAfterEnv: [path.join(__dirname, 'jest.setup.js')],
  moduleNameMapper: {
    '^@ff/domain$': path.resolve(__dirname, '../../packages/domain/dist/index.js'),
    '^@ff/validation$': path.resolve(__dirname, '../../packages/validation/dist/index.js'),
    '^@ff/api-contracts$': path.resolve(__dirname, '../../packages/api-contracts/dist/index.js'),
  },
  // Pacotes publicados em ESM precisam passar pelo Babel. O separador aceita
  // `/` e `\` porque no Windows o caminho absoluto usa barra invertida.
  transformIgnorePatterns: [
    '[/\\\\]node_modules[/\\\\](?!(@react-native|react-native|@react-navigation|lucide-react-native|zustand|@tanstack)[/\\\\])',
  ],
  testMatch: ['**/__tests__/**/*.test.tsx', '**/__tests__/**/*.test.ts'],
};
