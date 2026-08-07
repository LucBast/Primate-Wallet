/**
 * Cria e migra o banco exclusivo dos testes de integração.
 *
 * Cada arquivo de teste dá TRUNCATE nas tabelas (tests/helpers.ts). Enquanto os
 * testes apontavam para o banco de desenvolvimento, `npm run verify` apagava o
 * seed da Família Souza e o gate visual ficava sem dados para comparar com os
 * screenshots. Daí um banco separado, com os MESMOS privilégios de
 * infra/postgres-init/01-roles.sql — GRANT de banco e ALTER DEFAULT PRIVILEGES
 * são por banco, então não são herdados do `family_finance`.
 *
 * Uso: `npm run db:test:prepare --workspace @ff/api` (idempotente).
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { config as loadDotenv } from 'dotenv';
import pg from 'pg';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');
loadDotenv({ path: path.join(repoRoot, '.env'), quiet: true });

const testDatabase = process.env.TEST_DATABASE_NAME;
if (!testDatabase) {
  console.error('TEST_DATABASE_NAME não definida. Veja .env.example.');
  process.exit(78);
}

const migrationUrl = process.env.DATABASE_MIGRATION_URL;
if (!migrationUrl) {
  console.error('DATABASE_MIGRATION_URL não definida. Copie .env.example para .env.');
  process.exit(78);
}

/** Troca só o nome do banco na URL, preservando credenciais e parâmetros. */
function withDatabase(url, name) {
  const parsed = new URL(url);
  parsed.pathname = `/${name}`;
  return parsed.toString();
}

const quoted = `"${testDatabase.replaceAll('"', '""')}"`;

const maintenance = new pg.Client({ connectionString: withDatabase(migrationUrl, 'postgres') });
await maintenance.connect();
const existing = await maintenance.query('SELECT 1 FROM pg_database WHERE datname = $1', [
  testDatabase,
]);
if (existing.rowCount === 0) {
  await maintenance.query(`CREATE DATABASE ${quoted}`);
  console.log(`Banco ${testDatabase} criado.`);
} else {
  console.log(`Banco ${testDatabase} já existe.`);
}
await maintenance.end();

const target = new pg.Client({ connectionString: withDatabase(migrationUrl, testDatabase) });
await target.connect();
await target.query(`GRANT CONNECT ON DATABASE ${quoted} TO ff_app, ff_auth`);
await target.query('GRANT USAGE ON SCHEMA public TO ff_app, ff_auth');
await target.query(
  'ALTER DEFAULT PRIVILEGES FOR ROLE ff_migrator IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO ff_app',
);
await target.query(
  'ALTER DEFAULT PRIVILEGES FOR ROLE ff_migrator IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO ff_app, ff_auth',
);
await target.end();

// dotenv não sobrescreve o que já está no ambiente: o migrate.mjs filho recebe
// a URL do banco de teste e ignora a do .env.
const migrate = spawnSync(process.execPath, [path.join(here, 'migrate.mjs'), 'up'], {
  stdio: 'inherit',
  env: { ...process.env, DATABASE_MIGRATION_URL: withDatabase(migrationUrl, testDatabase) },
});
process.exit(migrate.status ?? 1);
