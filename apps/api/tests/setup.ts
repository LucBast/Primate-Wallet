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

process.env['NODE_ENV'] = 'test';
process.env['APP_ENV'] ??= 'development';
process.env['LOG_LEVEL'] = 'silent';
process.env['JWT_ACCESS_SECRET'] ??= 'segredo-de-teste-access-com-mais-de-32-chars';
process.env['JWT_REFRESH_SECRET'] ??= 'segredo-de-teste-refresh-com-mais-de-32-chars';
