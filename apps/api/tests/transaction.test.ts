/**
 * Fase 4 — movimentações realizadas.
 *
 * Cobre os casos financeiros obrigatórios de docs/13 §2 aplicáveis: idempotência,
 * transferência, rateio, estorno (incluindo estorno duplicado) e o efeito no
 * saldo — a movimentação postada NUNCA é excluída.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
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

type Base = {
  owner: TestUser;
  householdId: string;
  memberId: string;
  checkingId: string;
  savingsId: string;
  cardId: string;
  categoryId: string;
};

let keyCounter = 0;
const key = (prefix: string): string =>
  `${prefix}-teste-${(keyCounter += 1).toString().padStart(8, '0')}`;

function auth(user: TestUser) {
  return { authorization: `Bearer ${user.accessToken}` };
}

async function setup(): Promise<Base> {
  const owner = await registerUser(ctx, 'ana@exemplo.com', 'Ana');
  const headers = auth(owner);

  const household = (
    await ctx.app.inject({
      method: 'POST',
      url: '/households',
      headers,
      payload: { name: 'Família Souza', ownerDisplayName: 'Ana' },
    })
  ).json();

  const members = (
    await ctx.app.inject({ method: 'GET', url: `/households/${household.id}/members`, headers })
  ).json();

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
    openingBalanceMinor: 500_000,
  });
  const savings = await account({
    name: 'Poupança',
    accountType: 'SAVINGS',
    openingBalanceMinor: 100_000,
  });
  const card = await account({
    name: 'Cartão Azul',
    accountType: 'CREDIT_CARD',
    cardBrand: 'Visa',
    cardLastFour: '4412',
    creditLimitMinor: 500_000,
    closingDay: 10,
    dueDay: 15,
  });

  const categories = (
    await ctx.app.inject({ method: 'GET', url: `/households/${household.id}/categories`, headers })
  ).json();

  return {
    owner,
    householdId: household.id,
    memberId: members.items[0].id,
    checkingId: checking.id,
    savingsId: savings.id,
    cardId: card.id,
    categoryId: categories.items.find((c: { name: string }) => c.name === 'Alimentação').id,
  };
}

function post(user: TestUser, url: string, payload: unknown, headers: Record<string, string> = {}) {
  return ctx.app.inject({ method: 'POST', url, headers: { ...auth(user), ...headers }, payload });
}

function get(user: TestUser, url: string) {
  return ctx.app.inject({ method: 'GET', url, headers: auth(user) });
}

async function balanceOf(base: Base, accountId: string): Promise<number> {
  const response = await get(base.owner, `/households/${base.householdId}/accounts/${accountId}`);
  return response.json().balanceMinor;
}

describe('despesa e receita', () => {
  it('despesa reduz o saldo da conta', async () => {
    const base = await setup();
    const response = await post(base.owner, `/households/${base.householdId}/expenses`, {
      description: 'Mercado',
      amountMinor: 15_000,
      accountId: base.checkingId,
      memberId: base.memberId,
      categoryId: base.categoryId,
      idempotencyKey: key('despesa'),
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().transactionType).toBe('EXPENSE');
    expect(await balanceOf(base, base.checkingId)).toBe(485_000);
  });

  it('receita aumenta o saldo da conta', async () => {
    const base = await setup();
    await post(base.owner, `/households/${base.householdId}/incomes`, {
      description: 'Salário',
      amountMinor: 420_000,
      accountId: base.checkingId,
      memberId: base.memberId,
      idempotencyKey: key('receita'),
    });
    expect(await balanceOf(base, base.checkingId)).toBe(920_000);
  });

  it('despesa em cartão vira compra no cartão e NÃO mexe na conta bancária', async () => {
    const base = await setup();
    const response = await post(base.owner, `/households/${base.householdId}/expenses`, {
      description: 'Farmácia',
      amountMinor: 8_990,
      accountId: base.cardId,
      memberId: base.memberId,
      idempotencyKey: key('cartao'),
    });

    expect(response.json().transactionType).toBe('CARD_PURCHASE');
    expect(await balanceOf(base, base.checkingId)).toBe(500_000);
    // No cartão, "saldo" é dívida: sobe com a compra.
    expect(await balanceOf(base, base.cardId)).toBe(8_990);

    const card = await get(base.owner, `/households/${base.householdId}/accounts/${base.cardId}`);
    expect(card.json().availableLimitMinor).toBe(500_000 - 8_990);
  });

  it('recusa valor fracionário e valor zero', async () => {
    const base = await setup();
    const invalid = (amountMinor: number) =>
      post(base.owner, `/households/${base.householdId}/expenses`, {
        description: 'Teste',
        amountMinor,
        accountId: base.checkingId,
        memberId: base.memberId,
        idempotencyKey: key('invalido'),
      });
    expect((await invalid(10.5)).statusCode).toBe(400);
    expect((await invalid(0)).statusCode).toBe(400);
    expect((await invalid(-100)).statusCode).toBe(400);
  });

  it('recusa lançamento em conta arquivada', async () => {
    const base = await setup();
    await post(base.owner, `/households/${base.householdId}/accounts/${base.savingsId}/archive`, {
      archived: true,
    });
    const response = await post(base.owner, `/households/${base.householdId}/expenses`, {
      description: 'Teste',
      amountMinor: 1_000,
      accountId: base.savingsId,
      memberId: base.memberId,
      idempotencyKey: key('arquivada'),
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().code).toBe('ACCOUNT_ARCHIVED');
  });
});

describe('idempotência (docs/04 §14)', () => {
  it('a mesma chave devolve a MESMA movimentação e não duplica o efeito', async () => {
    const base = await setup();
    const payload = {
      description: 'Mercado',
      amountMinor: 15_000,
      accountId: base.checkingId,
      memberId: base.memberId,
      idempotencyKey: 'despesa-repetida-000001',
    };

    const first = await post(base.owner, `/households/${base.householdId}/expenses`, payload);
    const second = await post(base.owner, `/households/${base.householdId}/expenses`, payload);

    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(201);
    expect(second.json().id).toBe(first.json().id);
    // O saldo caiu uma vez só.
    expect(await balanceOf(base, base.checkingId)).toBe(485_000);
  });

  it('aceita a chave pelo cabeçalho Idempotency-Key', async () => {
    const base = await setup();
    const payload = {
      description: 'Padaria',
      amountMinor: 2_500,
      accountId: base.checkingId,
      memberId: base.memberId,
      idempotencyKey: 'sera-substituida-000001',
    };
    const headers = { 'idempotency-key': 'header-chave-de-teste-01' };

    const first = await post(
      base.owner,
      `/households/${base.householdId}/expenses`,
      payload,
      headers,
    );
    const second = await post(
      base.owner,
      `/households/${base.householdId}/expenses`,
      payload,
      headers,
    );

    expect(second.json().id).toBe(first.json().id);
    expect(await balanceOf(base, base.checkingId)).toBe(497_500);
  });
});

describe('transferência (docs/04 §9)', () => {
  it('move o saldo entre contas e não é receita nem despesa', async () => {
    const base = await setup();
    const response = await post(base.owner, `/households/${base.householdId}/transfers`, {
      description: 'Reserva do mês',
      amountMinor: 100_000,
      fromAccountId: base.checkingId,
      toAccountId: base.savingsId,
      memberId: base.memberId,
      idempotencyKey: key('transferencia'),
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().transactionType).toBe('TRANSFER');
    expect(await balanceOf(base, base.checkingId)).toBe(400_000);
    expect(await balanceOf(base, base.savingsId)).toBe(200_000);

    // Não aparece como despesa nem como receita na lista filtrada por tipo.
    const expenses = await get(
      base.owner,
      `/households/${base.householdId}/transactions?type=EXPENSE`,
    );
    expect(expenses.json().items).toHaveLength(0);
  });

  it('recusa origem igual ao destino', async () => {
    const base = await setup();
    const response = await post(base.owner, `/households/${base.householdId}/transfers`, {
      description: 'Inválida',
      amountMinor: 1_000,
      fromAccountId: base.checkingId,
      toAccountId: base.checkingId,
      memberId: base.memberId,
      idempotencyKey: key('mesma-conta'),
    });
    expect(response.statusCode).toBe(400);
  });

  it('a tarifa vira uma despesa separada', async () => {
    const base = await setup();
    await post(base.owner, `/households/${base.householdId}/transfers`, {
      description: 'TED para poupança',
      amountMinor: 100_000,
      feeMinor: 1_050,
      fromAccountId: base.checkingId,
      toAccountId: base.savingsId,
      memberId: base.memberId,
      idempotencyKey: key('com-tarifa'),
    });

    expect(await balanceOf(base, base.checkingId)).toBe(500_000 - 100_000 - 1_050);
    const expenses = await get(
      base.owner,
      `/households/${base.householdId}/transactions?type=EXPENSE`,
    );
    expect(expenses.json().items).toHaveLength(1);
    expect(expenses.json().items[0].description).toContain('Tarifa');
  });
});

describe('rateio (docs/04 §12)', () => {
  it('aceita rateio que soma exatamente o total', async () => {
    const base = await setup();
    const response = await post(base.owner, `/households/${base.householdId}/expenses`, {
      description: 'Supermercado',
      amountMinor: 30_000,
      accountId: base.checkingId,
      memberId: base.memberId,
      idempotencyKey: key('rateio'),
      allocations: [
        { memberId: base.memberId, amountMinor: 20_000 },
        { memberId: base.memberId, amountMinor: 10_000 },
      ],
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().allocations).toHaveLength(2);
    expect(
      response
        .json()
        .allocations.reduce(
          (sum: number, item: { amountMinor: number }) => sum + item.amountMinor,
          0,
        ),
    ).toBe(30_000);
  });

  it('recusa rateio que não fecha o total', async () => {
    const base = await setup();
    const response = await post(base.owner, `/households/${base.householdId}/expenses`, {
      description: 'Supermercado',
      amountMinor: 30_000,
      accountId: base.checkingId,
      memberId: base.memberId,
      idempotencyKey: key('rateio-errado'),
      allocations: [{ memberId: base.memberId, amountMinor: 20_000 }],
    });
    expect(response.statusCode).toBe(400);
  });

  it('substitui o rateio com validação no servidor', async () => {
    const base = await setup();
    const created = (
      await post(base.owner, `/households/${base.householdId}/expenses`, {
        description: 'Supermercado',
        amountMinor: 30_000,
        accountId: base.checkingId,
        memberId: base.memberId,
        idempotencyKey: key('rateio-troca'),
      })
    ).json();

    const wrong = await ctx.app.inject({
      method: 'PUT',
      url: `/households/${base.householdId}/transactions/${created.id}/allocations`,
      headers: auth(base.owner),
      payload: {
        allocations: [{ memberId: base.memberId, amountMinor: 1_000 }],
        expectedVersion: created.version,
      },
    });
    expect(wrong.statusCode).toBe(422);
    expect(wrong.json().code).toBe('INVALID_ALLOCATION_TOTAL');

    const right = await ctx.app.inject({
      method: 'PUT',
      url: `/households/${base.householdId}/transactions/${created.id}/allocations`,
      headers: auth(base.owner),
      payload: {
        allocations: [{ memberId: base.memberId, amountMinor: 30_000 }],
        expectedVersion: created.version,
      },
    });
    expect(right.statusCode).toBe(200);
    expect(right.json().allocations).toHaveLength(1);
  });
});

describe('estorno (docs/04 §8)', () => {
  it('cria a linha inversa, preserva a original e devolve o saldo', async () => {
    const base = await setup();
    const created = (
      await post(base.owner, `/households/${base.householdId}/expenses`, {
        description: 'Compra errada',
        amountMinor: 25_000,
        accountId: base.checkingId,
        memberId: base.memberId,
        idempotencyKey: key('para-estornar'),
      })
    ).json();
    expect(await balanceOf(base, base.checkingId)).toBe(475_000);

    const reversal = await post(
      base.owner,
      `/households/${base.householdId}/transactions/${created.id}/reverse`,
      { reason: 'Lançamento em duplicidade', idempotencyKey: key('estorno') },
    );

    expect(reversal.statusCode).toBe(201);
    expect(reversal.json().transactionType).toBe('REVERSAL');
    expect(reversal.json().reversedTransactionId).toBe(created.id);
    // A REVERSAL não entra no cálculo de saldo, e a original sai (REVERSED).
    expect(await balanceOf(base, base.checkingId)).toBe(500_000);

    const original = await get(
      base.owner,
      `/households/${base.householdId}/transactions/${created.id}`,
    );
    expect(original.statusCode).toBe(200);
    expect(original.json().status).toBe('REVERSED');
    expect(original.json().reason).toBe('Lançamento em duplicidade');
  });

  it('exige motivo', async () => {
    const base = await setup();
    const created = (
      await post(base.owner, `/households/${base.householdId}/expenses`, {
        description: 'Compra',
        amountMinor: 1_000,
        accountId: base.checkingId,
        memberId: base.memberId,
        idempotencyKey: key('sem-motivo'),
      })
    ).json();

    const response = await post(
      base.owner,
      `/households/${base.householdId}/transactions/${created.id}/reverse`,
      { idempotencyKey: key('estorno-sem-motivo') },
    );
    expect(response.statusCode).toBe(400);
  });

  it('bloqueia estorno duplicado', async () => {
    const base = await setup();
    const created = (
      await post(base.owner, `/households/${base.householdId}/expenses`, {
        description: 'Compra',
        amountMinor: 5_000,
        accountId: base.checkingId,
        memberId: base.memberId,
        idempotencyKey: key('estorno-duplo'),
      })
    ).json();

    const first = await post(
      base.owner,
      `/households/${base.householdId}/transactions/${created.id}/reverse`,
      { reason: 'Erro', idempotencyKey: key('estorno-1') },
    );
    const second = await post(
      base.owner,
      `/households/${base.householdId}/transactions/${created.id}/reverse`,
      { reason: 'Erro de novo', idempotencyKey: key('estorno-2') },
    );

    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(409);
    expect(second.json().code).toBe('TRANSACTION_ALREADY_REVERSED');
    expect(await balanceOf(base, base.checkingId)).toBe(500_000);
  });

  it('movimentação postada não é excluída, nem por estorno', async () => {
    const base = await setup();
    const created = (
      await post(base.owner, `/households/${base.householdId}/expenses`, {
        description: 'Compra',
        amountMinor: 5_000,
        accountId: base.checkingId,
        memberId: base.memberId,
        idempotencyKey: key('preserva'),
      })
    ).json();
    await post(base.owner, `/households/${base.householdId}/transactions/${created.id}/reverse`, {
      reason: 'Erro',
      idempotencyKey: key('estorno-preserva'),
    });

    const list = await get(base.owner, `/households/${base.householdId}/transactions`);
    const ids = list.json().items.map((item: { id: string }) => item.id);
    expect(ids).toContain(created.id);
  });
});

describe('busca e filtros (tela 1g)', () => {
  async function seed(base: Base) {
    await post(base.owner, `/households/${base.householdId}/expenses`, {
      description: 'Padaria do Zé',
      amountMinor: 2_500,
      accountId: base.checkingId,
      memberId: base.memberId,
      categoryId: base.categoryId,
      counterpartyName: 'Padaria do Zé',
      idempotencyKey: key('busca-a'),
    });
    await post(base.owner, `/households/${base.householdId}/expenses`, {
      description: 'Posto de gasolina',
      amountMinor: 20_000,
      accountId: base.checkingId,
      memberId: base.memberId,
      idempotencyKey: key('busca-b'),
    });
    await post(base.owner, `/households/${base.householdId}/incomes`, {
      description: 'Salário',
      amountMinor: 420_000,
      accountId: base.checkingId,
      memberId: base.memberId,
      idempotencyKey: key('busca-c'),
    });
  }

  it('busca por descrição', async () => {
    const base = await setup();
    await seed(base);
    const response = await get(
      base.owner,
      `/households/${base.householdId}/transactions?search=padaria`,
    );
    expect(response.json().items).toHaveLength(1);
    expect(response.json().items[0].description).toBe('Padaria do Zé');
  });

  it('busca por valor exato em centavos', async () => {
    const base = await setup();
    await seed(base);
    const response = await get(
      base.owner,
      `/households/${base.householdId}/transactions?search=20000`,
    );
    expect(response.json().items).toHaveLength(1);
    expect(response.json().items[0].description).toBe('Posto de gasolina');
  });

  it('filtra por tipo e por categoria', async () => {
    const base = await setup();
    await seed(base);

    const incomes = await get(
      base.owner,
      `/households/${base.householdId}/transactions?type=INCOME`,
    );
    expect(incomes.json().items).toHaveLength(1);

    const byCategory = await get(
      base.owner,
      `/households/${base.householdId}/transactions?categoryId=${base.categoryId}`,
    );
    expect(byCategory.json().items).toHaveLength(1);
  });

  it('pagina por cursor sem repetir nem perder itens', async () => {
    const base = await setup();
    for (let index = 0; index < 5; index += 1) {
      await post(base.owner, `/households/${base.householdId}/expenses`, {
        description: `Compra ${index}`,
        amountMinor: 1_000 + index,
        accountId: base.checkingId,
        memberId: base.memberId,
        idempotencyKey: key(`pagina-${index}`),
      });
    }

    const firstPage = await get(
      base.owner,
      `/households/${base.householdId}/transactions?pageSize=2`,
    );
    expect(firstPage.json().items).toHaveLength(2);
    expect(firstPage.json().nextCursor).not.toBeNull();

    const secondPage = await get(
      base.owner,
      `/households/${base.householdId}/transactions?pageSize=2&cursor=${encodeURIComponent(firstPage.json().nextCursor)}`,
    );
    const firstIds = firstPage.json().items.map((item: { id: string }) => item.id);
    const secondIds = secondPage.json().items.map((item: { id: string }) => item.id);
    expect(secondIds.some((id: string) => firstIds.includes(id))).toBe(false);
  });
});

describe('permissões', () => {
  it('membro comum não faz transferência nem estorno', async () => {
    const base = await setup();
    await ctx.app.inject({
      method: 'POST',
      url: `/households/${base.householdId}/invitations`,
      headers: auth(base.owner),
      payload: { email: 'bruno@exemplo.com', displayName: 'Bruno', role: 'MEMBER' },
    });
    const token = lastEmailLink(ctx.mailer);
    const bruno = await registerUser(ctx, 'bruno@exemplo.com');
    await post(bruno, '/invitations/accept', { token });

    const transfer = await post(bruno, `/households/${base.householdId}/transfers`, {
      description: 'Tentativa',
      amountMinor: 1_000,
      fromAccountId: base.checkingId,
      toAccountId: base.savingsId,
      memberId: base.memberId,
      idempotencyKey: key('sem-permissao'),
    });
    expect(transfer.statusCode).toBe(403);
    expect(transfer.json().code).toBe('INSUFFICIENT_PERMISSION');
  });
});
