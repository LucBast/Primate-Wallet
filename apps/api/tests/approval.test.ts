/**
 * Fase 9 — supervisão familiar (docs/04 §16; docs/13 §5 caso 14).
 *
 * O que precisa ficar provado aqui, e não só na tela:
 *  - o lançamento do filho supervisionado nasce pendente e NÃO mexe no saldo;
 *  - o limite é inclusivo — gastar exatamente o limite passa direto;
 *  - só quem opera decide, e ninguém decide o próprio pedido;
 *  - aprovar posta a movimentação e aí sim o saldo muda;
 *  - recusar preserva o conteúdo original em vez de apagá-lo;
 *  - o conteúdo é imutável enquanto pendente, inclusive por SQL direto;
 *  - compra pendente em cartão não consome fatura nem limite antes da decisão.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  adminQuery,
  closeAdminPool,
  createTestContext,
  lastEmailLink,
  registerUser,
  truncateAll,
  type TestContext,
  type TestUser,
} from './helpers.js';

let ctx: TestContext;

beforeAll(async () => {
  ctx = await createTestContext();
});

afterAll(async () => {
  await ctx.close();
  await closeAdminPool();
});

beforeEach(async () => {
  await truncateAll();
  ctx.mailer.outbox?.splice(0, ctx.mailer.outbox.length);
});

let keyCounter = 0;
const key = (prefix: string): string =>
  `${prefix}-aprovacao-${(keyCounter += 1).toString().padStart(8, '0')}`;

const auth = (user: TestUser) => ({ authorization: `Bearer ${user.accessToken}` });

type Family = {
  ana: TestUser;
  bruno: TestUser;
  caio: TestUser;
  householdId: string;
  checkingId: string;
  cardId: string;
  categoryId: string;
  caioMemberId: string;
};

/**
 * Família com proprietária (Ana), adulto (Bruno) e filho supervisionado (Caio),
 * este último com aprovação acima de R$ 50,00 — o mesmo valor da copy da 8b.
 */
async function family(
  approval: Record<string, unknown> = {
    approvalMode: 'ABOVE_THRESHOLD',
    approvalThresholdMinor: 50_00,
  },
): Promise<Family> {
  const ana = await registerUser(ctx, 'ana@exemplo.com', 'Ana');
  const headers = auth(ana);

  const household = (
    await ctx.app.inject({
      method: 'POST',
      url: '/households',
      headers,
      payload: { name: 'Família Souza', ownerDisplayName: 'Ana' },
    })
  ).json();

  const invite = async (payload: Record<string, unknown>): Promise<string> => {
    const response = await ctx.app.inject({
      method: 'POST',
      url: `/households/${household.id}/invitations`,
      headers,
      payload,
    });
    expect(response.statusCode).toBe(201);
    return lastEmailLink(ctx.mailer);
  };

  const brunoToken = await invite({
    email: 'bruno@exemplo.com',
    displayName: 'Bruno',
    role: 'ADULT',
  });
  const bruno = await registerUser(ctx, 'bruno@exemplo.com', 'Bruno');
  await ctx.app.inject({
    method: 'POST',
    url: '/invitations/accept',
    headers: auth(bruno),
    payload: { token: brunoToken },
  });

  const caioToken = await invite({
    email: 'caio@exemplo.com',
    displayName: 'Caio',
    role: 'CHILD',
    isSupervised: true,
    ...approval,
  });
  const caio = await registerUser(ctx, 'caio@exemplo.com', 'Caio');
  await ctx.app.inject({
    method: 'POST',
    url: '/invitations/accept',
    headers: auth(caio),
    payload: { token: caioToken },
  });

  const account = async (payload: Record<string, unknown>) =>
    (
      await ctx.app.inject({
        method: 'POST',
        url: `/households/${household.id}/accounts`,
        headers,
        payload,
      })
    ).json();

  const checking = await account({
    name: 'Conta Corrente',
    accountType: 'CHECKING',
    openingBalanceMinor: 500_00,
  });
  const card = await account({
    name: 'Cartão Azul',
    accountType: 'CREDIT_CARD',
    creditLimitMinor: 2_000_00,
    cardBrand: 'Visa',
    cardLastFour: '4412',
    closingDay: 10,
    dueDay: 15,
  });

  const category = (
    await ctx.app.inject({
      method: 'POST',
      url: `/households/${household.id}/categories`,
      headers,
      payload: { name: 'Lazer', kind: 'EXPENSE' },
    })
  ).json();

  const members = (
    await ctx.app.inject({ method: 'GET', url: `/households/${household.id}/members`, headers })
  ).json().items as Array<{ id: string; displayName: string }>;
  const caioMember = members.find((member) => member.displayName === 'Caio');
  if (!caioMember) throw new Error('Caio não entrou na família.');

  // Filho supervisionado só lança em conta autorizada (docs/10 §5). Sem isto a
  // RLS recusa a inserção antes mesmo de a regra de aprovação ser avaliada.
  const perm = await ctx.app.inject({
    method: 'PUT',
    url: `/households/${household.id}/members/${caioMember.id}/account-permissions`,
    headers,
    payload: {
      permissions: [
        { accountId: checking.id, canView: true, canTransact: true, canEdit: false },
        { accountId: card.id, canView: true, canTransact: true, canEdit: false },
      ],
    },
  });
  expect(perm.statusCode, perm.body).toBe(200);

  return {
    ana,
    bruno,
    caio,
    householdId: household.id,
    checkingId: checking.id,
    cardId: card.id,
    categoryId: category.id,
    caioMemberId: caioMember.id,
  };
}

/** Lançamento do Caio em nome dele mesmo. */
async function caioSpends(
  base: Family,
  amountMinor: number,
  overrides: Record<string, unknown> = {},
) {
  return ctx.app.inject({
    method: 'POST',
    url: `/households/${base.householdId}/expenses`,
    headers: auth(base.caio),
    payload: {
      description: 'Lanche com os amigos',
      amountMinor,
      accountId: base.checkingId,
      memberId: base.caioMemberId,
      categoryId: base.categoryId,
      idempotencyKey: key('gasto'),
      ...overrides,
    },
  });
}

async function balance(base: Family, user: TestUser, accountId: string): Promise<number> {
  const response = await ctx.app.inject({
    method: 'GET',
    url: `/households/${base.householdId}/accounts/${accountId}`,
    headers: auth(user),
  });
  return response.json().balanceMinor as number;
}

async function pendingList(base: Family, user: TestUser) {
  const response = await ctx.app.inject({
    method: 'GET',
    url: `/households/${base.householdId}/approvals?status=PENDING`,
    headers: auth(user),
  });
  expect(response.statusCode).toBe(200);
  return response.json();
}

describe('regra de aprovação', () => {
  it('gasto acima do limite nasce pendente e não mexe no saldo', async () => {
    const base = await family();
    const before = await balance(base, base.ana, base.checkingId);

    const response = await caioSpends(base, 89_90);
    expect(response.statusCode).toBe(201);
    expect(response.json().status).toBe('PENDING_APPROVAL');

    expect(await balance(base, base.ana, base.checkingId)).toBe(before);

    const list = await pendingList(base, base.ana);
    expect(list.pendingCount).toBe(1);
    expect(list.items[0].requestedByName).toBe('Caio');
    expect(list.items[0].ruleMode).toBe('ABOVE_THRESHOLD');
    expect(list.items[0].ruleThresholdMinor).toBe(50_00);
    expect(list.items[0].transaction.amountMinor).toBe(89_90);
    // A 3c mostra o saldo da conta ANTES de decidir.
    expect(list.items[0].accountBalanceMinor).toBe(before);
  });

  it('gasto exatamente no limite passa direto, sem pendência', async () => {
    const base = await family();
    const response = await caioSpends(base, 50_00);
    expect(response.statusCode).toBe(201);
    expect(response.json().status).toBe('POSTED');
    expect((await pendingList(base, base.ana)).pendingCount).toBe(0);
    expect(await balance(base, base.ana, base.checkingId)).toBe(450_00);
  });

  it('modo ALWAYS segura até o valor mais baixo', async () => {
    const base = await family({ approvalMode: 'ALWAYS' });
    const response = await caioSpends(base, 1_00);
    expect(response.json().status).toBe('PENDING_APPROVAL');
  });

  it('receita do filho não passa por aprovação — a regra é sobre o que sai', async () => {
    const base = await family({ approvalMode: 'ALWAYS' });
    const response = await ctx.app.inject({
      method: 'POST',
      url: `/households/${base.householdId}/incomes`,
      headers: auth(base.caio),
      payload: {
        description: 'Mesada',
        amountMinor: 200_00,
        accountId: base.checkingId,
        memberId: base.caioMemberId,
        idempotencyKey: key('mesada'),
      },
    });
    expect(response.statusCode).toBe(201);
    expect(response.json().status).toBe('POSTED');
  });

  it('quem não é supervisionado nunca gera pendência', async () => {
    const base = await family();
    const members = (
      await ctx.app.inject({
        method: 'GET',
        url: `/households/${base.householdId}/members`,
        headers: auth(base.ana),
      })
    ).json().items as Array<{ id: string; displayName: string }>;
    const brunoMember = members.find((member) => member.displayName === 'Bruno');

    const response = await ctx.app.inject({
      method: 'POST',
      url: `/households/${base.householdId}/expenses`,
      headers: auth(base.bruno),
      payload: {
        description: 'Mercado',
        amountMinor: 300_00,
        accountId: base.checkingId,
        memberId: brunoMember?.id,
        idempotencyKey: key('mercado'),
      },
    });
    expect(response.json().status).toBe('POSTED');
  });
});

describe('decisão', () => {
  async function pendingRequest(base: Family) {
    await caioSpends(base, 89_90);
    const list = await pendingList(base, base.ana);
    return list.items[0];
  }

  it('aprovar posta a movimentação e só então o saldo muda', async () => {
    const base = await family();
    const request = await pendingRequest(base);

    const response = await ctx.app.inject({
      method: 'POST',
      url: `/households/${base.householdId}/approvals/${request.id}/approve`,
      headers: auth(base.ana),
      payload: { expectedVersion: request.version, message: 'Só desta vez.' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().status).toBe('APPROVED');
    expect(response.json().transaction.status).toBe('POSTED');
    expect(response.json().decidedByName).toBe('Ana');
    expect(response.json().decisionMessage).toBe('Só desta vez.');

    expect(await balance(base, base.ana, base.checkingId)).toBe(500_00 - 89_90);
    expect((await pendingList(base, base.ana)).pendingCount).toBe(0);
  });

  it('recusar encerra a pendência preservando o conteúdo enviado', async () => {
    const base = await family();
    const request = await pendingRequest(base);

    const response = await ctx.app.inject({
      method: 'POST',
      url: `/households/${base.householdId}/approvals/${request.id}/reject`,
      headers: auth(base.ana),
      payload: { expectedVersion: request.version, message: 'Passou do combinado.' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().status).toBe('REJECTED');
    // Nada foi apagado: a proposta continua legível, agora como recusada.
    expect(response.json().transaction.status).toBe('REJECTED');
    expect(response.json().transaction.description).toBe('Lanche com os amigos');
    expect(response.json().transaction.amountMinor).toBe(89_90);

    expect(await balance(base, base.ana, base.checkingId)).toBe(500_00);
  });

  it('adulto decide; filho e membro não', async () => {
    const base = await family();
    const request = await pendingRequest(base);

    const bruno = await ctx.app.inject({
      method: 'POST',
      url: `/households/${base.householdId}/approvals/${request.id}/approve`,
      headers: auth(base.bruno),
      payload: { expectedVersion: request.version },
    });
    expect(bruno.statusCode).toBe(200);

    const outro = await pendingRequest(base);
    const caio = await ctx.app.inject({
      method: 'POST',
      url: `/households/${base.householdId}/approvals/${outro.id}/approve`,
      headers: auth(base.caio),
      payload: { expectedVersion: outro.version },
    });
    expect(caio.statusCode).toBe(403);
    expect(caio.json().code).toBe('INSUFFICIENT_PERMISSION');
  });

  it('ninguém decide o próprio pedido, nem com perfil para isso', async () => {
    const base = await family();
    // Bruno vira supervisionado com aprovação sempre — continua ADULT.
    const members = (
      await ctx.app.inject({
        method: 'GET',
        url: `/households/${base.householdId}/members`,
        headers: auth(base.ana),
      })
    ).json().items as Array<{ id: string; displayName: string; version: number }>;
    const brunoMember = members.find((member) => member.displayName === 'Bruno');
    if (!brunoMember) throw new Error('Bruno não entrou na família.');

    await ctx.app.inject({
      method: 'PATCH',
      url: `/households/${base.householdId}/members/${brunoMember.id}`,
      headers: auth(base.ana),
      payload: {
        isSupervised: true,
        approvalMode: 'ALWAYS',
        expectedVersion: brunoMember.version,
      },
    });

    const created = await ctx.app.inject({
      method: 'POST',
      url: `/households/${base.householdId}/expenses`,
      headers: auth(base.bruno),
      payload: {
        description: 'Compra grande',
        amountMinor: 400_00,
        accountId: base.checkingId,
        memberId: brunoMember.id,
        idempotencyKey: key('bruno'),
      },
    });
    expect(created.json().status).toBe('PENDING_APPROVAL');

    const list = await pendingList(base, base.bruno);
    const request = list.items[0];
    const response = await ctx.app.inject({
      method: 'POST',
      url: `/households/${base.householdId}/approvals/${request.id}/approve`,
      headers: auth(base.bruno),
      payload: { expectedVersion: request.version },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().message).toContain('próprio pedido');
  });

  it('duas decisões simultâneas: a segunda cai no controle de versão', async () => {
    const base = await family();
    const request = await pendingRequest(base);

    const first = await ctx.app.inject({
      method: 'POST',
      url: `/households/${base.householdId}/approvals/${request.id}/approve`,
      headers: auth(base.ana),
      payload: { expectedVersion: request.version },
    });
    expect(first.statusCode).toBe(200);

    const second = await ctx.app.inject({
      method: 'POST',
      url: `/households/${base.householdId}/approvals/${request.id}/reject`,
      headers: auth(base.bruno),
      payload: { expectedVersion: request.version },
    });
    expect(second.statusCode).toBe(409);
    expect(second.json().code).toBe('VERSION_CONFLICT');
  });

  it('movimentação pendente não pode ser estornada', async () => {
    const base = await family();
    const request = await pendingRequest(base);

    const response = await ctx.app.inject({
      method: 'POST',
      url: `/households/${base.householdId}/transactions/${request.transaction.id}/reverse`,
      headers: auth(base.ana),
      payload: { reason: 'engano', idempotencyKey: key('estorno') },
    });
    expect(response.statusCode).toBe(409);
  });
});

describe('proteções de banco', () => {
  it('o conteúdo da movimentação pendente é imutável mesmo por SQL direto', async () => {
    const base = await family();
    await caioSpends(base, 89_90);
    const request = (await pendingList(base, base.ana)).items[0];

    await expect(
      adminQuery('UPDATE transactions SET amount_minor = 1 WHERE id = $1', [
        request.transaction.id,
      ]),
    ).rejects.toThrow(/imutável/);
  });

  it('o filho não enxerga pendência de terceiro', async () => {
    const base = await family();
    await caioSpends(base, 89_90);
    // Caio vê a própria; a lista dele traz o pedido dele e nada mais.
    const dele = await pendingList(base, base.caio);
    expect(dele.items).toHaveLength(1);
    expect(dele.items[0].requestedByName).toBe('Caio');
  });
});

describe('cartão', () => {
  it('compra pendente não consome fatura nem limite antes da decisão', async () => {
    const base = await family();

    const created = await caioSpends(base, 300_00, {
      accountId: base.cardId,
      description: 'Fone novo',
      idempotencyKey: key('cartao'),
    });
    expect(created.json().status).toBe('PENDING_APPROVAL');
    expect(created.json().transactionType).toBe('CARD_PURCHASE');

    const cardBefore = await ctx.app.inject({
      method: 'GET',
      url: `/households/${base.householdId}/accounts/${base.cardId}`,
      headers: auth(base.ana),
    });
    expect(cardBefore.json().balanceMinor).toBe(0);
    expect(cardBefore.json().availableLimitMinor).toBe(2_000_00);

    const request = (await pendingList(base, base.ana)).items[0];
    const approved = await ctx.app.inject({
      method: 'POST',
      url: `/households/${base.householdId}/approvals/${request.id}/approve`,
      headers: auth(base.ana),
      payload: { expectedVersion: request.version },
    });
    expect(approved.statusCode).toBe(200);

    const cardAfter = await ctx.app.inject({
      method: 'GET',
      url: `/households/${base.householdId}/accounts/${base.cardId}`,
      headers: auth(base.ana),
    });
    expect(cardAfter.json().balanceMinor).toBe(300_00);
    expect(cardAfter.json().availableLimitMinor).toBe(1_700_00);

    // E a compra aprovada entrou numa fatura — não ficou fora do ciclo.
    const items = await adminQuery<{ count: string }>(
      'SELECT count(*)::text AS count FROM card_statement_items WHERE transaction_id = $1',
      [request.transaction.id],
    );
    expect(items[0]?.count).toBe('1');
  });
});
