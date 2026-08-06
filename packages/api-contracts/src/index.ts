/**
 * @ff/api-contracts — contratos Zod compartilhados entre backend e app.
 *
 * O app importa daqui para validar respostas; o backend importa daqui para
 * validar requisições. Assim não existe "contrato paralelo" em nenhum lado.
 */

export * from './error.js';
export * from './auth.js';
export * from './health.js';
export * from './household.js';
