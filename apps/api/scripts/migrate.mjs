/**
 * Runner de migrações versionadas (docs/15 §4).
 *
 * Usa node-pg-migrate programaticamente para reaproveitar a MESMA validação de
 * ambiente do backend: a migração roda com `DATABASE_MIGRATION_URL` (role
 * ff_migrator), nunca com a conexão da aplicação.
 *
 *   node scripts/migrate.mjs up      — aplica as pendentes
 *   node scripts/migrate.mjs down    — desfaz a última
 *   node scripts/migrate.mjs reset   — desfaz todas (proibido em produção)
 */

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { config as loadDotenv } from 'dotenv';
import { runner } from 'node-pg-migrate';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');

loadDotenv({ path: path.join(repoRoot, '.env'), quiet: true });

const MIGRATIONS_DIR = path.join(repoRoot, 'db', 'migrations');
const command = process.argv[2] ?? 'up';

const databaseUrl = process.env.DATABASE_MIGRATION_URL;
if (!databaseUrl) {
  console.error('DATABASE_MIGRATION_URL não definida. Copie .env.example para .env.');
  process.exit(78);
}

if (command === 'reset' && process.env.APP_ENV === 'production') {
  console.error('reset é proibido em produção. Use roll-forward (docs/15 §4).');
  process.exit(1);
}

const direction = command === 'up' ? 'up' : 'down';
const count = command === 'reset' ? Infinity : command === 'down' ? 1 : Infinity;

try {
  const applied = await runner({
    databaseUrl,
    dir: MIGRATIONS_DIR,
    direction,
    count,
    migrationsTable: 'schema_migrations',
    verbose: true,
    // Uma transação por migração: falha no meio não deixa schema pela metade.
    singleTransaction: true,
    noLock: false,
  });

  if (applied.length === 0) {
    console.log('Nenhuma migração pendente.');
  } else {
    for (const migration of applied) {
      console.log(`${direction}: ${migration.name}`);
    }
  }
  process.exit(0);
} catch (error) {
  console.error(error);
  process.exit(1);
}
