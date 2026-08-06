// Configuração ESLint (flat) do monorepo.
//
// Regra crítica do projeto (CLAUDE.md, "FIDELIDADE VISUAL"): é PROIBIDO usar literais
// de cor fora de `apps/mobile/src/design-system/tokens.ts`. O bloco `noColorLiterals`
// abaixo implementa esse gate.

import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';

/** Seletores esquery que capturam literais de cor em qualquer string do código. */
const colorLiteralSelectors = [
  {
    selector: 'Literal[value=/^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/]',
    message:
      'Cor hexadecimal literal proibida. Use os tokens de src/design-system/tokens.ts (CLAUDE.md §Fidelidade visual).',
  },
  {
    selector: 'Literal[value=/^(?:rgba?|hsla?)\\(/]',
    message:
      'Cor rgb/hsl literal proibida. Use os tokens de src/design-system/tokens.ts (CLAUDE.md §Fidelidade visual).',
  },
  {
    selector:
      // `transparent` fica de fora: é ausência de cor, não uma escolha de
      // paleta, e não existe token equivalente.
      'Literal[value=/^(?:white|black|red|green|blue|gray|grey|silver|orange|yellow|purple|pink|brown|cyan|magenta)$/i]',
    message:
      'Cor nomeada proibida. Use os tokens de src/design-system/tokens.ts (CLAUDE.md §Fidelidade visual).',
  },
  {
    selector: 'TemplateElement[value.raw=/#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})\\b/]',
    message:
      'Cor hexadecimal literal proibida em template string. Use os tokens de src/design-system/tokens.ts.',
  },
];

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      'apps/mobile/android/**',
      'apps/mobile/ios/**',
      'design/**',
      'docs/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  // ---------------------------------------------------------------- TypeScript
  {
    files: ['**/*.{ts,tsx,mts,cts}'],
    languageOptions: {
      parserOptions: { ecmaVersion: 2023, sourceType: 'module' },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-console': ['error', { allow: ['warn', 'error'] }],
      'prefer-const': 'error',
      'no-var': 'error',
      // Invariante financeira: dinheiro em centavos inteiros, nunca ponto flutuante.
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'round',
          message:
            'Arredondamento de dinheiro deve usar os helpers de @ff/domain (centavos inteiros). Math.round em valores monetários é proibido.',
        },
      ],
    },
  },

  // ------------------------------------------------------------- Node (api/db)
  {
    files: ['apps/api/**/*.ts', 'packages/**/*.ts', '**/*.mjs', '**/*.cjs', '**/*.js'],
    languageOptions: { globals: { ...globals.node } },
  },

  // Scripts de linha de comando escrevem no stdout por definição.
  {
    files: ['**/scripts/**/*.{mjs,cjs,js,ts}'],
    rules: { 'no-console': 'off' },
  },

  // Arquivos de configuração de ferramentas (Metro, Jest, Babel) são CommonJS
  // por exigência das próprias ferramentas.
  {
    files: [
      'apps/mobile/*.config.js',
      'apps/mobile/jest.setup.js',
      'apps/mobile/babel.config.js',
      'apps/mobile/react-native.config.js',
    ],
    languageOptions: {
      sourceType: 'commonjs',
      globals: { ...globals.node, ...globals.jest },
    },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },

  // ------------------------------------------------------------ React Native
  {
    files: ['apps/mobile/**/*.{ts,tsx}'],
    plugins: { react, 'react-hooks': reactHooks },
    languageOptions: {
      globals: { ...globals.browser, __DEV__: 'readonly' },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    settings: { react: { version: 'detect' } },
    rules: {
      ...react.configs.flat.recommended.rules,
      ...react.configs.flat['jsx-runtime'].rules,
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'react/prop-types': 'off',
      'no-restricted-syntax': ['error', ...colorLiteralSelectors],
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'react-native-paper',
              message: 'Kits de UI com tema próprio são proibidos (CLAUDE.md §Fidelidade visual).',
            },
            {
              name: 'native-base',
              message: 'Kits de UI com tema próprio são proibidos (CLAUDE.md §Fidelidade visual).',
            },
            {
              name: '@ui-kitten/components',
              message: 'Kits de UI com tema próprio são proibidos (CLAUDE.md §Fidelidade visual).',
            },
            {
              name: '@gluestack-ui/themed',
              message: 'Kits de UI com tema próprio são proibidos (CLAUDE.md §Fidelidade visual).',
            },
          ],
        },
      ],
    },
  },

  // Único arquivo autorizado a conter literais de cor: os tokens de design.
  {
    files: ['apps/mobile/src/design-system/tokens.ts'],
    rules: { 'no-restricted-syntax': 'off' },
  },

  // ------------------------------------------------------------------- Testes
  {
    files: ['**/*.test.ts', '**/*.test.tsx', '**/tests/**/*.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      'no-console': 'off',
    },
  },

  prettier,
);
