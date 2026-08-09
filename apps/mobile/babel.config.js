module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: [
    // Os modelos do WatermelonDB são declarados com decorators (@field, @date…).
    // 'legacy' é o modo que a biblioteca espera; o padrão atual da proposta
    // (2023-11) muda a semântica e quebra os decorators dela.
    ['@babel/plugin-proposal-decorators', { legacy: true }],
    // O preset do React Native 0.86 deixou de incluir este transform, mas o zod 4
    // usa `export * as core from './core/index.js'` nos seus próprios arquivos.
    // Sem ele o Metro falha o bundle inteiro com SyntaxError em node_modules/zod.
    // Ver docs/21-DECISIONS.md D-041.
    '@babel/plugin-transform-export-namespace-from',
  ],
};
