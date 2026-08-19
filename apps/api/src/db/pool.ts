/**
 * Acesso ao Postgres.
 *
 * Duas conexões, por privilégio (docs/10 §1, §3):
 *  - `app`  → role ff_app, sujeito a RLS. TODA consulta roda dentro de uma
 *             transação com `SET LOCAL app.user_id`, o que ativa as policies.
 *  - `auth` → role ff_auth, usado só pelo serviço de autenticação, nas
 *             operações que acontecem antes de existir sessão.
 *
 * `withUserTransaction` é o único caminho previsto para consultas da aplicação:
 * não existe "consultar sem identidade".
 */

import pg from 'pg';
import type { AppConfig } from '../config/env.js';

const { Pool } = pg;
export type { PoolClient, QueryResult, QueryResultRow } from 'pg';

// `bigint` (int8) chega como string por padrão no driver. Valores monetários são
// bigint no banco; converter para Number aqui é seguro porque a faixa útil está
// muito abaixo de 2^53, e mantém a invariante "centavos inteiros" no código.
pg.types.setTypeParser(pg.types.builtins.INT8, (value) => Number.parseInt(value, 10));
// numeric não é usado para dinheiro; se aparecer, mantém-se string (sem perda).

export type Database = {
  readonly app: pg.Pool;
  readonly auth: pg.Pool;
  close: () => Promise<void>;
};

export function createDatabase(config: AppConfig): Database {
  // `rejectUnauthorized: true` NÃO é redundante: sem verificar o certificado, a
  // conexão continua cifrada mas fica aberta a quem se colocar no meio — e o que
  // trafega aqui é a credencial do banco. Quando o provedor usa CA própria (o
  // pooler do Supabase usa a "Supabase Root 2021 CA", auto-assinada), o caminho
  // certo é ENSINAR a raiz, via DATABASE_SSL_CA, e não baixar a verificação.
  const sslConfig = config.database.ssl
    ? config.database.sslCa === ''
      ? { rejectUnauthorized: true }
      : { rejectUnauthorized: true, ca: config.database.sslCa }
    : undefined;

  const common = {
    max: config.database.poolMax,
    ssl: sslConfig,
    application_name: 'primatewallet-api',
    // Consulta travada não pode segurar uma conexão indefinidamente.
    statement_timeout: 15_000,
    idle_in_transaction_session_timeout: 10_000,
  };

  const app = new Pool({ ...common, connectionString: config.database.url });
  const auth = new Pool({
    ...common,
    connectionString: config.database.authUrl,
    max: Math.max(2, Math.floor(config.database.poolMax / 2)),
    application_name: 'primatewallet-api-auth',
  });

  return {
    app,
    auth,
    close: async () => {
      await Promise.all([app.end(), auth.end()]);
    },
  };
}

export type TransactionOptions = {
  /** `SERIALIZABLE` nas operações financeiras críticas (docs/04 §15). */
  readonly isolation?: 'READ COMMITTED' | 'REPEATABLE READ' | 'SERIALIZABLE';
  readonly readOnly?: boolean;
};

/**
 * Abre uma transação já com a identidade do usuário aplicada. As policies de
 * RLS passam a valer a partir do `SET LOCAL` — que é revertido no fim da
 * transação, então uma conexão devolvida ao pool nunca "carrega" identidade.
 */
export async function withUserTransaction<T>(
  db: Database,
  userId: string,
  handler: (client: pg.PoolClient) => Promise<T>,
  options: TransactionOptions = {},
): Promise<T> {
  const client = await db.app.connect();
  try {
    const isolation = options.isolation ?? 'READ COMMITTED';
    await client.query(
      `BEGIN ISOLATION LEVEL ${isolation}${options.readOnly === true ? ' READ ONLY' : ''}`,
    );
    // Parametrizado: `set_config` evita qualquer chance de injeção no GUC.
    await client.query('SELECT set_config($1, $2, true)', ['app.user_id', userId]);
    const result = await handler(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/** Transação anônima (sem identidade) para o serviço de autenticação. */
export async function withAuthTransaction<T>(
  db: Database,
  handler: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await db.auth.connect();
  try {
    await client.query('BEGIN');
    const result = await handler(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function checkDatabaseHealth(db: Database): Promise<boolean> {
  try {
    await db.app.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}
