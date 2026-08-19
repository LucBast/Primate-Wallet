/**
 * Sonda de conexão com o banco, para rodar ANTES de migrar ou de fazer deploy.
 *
 * Existe porque as três falhas mais comuns contra o Supabase produzem mensagens
 * quase idênticas, e o `/health` do backend as achata todas em `"error"`:
 *
 *  1. host do pooler errado — `aws-0-` e `aws-1-` existem os dois na mesma
 *     região, e o errado responde com erro de autenticação, que parece senha;
 *  2. roles ff_* ainda não provisionados (o SQL de infra/supabase não rodou);
 *  3. certificado — o runtime conecta com `rejectUnauthorized: true`
 *     (apps/api/src/db/pool.ts, quando DATABASE_SSL=true). Se a conexão só
 *     passa no modo frouxo, o problema é a cadeia de CA, não a credencial.
 *
 * Uso:
 *   node --env-file=.env.production.local apps/api/scripts/check-db.mjs
 */

import pg from 'pg';
import { sslFromEnv } from './ssl.mjs';

const alvos = [
  ['ff_migrator', process.env.DATABASE_MIGRATION_URL],
  ['ff_app', process.env.DATABASE_URL],
  ['ff_auth', process.env.DATABASE_AUTH_URL],
];

// Modo estrito = a política real do runtime. Sem a CA própria, contra o
// Supabase ele falha em SELF_SIGNED_CERT_IN_CHAIN antes de chegar à autenticação
// — e é exatamente essa diferença que a sonda existe para mostrar.
const sslEstrito = sslFromEnv() ?? { rejectUnauthorized: true };
console.log(
  sslEstrito.ca ? 'CA própria carregada de DATABASE_SSL_CA' : 'Sem CA própria: CAs públicas',
);

let houveFalha = false;

for (const [nome, url] of alvos) {
  if (!url) {
    console.log(`${nome}: URL ausente no ambiente`);
    houveFalha = true;
    continue;
  }

  for (const [modo, ssl] of [
    ['estrito', sslEstrito],
    ['frouxo', { rejectUnauthorized: false }],
  ]) {
    const client = new pg.Client({
      connectionString: url,
      ssl,
      connectionTimeoutMillis: 15_000,
    });
    try {
      await client.connect();
      const { rows } = await client.query(
        `SELECT current_user AS usuario,
                current_setting('server_version') AS versao,
                (SELECT count(*) FROM pg_roles WHERE rolname LIKE 'ff\\_%') AS roles_ff,
                (SELECT count(*) FROM pg_tables WHERE schemaname = 'public') AS tabelas`,
      );
      const r = rows[0];
      const aviso = modo === 'frouxo' ? '  <-- só com verificação de certificado DESLIGADA' : '';
      console.log(
        `${nome} [${modo}]: ok — usuário=${r.usuario} pg=${r.versao} ` +
          `roles ff_*=${r.roles_ff} tabelas públicas=${r.tabelas}${aviso}`,
      );
      if (modo === 'frouxo') houveFalha = true;
      await client.end();
      break;
    } catch (erro) {
      console.log(`${nome} [${modo}]: FALHOU — ${erro.code ?? ''} ${erro.message}`);
      await client.end().catch(() => undefined);
      if (modo === 'frouxo') houveFalha = true;
    }
  }
}

process.exit(houveFalha ? 1 : 0);
