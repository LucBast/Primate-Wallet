/**
 * Utilidades compartilhadas pelos testes de integração: sobe o servidor em
 * memória (`inject`), limpa as tabelas entre testes e expõe a caixa de e-mails.
 */

import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { pino } from 'pino';
import { loadConfig, type AppConfig } from '../src/config/env.js';
import { createDatabase, type Database } from '../src/db/pool.js';
import { buildServer } from '../src/http/server.js';
import { createMemoryMailer, type Mailer } from '../src/modules/auth/mailer.js';

export type TestContext = {
  readonly app: FastifyInstance;
  readonly db: Database;
  readonly config: AppConfig;
  readonly mailer: Mailer;
  close: () => Promise<void>;
};

export async function createTestContext(
  options: { enableRateLimit?: boolean } = {},
): Promise<TestContext> {
  const config = loadConfig();
  const db = createDatabase(config);
  const mailer = createMemoryMailer();
  const { app } = await buildServer({
    config,
    db,
    logger: pino({ level: process.env['TEST_LOG'] === '1' ? 'error' : 'silent' }),
    mailer,
    ...(options.enableRateLimit === undefined ? {} : { enableRateLimit: options.enableRateLimit }),
  });
  await app.ready();

  return {
    app,
    db,
    config,
    mailer,
    close: async () => {
      await app.close();
      await db.close();
    },
  };
}

/**
 * Limpa os dados entre testes. Usa a conexão de MIGRAÇÃO (dona das tabelas):
 * TRUNCATE exige propriedade, e nem ff_app nem ff_auth têm — corretamente.
 */
let adminPool: pg.Pool | undefined;

export async function truncateAll(): Promise<void> {
  adminPool ??= new pg.Pool({
    connectionString: process.env['DATABASE_MIGRATION_URL'],
    max: 1,
  });
  // `profiles` e `households` puxam o resto por CASCADE; listamos as raízes.
  await adminPool.query('TRUNCATE audit_logs, auth_tokens, devices, profiles, households CASCADE');
}

/** Executa SQL com a conexão de migração (para arranjo e verificação). */
export async function adminQuery<T extends pg.QueryResultRow = pg.QueryResultRow>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  adminPool ??= new pg.Pool({
    connectionString: process.env['DATABASE_MIGRATION_URL'],
    max: 1,
  });
  const result = await adminPool.query<T>(sql, params);
  return result.rows;
}

export async function closeAdminPool(): Promise<void> {
  await adminPool?.end();
  adminPool = undefined;
}

/** Último link enviado por e-mail — usado para completar fluxos de token. */
export function lastEmailLink(mailer: Mailer): string {
  const outbox = mailer.outbox ?? [];
  const last = outbox[outbox.length - 1];
  if (!last?.link) throw new Error('Nenhum e-mail com link foi enviado.');
  const token = new URL(
    last.link.replace('familyfinance://', 'https://app.local/'),
  ).searchParams.get('token');
  if (!token) throw new Error(`Link sem token: ${last.link}`);
  return token;
}

export const TEST_DEVICE = {
  installationId: 'installation-de-teste-1',
  platform: 'ios' as const,
  name: 'iPhone de Teste',
  appVersion: '0.1.0',
};

export type TestUser = {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly profileId: string;
  readonly email: string;
};

/**
 * Cadastra, confirma o e-mail e devolve a sessão pronta. Cada usuário recebe um
 * `installationId` próprio, senão o upsert de sessão colidiria entre eles.
 */
export async function registerUser(
  ctx: TestContext,
  email: string,
  displayName = email.split('@')[0] ?? 'Pessoa',
): Promise<TestUser> {
  const registered = await ctx.app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: { email, password: 'senha-de-teste-longa', displayName },
  });
  if (registered.statusCode !== 202) {
    throw new Error(`Cadastro falhou: ${registered.statusCode} ${registered.body}`);
  }

  const token = lastEmailLink(ctx.mailer);
  const verified = await ctx.app.inject({
    method: 'POST',
    url: '/auth/verify-email',
    payload: {
      token,
      device: { ...TEST_DEVICE, installationId: `installation-${email}` },
    },
  });
  if (verified.statusCode !== 200) {
    throw new Error(`Confirmação falhou: ${verified.statusCode} ${verified.body}`);
  }

  const session = verified.json();
  return {
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
    profileId: session.profile.id,
    email,
  };
}
