/**
 * @ff/domain — regras financeiras puras, sem dependência de banco, HTTP ou UI.
 *
 * Backend e app consomem exatamente as mesmas funções, para que a UI nunca
 * reimplemente uma regra (docs/19 §Regras obrigatórias, item 13).
 */

export * from './brand.js';
export * from './money.js';
export * from './dates.js';
export * from './errors.js';
export * from './planned-entry.js';
