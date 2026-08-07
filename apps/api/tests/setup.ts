/**
 * Setup dos testes de integração.
 *
 * Exige um Postgres real com as migrações aplicadas (`npm run db:up && npm run
 * db:migrate`). Testar RLS contra um banco de mentira não provaria nada — as
 * policies são o objeto do teste.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadDotenv } from 'dotenv';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
loadDotenv({ path: path.join(repoRoot, '.env'), quiet: true });

// Banco exclusivo dos testes. Sem isto, o TRUNCATE de cada arquivo apagava o
// seed dos screenshots no banco de desenvolvimento (`npm run db:test:prepare`
// cria e migra). Na CI a variável fica vazia: lá o Postgres já é descartável.
const testDatabase = process.env['TEST_DATABASE_NAME'];
if (testDatabase !== undefined && testDatabase !== '') {
  for (const key of ['DATABASE_URL', 'DATABASE_AUTH_URL', 'DATABASE_MIGRATION_URL'] as const) {
    const url = process.env[key];
    if (url === undefined || url === '') continue;
    const parsed = new URL(url);
    parsed.pathname = `/${testDatabase}`;
    process.env[key] = parsed.toString();
  }
}

process.env['NODE_ENV'] = 'test';
process.env['APP_ENV'] ??= 'development';
process.env['LOG_LEVEL'] = 'silent';
process.env['JWT_ACCESS_SECRET'] ??= 'segredo-de-teste-access-com-mais-de-32-chars';
process.env['JWT_REFRESH_SECRET'] ??= 'segredo-de-teste-refresh-com-mais-de-32-chars';
