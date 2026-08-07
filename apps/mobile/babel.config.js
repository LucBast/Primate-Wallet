module.exports = {
  presets: ['module:@react-native/babel-preset'],
  // O preset do React Native 0.86 deixou de incluir este transform, mas o zod 4
  // usa `export * as core from './core/index.js'` nos seus próprios arquivos.
  // Sem ele o Metro falha o bundle inteiro com SyntaxError em node_modules/zod.
  // Ver docs/21-DECISIONS.md D-041.
  plugins: ['@babel/plugin-transform-export-namespace-from'],
};
