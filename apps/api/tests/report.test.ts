/**
 * Fase 7 — Dashboard e relatórios.
 *
 * O caso central é o de docs/13 §2 §"Competência e caixa": os dois modos
 * precisam dar números diferentes para a mesma compra no cartão, e nunca se
 * misturar. Também cobre a regra de que transferência, pagamento de fatura,
 * ajuste e estorno ficam fora dos totais.
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
  cardId: string;
  savingsId: string;
  categoryId: string;
};

let keyCounter = 0;
const key = (prefix: string): string =>
  `${prefix}-teste-${(keyCounter += 1).toString().padStart(8, '0')}`;

const headers = (user: TestUser) => ({ authorization: `Bearer ${user.accessToken}` });

async function setup(): Promise<Base> {
  const owner = await registerUser(ctx, 'ana@exemplo.com', 'Ana');
  const auth = headers(owner);

  const household = (
    await ctx.app.inject({
      method: 'POST',
      url: '/households',
      headers: auth,
      payload: { name: 'Família Souza', ownerDisplayName: 'Ana' },
    })
  ).json();

  const members = (
    await ctx.app.inject({
      method: 'GET',
      url: `/households/${household.id}/members`,
      headers: auth,
    })
  ).json();

  const account = async (payload: Record<string, unknown>) =>
    (
      await ctx.app.inject({
        method: 'POST',
        url: `/households/${household.id}/accounts`,
        headers: auth,
        payload,
      })
    ).json();

  const checking = await account({
    name: 'Conta Corrente',
    accountType: 'CHECKING',
    openingBalanceMinor: 1_000_000,
  });
  const savings = await account({
    name: 'Poupança',
    accountType: 'SAVINGS',
    openingBalanceMinor: 200_000,
  });
  const card = await account({
    name: 'Cartão Azul',
    accountType: 'CREDIT_CARD',
    creditLimitMinor: 500_000,
    closingDay: 10,
    dueDay: 15,
  });

  const categories = (
    await ctx.app.inject({
      method: 'GET',
      url: `/households/${household.id}/categories`,
      headers: auth,
    })
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

function post(base: Base, url: string, payload: unknown) {
  return ctx.app.inject({ method: 'POST', url, headers: headers(base.owner), payload });
}

function get(base: Base, url: string) {
  return ctx.app.inject({ method: 'GET', url, headers: headers(base.owner) });
}

const PERIOD = 'from=2026-08-01&to=2026-08-31';

describe('competência × caixa (docs/13 §2)', () => {
  it('compra no cartão entra em competência e NÃO em caixa', async () => {
    const base = await setup();
    await post(base, `/households/${base.householdId}/card-purchases`, {
      accountId: base.cardId,
      description: 'Notebook',
      amountMinor: 300_000,
      purchaseDate: '2026-08-05',
      memberId: base.memberId,
      installments: 1,
      idempotencyKey: key('compra'),
    });

    const accrual = await get(
      base,
      `/households/${base.householdId}/reports/summary?mode=ACCRUAL&${PERIOD}`,
    );
    const cash = await get(
      base,
      `/households/${base.householdId}/reports/summary?mode=CASH&${PERIOD}`,
    );

    expect(accrual.json().expenseMinor).toBe(300_000);
    expect(cash.json().expenseMinor).toBe(0);
  });

  it('pagamento da fatura entra em caixa e NÃO em competência', async () => {
    const base = await setup();
    await post(base, `/households/${base.householdId}/card-purchases`, {
      accountId: base.cardId,
      description: 'Compras',
      amountMinor: 100_000,
      purchaseDate: '2026-08-05',
      memberId: base.memberId,
      installments: 1,
      idempotencyKey: key('compra-fatura'),
    });
    const statements = await get(
      base,
      `/households/${base.householdId}/card-statements?accountId=${base.cardId}`,
    );
    const statement = statements.json().items[0];
    const closed = (
      await post(base, `/households/${base.householdId}/card-statements/${statement.id}/close`, {
        expectedVersion: statement.version,
      })
    ).json();
    await post(base, `/households/${base.householdId}/card-statements/${statement.id}/payments`, {
      amountMinor: 100_000,
      fromAccountId: base.checkingId,
      paidAt: '2026-08-15',
      memberId: base.memberId,
      idempotencyKey: key('pagamento'),
      expectedVersion: closed.version,
    });

    const accrual = await get(
      base,
      `/households/${base.householdId}/reports/summary?mode=ACCRUAL&${PERIOD}`,
    );
    const cash = await get(
      base,
      `/households/${base.householdId}/reports/summary?mode=CASH&${PERIOD}`,
    );

    // Em competência, a despesa foi a compra — o pagamento não repete.
    expect(accrual.json().expenseMinor).toBe(100_000);
    // Em caixa, a despesa é a saída de dinheiro: o pagamento da fatura.
    expect(cash.json().expenseMinor).toBe(100_000);
  });
});

describe('o que fica fora dos totais', () => {
  it('transferência, ajuste e estorno não contam como receita ou despesa', async () => {
    const base = await setup();

    await post(base, `/households/${base.householdId}/transfers`, {
      description: 'Reserva',
      amountMinor: 100_000,
      fromAccountId: base.checkingId,
      toAccountId: base.savingsId,
      memberId: base.memberId,
      occurredAt: '2026-08-10',
      competenceDate: '2026-08-10',
      idempotencyKey: key('transferencia'),
    });

    const accounts = await get(base, `/households/${base.householdId}/accounts`);
    const checking = accounts
      .json()
      .items.find((item: { id: string }) => item.id === base.checkingId);
    await post(base, `/households/${base.householdId}/accounts/${base.checkingId}/adjust-balance`, {
      newBalanceMinor: checking.balanceMinor + 5_000,
      reason: 'Conferência',
      idempotencyKey: key('ajuste'),
      expectedVersion: checking.version,
    });

    const despesa = (
      await post(base, `/households/${base.householdId}/expenses`, {
        description: 'Compra errada',
        amountMinor: 20_000,
        accountId: base.checkingId,
        memberId: base.memberId,
        occurredAt: '2026-08-12',
        competenceDate: '2026-08-12',
        idempotencyKey: key('despesa-estornada'),
      })
    ).json();
    await post(base, `/households/${base.householdId}/transactions/${despesa.id}/reverse`, {
      reason: 'Duplicidade',
      idempotencyKey: key('estorno'),
    });

    const summary = await get(
      base,
      `/households/${base.householdId}/reports/summary?mode=CASH&${PERIOD}`,
    );
    expect(summary.json().incomeMinor).toBe(0);
    expect(summary.json().expenseMinor).toBe(0);
  });
});

describe('dashboard (tela 1b)', () => {
  it('devolve saldo consolidado, previsto × realizado e próximos compromissos', async () => {
    const base = await setup();

    await post(base, `/households/${base.householdId}/planned-entries`, {
      nature: 'PAYABLE',
      description: 'Energia elétrica',
      originalAmountMinor: 31_240,
      competenceDate: '2026-08-01',
      dueDate: '2026-08-08',
      memberId: base.memberId,
      idempotencyKey: key('prevista'),
    });
    await post(base, `/households/${base.householdId}/incomes`, {
      description: 'Salário',
      amountMinor: 420_000,
      accountId: base.checkingId,
      memberId: base.memberId,
      occurredAt: '2026-08-05',
      competenceDate: '2026-08-05',
      idempotencyKey: key('salario'),
    });

    const dashboard = await get(base, `/households/${base.householdId}/dashboard?${PERIOD}`);

    expect(dashboard.statusCode).toBe(200);
    const body = dashboard.json();
    expect(body.availableBalanceMinor).toBe(1_000_000 + 200_000 + 420_000);
    expect(body.cardDebtMinor).toBe(0);
    expect(body.consolidatedBalanceMinor).toBe(body.availableBalanceMinor);
    expect(body.summary.incomeMinor).toBe(420_000);
    expect(body.summary.plannedExpenseMinor).toBe(31_240);
    expect(body.upcoming.length).toBeGreaterThanOrEqual(1);
    expect(body.byMember[0].memberName).toBe('Ana');
  });

  it('desconta a dívida de cartões do saldo consolidado', async () => {
    const base = await setup();
    await post(base, `/households/${base.householdId}/card-purchases`, {
      accountId: base.cardId,
      description: 'Compra',
      amountMinor: 50_000,
      purchaseDate: '2026-08-05',
      memberId: base.memberId,
      installments: 1,
      idempotencyKey: key('compra-dash'),
    });

    const body = (await get(base, `/households/${base.householdId}/dashboard?${PERIOD}`)).json();
    expect(body.cardDebtMinor).toBe(50_000);
    expect(body.consolidatedBalanceMinor).toBe(1_200_000 - 50_000);
  });
});

describe('por categoria e por membro', () => {
  it('agrupa despesas por categoria com percentual', async () => {
    const base = await setup();
    await post(base, `/households/${base.householdId}/expenses`, {
      description: 'Mercado',
      amountMinor: 30_000,
      accountId: base.checkingId,
      memberId: base.memberId,
      categoryId: base.categoryId,
      occurredAt: '2026-08-05',
      competenceDate: '2026-08-05',
      idempotencyKey: key('mercado'),
    });
    await post(base, `/households/${base.householdId}/expenses`, {
      description: 'Sem categoria',
      amountMinor: 10_000,
      accountId: base.checkingId,
      memberId: base.memberId,
      occurredAt: '2026-08-06',
      competenceDate: '2026-08-06',
      idempotencyKey: key('sem-categoria'),
    });

    const report = await get(
      base,
      `/households/${base.householdId}/reports/by-category?mode=ACCRUAL&${PERIOD}`,
    );
    expect(report.json().totalMinor).toBe(40_000);
    expect(report.json().items[0]).toMatchObject({ categoryName: 'Alimentação', percent: 75 });
    expect(report.json().items[1].categoryName).toBe('Sem categoria');
  });

  it('soma pelos rateios quando existem (tela 4c)', async () => {
    const base = await setup();
    await ctx.app.inject({
      method: 'POST',
      url: `/households/${base.householdId}/invitations`,
      headers: headers(base.owner),
      payload: { email: 'bruno@exemplo.com', displayName: 'Bruno', role: 'ADULT' },
    });
    const token = lastEmailLink(ctx.mailer);
    const bruno = await registerUser(ctx, 'bruno@exemplo.com');
    await ctx.app.inject({
      method: 'POST',
      url: '/invitations/accept',
      headers: headers(bruno),
      payload: { token },
    });

    const members = (await get(base, `/households/${base.householdId}/members`)).json().items;
    const ana = members.find((m: { displayName: string }) => m.displayName === 'Ana');
    const brunoMember = members.find((m: { displayName: string }) => m.displayName === 'Bruno');

    await post(base, `/households/${base.householdId}/expenses`, {
      description: 'Supermercado',
      amountMinor: 30_000,
      accountId: base.checkingId,
      memberId: ana.id,
      occurredAt: '2026-08-05',
      competenceDate: '2026-08-05',
      idempotencyKey: key('rateado'),
      allocations: [
        { memberId: ana.id, amountMinor: 20_000 },
        { memberId: brunoMember.id, amountMinor: 10_000 },
      ],
    });

    const report = await get(
      base,
      `/households/${base.householdId}/reports/by-member?mode=ACCRUAL&${PERIOD}`,
    );
    const items = report.json().items;
    expect(report.json().totalMinor).toBe(30_000);
    expect(items.find((i: { memberName: string }) => i.memberName === 'Ana').amountMinor).toBe(
      20_000,
    );
    expect(items.find((i: { memberName: string }) => i.memberName === 'Bruno').amountMinor).toBe(
      10_000,
    );
    expect(
      items.find((i: { memberName: string }) => i.memberName === 'Ana').fromAllocationsMinor,
    ).toBe(20_000);
  });
});

describe('evolução e exportação', () => {
  it('devolve os meses com receita e despesa', async () => {
    const base = await setup();
    await post(base, `/households/${base.householdId}/incomes`, {
      description: 'Salário',
      amountMinor: 100_000,
      accountId: base.checkingId,
      memberId: base.memberId,
      idempotencyKey: key('evolucao'),
    });

    const report = await get(
      base,
      `/households/${base.householdId}/reports/evolution?mode=CASH&months=6`,
    );
    expect(report.statusCode).toBe(200);
    expect(report.json().months.length).toBeGreaterThanOrEqual(1);
  });

  it('exporta CSV e registra na auditoria', async () => {
    const base = await setup();
    await post(base, `/households/${base.householdId}/expenses`, {
      description: 'Mercado',
      amountMinor: 15_000,
      accountId: base.checkingId,
      memberId: base.memberId,
      occurredAt: '2026-08-05',
      competenceDate: '2026-08-05',
      idempotencyKey: key('exportar'),
    });

    const result = await post(base, `/households/${base.householdId}/reports/export`, {
      format: 'CSV',
      mode: 'CASH',
      from: '2026-08-01',
      to: '2026-08-31',
      content: 'TRANSACTIONS',
    });

    expect(result.statusCode).toBe(200);
    expect(result.json().rowCount).toBe(1);
    expect(result.json().content).toContain('Mercado');
    expect(result.json().fileName).toContain('.csv');

    const audit = await get(base, `/households/${base.householdId}/audit`);
    expect(audit.json().items.map((item: { action: string }) => item.action)).toContain(
      'EXPORT_REQUESTED',
    );
  });

  it('filho supervisionado não exporta dados amplos', async () => {
    const base = await setup();
    await ctx.app.inject({
      method: 'POST',
      url: `/households/${base.householdId}/invitations`,
      headers: headers(base.owner),
      payload: {
        email: 'caio@exemplo.com',
        displayName: 'Caio',
        role: 'CHILD',
        isSupervised: true,
      },
    });
    const token = lastEmailLink(ctx.mailer);
    const caio = await registerUser(ctx, 'caio@exemplo.com');
    await ctx.app.inject({
      method: 'POST',
      url: '/invitations/accept',
      headers: headers(caio),
      payload: { token },
    });

    const response = await ctx.app.inject({
      method: 'POST',
      url: `/households/${base.householdId}/reports/export`,
      headers: headers(caio),
      payload: { format: 'CSV', from: '2026-08-01', to: '2026-08-31' },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().code).toBe('INSUFFICIENT_PERMISSION');
  });
});
