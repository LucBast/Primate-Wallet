/**
 * Smoke test pós-release (docs/22 §Lojas, docs/15 §3).
 *
 * Roda contra um ambiente DE VERDADE, já implantado, e responde uma pergunta
 * só: "o que acabou de subir está de pé e sabe fazer dinheiro andar?".
 *
 * Não substitui a suíte de integração. A diferença é o que cada uma prova: a
 * suíte prova que o CÓDIGO está certo; isto prova que a IMPLANTAÇÃO está certa
 * — banco alcançável, migrações aplicadas, variáveis no lugar, TLS válido.
 *
 * Cria uma família descartável e a apaga no fim. Recusa-se a rodar em produção
 * sem `SMOKE_ALLOW_PROD=1`, porque escrever em produção é decisão consciente.
 *
 * Uso:
 *   API_URL=https://api.exemplo.com node apps/api/scripts/smoke.mjs
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { config as loadDotenv } from 'dotenv';
import pg from 'pg';

// Em desenvolvimento o .env da raiz basta; em homologação e produção as
// variáveis vêm do ambiente e o carregamento abaixo simplesmente não acha nada.
loadDotenv({
  path: path.join(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..'), '.env'),
  quiet: true,
});

const BASE = process.env.API_URL ?? 'http://127.0.0.1:3400';
const SENHA = `smoke-${randomUUID()}`;
const EMAIL = `smoke-${Date.now()}@exemplo.invalid`;

const passos = [];
let falhou = false;

function registrar(nome, ok, detalhe = '') {
  passos.push({ nome, ok, detalhe });
  if (!ok) falhou = true;
  console.log(`${ok ? '  ok ' : 'FALHA'}  ${nome}${detalhe ? ` — ${detalhe}` : ''}`);
}

async function api(method, url, { token, body } = {}) {
  const response = await fetch(`${BASE}${url}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const texto = await response.text();
  return { status: response.status, json: texto ? JSON.parse(texto) : undefined, texto };
}

const device = {
  installationId: `smoke-${randomUUID()}`,
  platform: 'android',
  name: 'Smoke test',
  appVersion: '0.1.0',
};

async function main() {
  console.log(`Smoke test contra ${BASE}\n`);

  // 1. Saúde: é o único passo que não escreve nada e o único obrigatório.
  const saude = await api('GET', '/health');
  registrar(
    'saúde da API e do banco',
    saude.status === 200 && saude.json?.checks?.database === 'ok',
    `status=${saude.status} ambiente=${saude.json?.environment ?? '?'}`,
  );
  if (saude.status !== 200) process.exit(1);

  if (saude.json?.environment === 'production' && process.env.SMOKE_ALLOW_PROD !== '1') {
    console.log(
      '\nAmbiente de produção: só a verificação de saúde roda.\n' +
        'Para exercitar os fluxos financeiros aqui, rode com SMOKE_ALLOW_PROD=1 ' +
        'sabendo que isso CRIA e APAGA uma família de teste.',
    );
    process.exit(0);
  }

  // A confirmação de e-mail depende do provedor; sem acesso ao banco, o smoke
  // para aqui e ainda assim vale — saúde é o que quebra numa implantação ruim.
  const migrationUrl = process.env.DATABASE_MIGRATION_URL;
  if (!migrationUrl) {
    console.log(
      '\nSem DATABASE_MIGRATION_URL: os passos financeiros exigem confirmar o\n' +
        'e-mail, e sem o banco não dá para fazer isso sem caixa postal.',
    );
    process.exit(0);
  }
  const admin = new pg.Pool({ connectionString: migrationUrl, max: 1 });

  try {
    // 2. Cadastro e sessão.
    const cadastro = await api('POST', '/auth/register', {
      body: { email: EMAIL, password: SENHA, displayName: 'Smoke' },
    });
    registrar('cadastro aceito', cadastro.status === 202);

    await admin.query('UPDATE profiles SET email_verified_at = now() WHERE email = $1', [EMAIL]);
    const login = await api('POST', '/auth/login', {
      body: { email: EMAIL, password: SENHA, device },
    });
    registrar('login devolve sessão', login.status === 200 && Boolean(login.json?.accessToken));
    const token = login.json?.accessToken;
    if (!token) throw new Error('sem token, nada mais faz sentido');

    // 3. Família, conta e o dinheiro andando.
    const casa = await api('POST', '/households', {
      token,
      body: { name: 'Família Smoke', ownerDisplayName: 'Smoke' },
    });
    registrar('criar família', casa.status === 201);
    const hh = casa.json?.id;

    const membros = await api('GET', `/households/${hh}/members`, { token });
    const membroId = membros.json?.items?.[0]?.id;

    const conta = await api('POST', `/households/${hh}/accounts`, {
      token,
      body: {
        name: 'Conta Smoke',
        accountType: 'CHECKING',
        openingBalanceMinor: 10_000,
        primaryMemberId: membroId,
      },
    });
    registrar('criar conta', conta.status === 201);
    const contaId = conta.json?.id;

    const chave = `smoke-${randomUUID()}`;
    const despesa = await api('POST', `/households/${hh}/expenses`, {
      token,
      body: {
        description: 'Smoke',
        amountMinor: 2_500,
        accountId: contaId,
        memberId: membroId,
        idempotencyKey: chave,
      },
    });
    registrar('lançar despesa', despesa.status === 201);

    const saldo = await api('GET', `/households/${hh}/accounts/${contaId}`, { token });
    registrar(
      'saldo derivado bate',
      saldo.json?.balanceMinor === 7_500,
      `esperado 7500, veio ${saldo.json?.balanceMinor}`,
    );

    // 4. Idempotência: o que protege contra cobrança em dobro.
    const repetida = await api('POST', `/households/${hh}/expenses`, {
      token,
      body: {
        description: 'Smoke',
        amountMinor: 2_500,
        accountId: contaId,
        memberId: membroId,
        idempotencyKey: chave,
      },
    });
    const saldoDepois = await api('GET', `/households/${hh}/accounts/${contaId}`, { token });
    registrar(
      'reenvio com a mesma chave não duplica',
      repetida.json?.id === despesa.json?.id && saldoDepois.json?.balanceMinor === 7_500,
    );

    // 5. Isolamento: a RLS é o que separa uma família da outra.
    const intruso = await api('GET', `/households/${randomUUID()}/accounts`, { token });
    registrar('família alheia é negada', intruso.status === 404 || intruso.status === 403);
  } finally {
    // Limpeza: a família de teste não fica no ambiente. A família sai primeiro
    // porque `households.created_by` é RESTRICT — de propósito: ninguém apaga
    // um perfil e deixa uma família órfã por acidente.
    await admin
      .query(
        `DELETE FROM households WHERE created_by IN (SELECT id FROM profiles WHERE email = $1)`,
        [EMAIL],
      )
      .then(() => admin.query('DELETE FROM profiles WHERE email = $1', [EMAIL]))
      .catch((erro) => console.warn('limpeza falhou:', erro.message));
    await admin.end();
  }

  console.log(
    `\n${passos.filter((p) => p.ok).length}/${passos.length} passos ok.` +
      (falhou ? ' NÃO PROMOVER esta versão.' : ''),
  );
  process.exit(falhou ? 1 : 0);
}

main().catch((erro) => {
  console.error('\nSmoke test quebrou:', erro.message);
  process.exit(1);
});
