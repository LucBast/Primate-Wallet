/**
 * Popula o banco de desenvolvimento com a Família Souza — a família que aparece
 * nos screenshots de `design/screenshots/`.
 *
 * Serve ao gate de fidelidade visual (CLAUDE.md item 3): sem dados, as telas
 * caem no estado vazio e não há o que comparar com o design.
 *
 * Tudo passa pela API real, para que as invariantes financeiras valham também
 * aqui. Só dois atalhos são de desenvolvimento, ambos por SQL direto e ambos
 * impossíveis de executar sem a credencial de migração:
 *   1. confirmar o e-mail dos cadastros (o link vai para o log, não para a caixa);
 *   2. ativar os convidados sem que eles aceitem o convite.
 *
 * Uso: `npm run seed:demo --workspace @ff/api` (exige API no ar e APP_ENV
 * diferente de production).
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { config as loadDotenv } from 'dotenv';
import pg from 'pg';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
loadDotenv({ path: path.join(repoRoot, '.env'), quiet: true });

if (process.env.APP_ENV === 'production') {
  console.error('seed-demo nunca roda em produção.');
  process.exit(1);
}

const BASE = process.env.SEED_API_URL ?? `http://127.0.0.1:${process.env.API_PORT ?? 3400}`;
const SENHA = 'familia-souza-2026';
const admin = new pg.Pool({ connectionString: process.env.DATABASE_MIGRATION_URL, max: 1 });

/** Datas do mês de referência dos screenshots (agosto de 2026). */
const D = (day) => `2026-08-${String(day).padStart(2, '0')}`;

async function api(method, url, { token, body } = {}) {
  const response = await fetch(`${BASE}${url}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${method} ${url} -> ${response.status} ${text}`);
  return text ? JSON.parse(text) : undefined;
}

const device = (nome) => ({
  installationId: `seed-${nome}`,
  platform: 'android',
  name: `Aparelho de ${nome}`,
  appVersion: '0.1.0',
});

async function criarConta(email, nome) {
  await api('POST', '/auth/register', { body: { email, password: SENHA, displayName: nome } });
  // Atalho 1: confirma o e-mail sem o link.
  await admin.query('UPDATE profiles SET email_verified_at = now() WHERE email = $1', [email]);
  const sessao = await api('POST', '/auth/login', {
    body: { email, password: SENHA, device: device(nome) },
  });
  return sessao.accessToken;
}

async function main() {
  console.log('Limpando os dados anteriores…');
  await admin.query('TRUNCATE audit_logs, auth_tokens, devices, profiles, households CASCADE');

  console.log('Criando contas de acesso…');
  const ana = await criarConta('ana@email.com', 'Ana');
  await criarConta('bruno@email.com', 'Bruno');
  await criarConta('caio@email.com', 'Caio');

  console.log('Criando a família…');
  const casa = await api('POST', '/households', {
    token: ana,
    body: { name: 'Família Souza', ownerDisplayName: 'Ana' },
  });
  const hh = casa.id ?? casa.household?.id;
  const rota = (sufixo) => `/households/${hh}${sufixo}`;

  for (const convite of [
    { email: 'bruno@email.com', displayName: 'Bruno', role: 'ADULT', isSupervised: false },
    {
      email: 'caio@email.com',
      displayName: 'Caio',
      role: 'CHILD',
      isSupervised: true,
      // A regra da 3a e da 3c: "aprovação acima de R$ 50,00".
      approvalMode: 'ABOVE_THRESHOLD',
      approvalThresholdMinor: 50_00,
    },
  ]) {
    await api('POST', rota('/invitations'), { token: ana, body: convite });
  }
  // Atalho 2: ativa os convidados sem o aceite, para que apareçam como membros.
  await admin.query(
    `UPDATE household_members m
        SET status = 'ACTIVE', joined_at = now(), user_id = p.id
       FROM profiles p
      WHERE m.household_id = $1 AND m.status = 'INVITED'
        AND p.name = m.display_name`,
    [hh],
  );

  // Os convites do Bruno e do Caio foram consumidos pelo atalho acima; sem
  // apagá-los, a 3a mostrava "Convites pendentes · 2" com gente que já é membro.
  await admin.query(
    `DELETE FROM invitations WHERE household_id = $1 AND accepted_at IS NULL`,
    [hh],
  );
  // O convite pendente que a 3a mostra é o do tio Rafael, ainda sem aceite.
  await api('POST', rota('/invitations'), {
    token: ana,
    body: { email: 'tio.rafael@email.com', displayName: 'Rafael', role: 'ADULT' },
  });

  const membros = await api('GET', rota('/members'), { token: ana });
  const lista = membros.items ?? membros;
  const idDe = (nome) => lista.find((m) => m.displayName === nome).id;
  const [anaId, brunoId, caioId] = [idDe('Ana'), idDe('Bruno'), idDe('Caio')];

  console.log('Criando categorias…');
  const cats = {};
  // A família já nasce com as categorias padrão; só criamos o que falta.
  const existentes = await api('GET', rota('/categories'), { token: ana });
  for (const c of existentes.items ?? existentes) cats[c.name] = c.id;

  for (const [nome, natureza] of [
    ['Moradia', 'EXPENSE'],
    // Contas da casa têm categoria própria: o COMPONENT-SPECS dá um ícone para
    // cada uma (zap, wifi, droplets) e o screenshot 1b mostra ⚡ na linha da
    // energia. Com tudo dentro de "Moradia" apareceria uma casa nas três.
    ['Energia', 'EXPENSE'],
    ['Internet', 'EXPENSE'],
    ['Água', 'EXPENSE'],
    ['Alimentação', 'EXPENSE'],
    ['Transporte', 'EXPENSE'],
    ['Saúde', 'EXPENSE'],
    ['Educação', 'EXPENSE'],
    ['Lazer', 'EXPENSE'],
    ['Salário', 'INCOME'],
    ['Outras receitas', 'INCOME'],
  ]) {
    if (cats[nome] !== undefined) continue;
    const criada = await api('POST', rota('/categories'), {
      token: ana,
      body: { name: nome, nature: natureza },
    });
    cats[nome] = criada.id ?? criada.category?.id;
  }

  console.log('Criando contas e cartão…');
  const conta = async (body) => {
    const criada = await api('POST', rota('/accounts'), { token: ana, body });
    return criada.id ?? criada.account?.id;
  };
  const corrente = await conta({
    name: 'Conta corrente',
    accountType: 'CHECKING',
    institutionName: 'Nubank',
    openingBalanceMinor: 150_000,
    openingBalanceDate: D(1),
    primaryMemberId: anaId,
  });
  const poupanca = await conta({
    name: 'Poupança',
    accountType: 'SAVINGS',
    institutionName: 'Banco do Brasil',
    openingBalanceMinor: 80_000,
    openingBalanceDate: D(1),
    primaryMemberId: brunoId,
  });
  const carteira = await conta({
    name: 'Carteira',
    accountType: 'CASH',
    openingBalanceMinor: 10_100,
    openingBalanceDate: D(1),
    primaryMemberId: anaId,
  });
  // A conta do Caio na 3c: "Mesada digital — Caio", saldo R$ 1.000,00.
  const mesada = await conta({
    name: 'Mesada digital — Caio',
    accountType: 'DIGITAL_WALLET',
    openingBalanceMinor: 100_000,
    openingBalanceDate: D(1),
    primaryMemberId: caioId,
  });
  const cartao = await conta({
    name: 'Cartão Azul',
    accountType: 'CREDIT_CARD',
    institutionName: 'Nubank',
    primaryMemberId: anaId,
    cardBrand: 'Visa',
    cardLastFour: '4412',
    creditLimitMinor: 800_000,
    closingDay: 10,
    dueDay: 15,
    defaultPaymentAccountId: corrente,
  });

  console.log('Criando contas previstas…');
  for (const p of [
    // As duas vencidas do banner "2 contas vencidas · R$ 640,00".
    { d: 'Água', v: 24_000, dia: 3, cat: 'Água', quem: anaId },
    { d: 'Condomínio', v: 40_000, dia: 5, cat: 'Moradia', quem: anaId },
    // O próximo compromisso do dashboard.
    { d: 'Energia elétrica', v: 31_240, dia: 8, cat: 'Energia', quem: anaId },
    { d: 'Plano de saúde', v: 120_000, dia: 20, cat: 'Saúde', quem: brunoId },
    { d: 'Escola do Caio', v: 89_000, dia: 25, cat: 'Educação', quem: caioId },
  ]) {
    await api('POST', rota('/planned-entries'), {
      token: ana,
      body: {
        nature: 'PAYABLE',
        description: p.d,
        originalAmountMinor: p.v,
        competenceDate: D(p.dia),
        dueDate: D(p.dia),
        expectedAccountId: corrente,
        memberId: p.quem,
        categoryId: cats[p.cat],
        idempotencyKey: randomUUID(),
      },
    });
  }
  await api('POST', rota('/planned-entries'), {
    token: ana,
    body: {
      nature: 'RECEIVABLE',
      description: 'Salário — Bruno',
      originalAmountMinor: 420_000,
      competenceDate: D(12),
      dueDate: D(12),
      expectedAccountId: poupanca,
      memberId: brunoId,
      categoryId: cats['Salário'],
      idempotencyKey: randomUUID(),
    },
  });

  console.log('Lançando receitas…');
  for (const r of [
    { d: 'Salário — Ana', v: 540_000, dia: 5, conta: corrente, quem: anaId, cat: 'Salário' },
    {
      d: 'Aluguel recebido',
      v: 230_000,
      dia: 3,
      conta: corrente,
      quem: brunoId,
      cat: 'Outras receitas',
    },
    {
      d: 'Reembolso do convênio',
      v: 120_000,
      dia: 6,
      conta: carteira,
      quem: anaId,
      cat: 'Outras receitas',
    },
  ]) {
    await api('POST', rota('/incomes'), {
      token: ana,
      body: {
        description: r.d,
        amountMinor: r.v,
        accountId: r.conta,
        memberId: r.quem,
        categoryId: cats[r.cat],
        competenceDate: D(r.dia),
        occurredAt: D(r.dia),
        idempotencyKey: randomUUID(),
      },
    });
  }

  console.log('Lançando despesas…');
  for (const e of [
    // No cartão: somam R$ 3.250,00, o "Cartões em aberto" do dashboard.
    { d: 'Mercado', v: 89_010, dia: 2, conta: cartao, quem: anaId, cat: 'Alimentação' },
    { d: 'Combustível', v: 90_000, dia: 5, conta: cartao, quem: anaId, cat: 'Transporte' },
    { d: 'Restaurante', v: 50_000, dia: 6, conta: cartao, quem: brunoId, cat: 'Alimentação' },
    { d: 'Material escolar', v: 34_045, dia: 4, conta: cartao, quem: caioId, cat: 'Educação' },
    { d: 'Lanche da escola', v: 22_955, dia: 6, conta: cartao, quem: caioId, cat: 'Alimentação' },
    { d: 'Internet', v: 38_990, dia: 3, conta: cartao, quem: brunoId, cat: 'Internet' },
    // Nas contas bancárias.
    { d: 'Farmácia', v: 35_000, dia: 4, conta: corrente, quem: anaId, cat: 'Saúde' },
    { d: 'Aluguel', v: 172_045, dia: 5, conta: corrente, quem: brunoId, cat: 'Moradia' },
  ]) {
    await api('POST', rota('/expenses'), {
      token: ana,
      body: {
        description: e.d,
        amountMinor: e.v,
        accountId: e.conta,
        memberId: e.quem,
        categoryId: cats[e.cat],
        competenceDate: D(e.dia),
        occurredAt: D(e.dia),
        idempotencyKey: randomUUID(),
      },
    });
  }

  console.log('Criando o pedido de aprovação pendente…');
  // O Caio só lança na conta dele — é o que a RLS exige de filho supervisionado.
  await api('PUT', rota(`/members/${caioId}/account-permissions`), {
    token: ana,
    body: {
      permissions: [{ accountId: mesada, canView: true, canTransact: true, canEdit: false }],
    },
  });
  // Lançado PELO Caio: é o pedido dele que a 3c mostra para a Ana decidir.
  const caioSessao = await api('POST', '/auth/login', {
    body: { email: 'caio@email.com', password: SENHA, device: device('Caio') },
  });
  await api('POST', rota('/expenses'), {
    token: caioSessao.accessToken,
    body: {
      description: 'Jogo online — presente amigo',
      amountMinor: 89_90,
      accountId: mesada,
      memberId: caioId,
      categoryId: cats['Lazer'],
      source: 'BOTTOM_ACTION',
      idempotencyKey: randomUUID(),
    },
  });

  console.log(`\nPronto. Família ${hh}`);
  console.log(`Entre no app com ana@email.com / ${SENHA}`);
  await admin.end();
}

main().catch(async (erro) => {
  console.error(erro.message);
  await admin.end();
  process.exit(1);
});
