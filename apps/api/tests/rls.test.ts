/**
 * Testes de Row Level Security (docs/10 §10).
 *
 * Estes testes falam com o Postgres diretamente, com o MESMO role que o backend
 * usa em runtime (ff_app, NOBYPASSRLS). O objetivo é provar que a proteção está
 * no banco — não apenas na camada de serviço.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import pg from 'pg';
import { closeAdminPool, truncateAll } from './helpers.js';

let appPool: pg.Pool;
let authPool: pg.Pool;
let adminPool: pg.Pool;

beforeAll(() => {
  appPool = new pg.Pool({ connectionString: process.env['DATABASE_URL'], max: 4 });
  authPool = new pg.Pool({
    connectionString: process.env['DATABASE_AUTH_URL'] ?? process.env['DATABASE_URL'],
    max: 2,
  });
  adminPool = new pg.Pool({ connectionString: process.env['DATABASE_MIGRATION_URL'], max: 2 });
});

afterAll(async () => {
  await Promise.all([appPool.end(), authPool.end(), adminPool.end()]);
  await closeAdminPool();
});

beforeEach(async () => {
  await truncateAll();
});

async function createProfile(email: string, name: string): Promise<string> {
  const result = await adminPool.query<{ id: string }>(
    `INSERT INTO profiles (email, password_hash, name, email_verified_at)
     VALUES ($1, 'hash-fake', $2, now()) RETURNING id`,
    [email, name],
  );
  return result.rows[0]!.id;
}

/** Executa uma consulta com a identidade aplicada, como o backend faz. */
async function asUser<T extends pg.QueryResultRow>(
  userId: string,
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const client = await appPool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT set_config($1, $2, true)', ['app.user_id', userId]);
    const result = await client.query<T>(sql, params);
    await client.query('COMMIT');
    return result.rows;
  } catch (error) {
    // Sem o ROLLBACK, a conexão volta ao pool com a transação abortada e o
    // próximo teste falha com "current transaction is aborted".
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

describe('profiles', () => {
  it('cada pessoa enxerga apenas o próprio perfil', async () => {
    const ana = await createProfile('ana@exemplo.com', 'Ana');
    await createProfile('bruno@exemplo.com', 'Bruno');

    const rows = await asUser<{ id: string; name: string }>(ana, 'SELECT id, name FROM profiles');
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe(ana);
  });

  it('acesso direto por ID de outra pessoa não retorna nada', async () => {
    const ana = await createProfile('ana@exemplo.com', 'Ana');
    const bruno = await createProfile('bruno@exemplo.com', 'Bruno');

    const rows = await asUser(ana, 'SELECT id FROM profiles WHERE id = $1', [bruno]);
    expect(rows).toHaveLength(0);
  });

  it('sem identidade na sessão, nada é visível (negar por padrão)', async () => {
    await createProfile('ana@exemplo.com', 'Ana');
    const result = await appPool.query('SELECT id FROM profiles');
    expect(result.rows).toHaveLength(0);
  });

  it('não é possível alterar o perfil de outra pessoa', async () => {
    const ana = await createProfile('ana@exemplo.com', 'Ana');
    const bruno = await createProfile('bruno@exemplo.com', 'Bruno');

    await asUser(ana, 'UPDATE profiles SET name = $1 WHERE id = $2', ['Invadido', bruno]);

    const check = await adminPool.query<{ name: string }>(
      'SELECT name FROM profiles WHERE id = $1',
      [bruno],
    );
    expect(check.rows[0]!.name).toBe('Bruno');
  });

  it('o role da aplicação não tem privilégio sobre o hash de senha', async () => {
    const ana = await createProfile('ana@exemplo.com', 'Ana');
    await expect(asUser(ana, 'SELECT password_hash FROM profiles')).rejects.toThrow(
      /permission denied|permissão negada/i,
    );
  });
});

describe('devices', () => {
  it('cada pessoa enxerga apenas as próprias sessões', async () => {
    const ana = await createProfile('ana@exemplo.com', 'Ana');
    const bruno = await createProfile('bruno@exemplo.com', 'Bruno');
    for (const [userId, installation] of [
      [ana, 'ana-1'],
      [bruno, 'bruno-1'],
    ] as const) {
      await adminPool.query(
        `INSERT INTO devices (user_id, installation_id, platform, name, app_version)
         VALUES ($1, $2, 'ios', 'Aparelho', '0.1.0')`,
        [userId, installation],
      );
    }

    const rows = await asUser<{ installation_id: string }>(
      ana,
      'SELECT installation_id FROM devices',
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.installation_id).toBe('ana-1');
  });

  it('o role da aplicação não enxerga o hash do refresh token', async () => {
    const ana = await createProfile('ana@exemplo.com', 'Ana');
    await expect(asUser(ana, 'SELECT refresh_token_hash FROM devices')).rejects.toThrow(
      /permission denied|permissão negada/i,
    );
  });
});

describe('auth_tokens', () => {
  it('é invisível para o role da aplicação', async () => {
    const ana = await createProfile('ana@exemplo.com', 'Ana');
    await expect(asUser(ana, 'SELECT id FROM auth_tokens')).rejects.toThrow(
      /permission denied|permissão negada/i,
    );
  });

  it('é acessível para o serviço de autenticação', async () => {
    const ana = await createProfile('ana@exemplo.com', 'Ana');
    await authPool.query(
      `INSERT INTO auth_tokens (user_id, purpose, token_hash, expires_at)
       VALUES ($1, 'MAGIC_LINK', 'hash-de-teste', now() + interval '10 minutes')`,
      [ana],
    );
    const result = await authPool.query('SELECT id FROM auth_tokens');
    expect(result.rows).toHaveLength(1);
  });
});

describe('audit_logs', () => {
  it('é append-only: a aplicação insere, mas não lê nem apaga', async () => {
    const ana = await createProfile('ana@exemplo.com', 'Ana');
    await asUser(
      ana,
      `INSERT INTO audit_logs (actor_user_id, entity_type, action) VALUES ($1, 'profile', 'TESTE')`,
      [ana],
    );

    const written = await adminPool.query('SELECT id FROM audit_logs');
    expect(written.rows).toHaveLength(1);

    await expect(asUser(ana, 'SELECT id FROM audit_logs')).rejects.toThrow(
      /permission denied|permissão negada/i,
    );
    await expect(asUser(ana, 'DELETE FROM audit_logs')).rejects.toThrow(
      /permission denied|permissão negada/i,
    );
  });

  it('não permite registrar auditoria em nome de outra pessoa', async () => {
    const ana = await createProfile('ana@exemplo.com', 'Ana');
    const bruno = await createProfile('bruno@exemplo.com', 'Bruno');
    await expect(
      asUser(
        ana,
        `INSERT INTO audit_logs (actor_user_id, entity_type, action) VALUES ($1, 'profile', 'FALSO')`,
        [bruno],
      ),
    ).rejects.toThrow(/row-level security|violates/i);
  });
});
