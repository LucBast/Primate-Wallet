/**
 * Política de TLS do banco, em um lugar só.
 *
 * Os scripts operacionais (migração, sonda, smoke) conectam ao mesmo Postgres
 * que o runtime, e precisam da MESMA política — senão a credencial mais
 * privilegiada do sistema, a de migração, é a única que viaja em texto claro.
 *
 * Espelha `apps/api/src/db/pool.ts`. Duas regras:
 *  - `rejectUnauthorized: true` sempre que SSL estiver ligado. Sem verificar o
 *    certificado a conexão continua cifrada, mas fica aberta a quem se ponha no
 *    meio;
 *  - quando o provedor usa CA própria (o pooler do Supabase usa a "Supabase
 *    Root 2021 CA", auto-assinada), a saída é ENSINAR a raiz por
 *    `DATABASE_SSL_CA` — nunca baixar a verificação.
 */

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {{ rejectUnauthorized: true, ca?: string } | undefined}
 *   `undefined` quando SSL está desligado — é o caso do Postgres local.
 */
export function sslFromEnv(env = process.env) {
  const ligado = env.DATABASE_SSL === 'true' || env.DATABASE_SSL === '1';
  if (!ligado) return undefined;

  const base64 = env.DATABASE_SSL_CA?.trim() ?? '';
  if (base64 === '') return { rejectUnauthorized: true };

  return {
    rejectUnauthorized: true,
    ca: Buffer.from(base64, 'base64').toString('utf8'),
  };
}
