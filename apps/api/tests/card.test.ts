/**
 * Fase 6 — Cartões.
 *
 * Cobre os casos obrigatórios de docs/13 §2: compra no cartão, parcelamento,
 * pagamento da fatura (que NÃO vira despesa), reembolso e limite.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  closeAdminPool,
  createTestContext,
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

  const checking = (
    await ctx.app.inject({
      method: 'POST',
      url: `/households/${household.id}/accounts`,
      headers: auth,
      payload: {
        name: 'Conta Corrente',
        accountType: 'CHECKING',
        openingBalanceMinor: 1_000_000,
      },
    })
  ).json();

  const card = (
    await ctx.app.inject({
      method: 'POST',
      url: `/households/${household.id}/accounts`,
      headers: auth,
      payload: {
        name: 'Cartão Azul',
        accountType: 'CREDIT_CARD',
        cardBrand: 'Visa',
        cardLastFour: '4412',
        creditLimitMinor: 500_000,
        closingDay: 10,
        dueDay: 15,
      },
    })
  ).json();

  return {
    owner,
    householdId: household.id,
    memberId: members.items[0].id,
    checkingId: checking.id,
    cardId: card.id,
  };
}

function post(base: Base, url: string, payload: unknown) {
  return ctx.app.inject({ method: 'POST', url, headers: headers(base.owner), payload });
}

function get(base: Base, url: string) {
  return ctx.app.inject({ method: 'GET', url, headers: headers(base.owner) });
}

async function balance(base: Base, accountId: string): Promise<number> {
  const response = await get(base, `/households/${base.householdId}/accounts/${accountId}`);
  return response.json().balanceMinor;
}

describe('compra no cartão (docs/04 §10)', () => {
  it('vira despesa por competência, consome limite e não mexe na conta', async () => {
    const base = await setup();
    const response = await post(base, `/households/${base.householdId}/card-purchases`, {
      accountId: base.cardId,
      description: 'Notebook',
      amountMinor: 300_000,
      purchaseDate: '2026-08-05',
      memberId: base.memberId,
      installments: 1,
      idempotencyKey: key('compra'),
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().transactionIds).toHaveLength(1);
    expect(response.json().availableLimitAfterMinor).toBe(200_000);
    expect(await balance(base, base.checkingId)).toBe(1_000_000);
    expect(await balance(base, base.cardId)).toBe(300_000);
  });

  it('parcela com soma exata e centavos na última parcela', async () => {
    const base = await setup();
    const response = await post(base, `/households/${base.householdId}/card-purchases`, {
      accountId: base.cardId,
      description: 'Sofá',
      amountMinor: 100_000,
      purchaseDate: '2026-08-05',
      memberId: base.memberId,
      installments: 3,
      idempotencyKey: key('parcelada'),
    });

    const installments = response.json().installments;
    expect(installments.map((item: { amountMinor: number }) => item.amountMinor)).toEqual([
      33_333, 33_333, 33_334,
    ]);
    expect(
      installments.reduce(
        (sum: number, item: { amountMinor: number }) => sum + item.amountMinor,
        0,
      ),
    ).toBe(100_000);
    expect(installments[2].carriesRounding).toBe(true);
    // Cada parcela cai numa fatura consecutiva.
    expect(installments.map((item: { dueDate: string }) => item.dueDate)).toEqual([
      '2026-08-15',
      '2026-09-15',
      '2026-10-15',
    ]);
  });

  it('recusa chave de idempotência repetida', async () => {
    const base = await setup();
    const payload = {
      accountId: base.cardId,
      description: 'Compra',
      amountMinor: 10_000,
      purchaseDate: '2026-08-05',
      memberId: base.memberId,
      installments: 1,
      idempotencyKey: 'compra-repetida-000001',
    };
    expect(
      (await post(base, `/households/${base.householdId}/card-purchases`, payload)).statusCode,
    ).toBe(201);
    const second = await post(base, `/households/${base.householdId}/card-purchases`, payload);
    expect(second.statusCode).toBe(409);
    expect(second.json().code).toBe('DUPLICATE_IDEMPOTENCY_KEY');
  });

  it('recusa compra numa conta que não é cartão', async () => {
    const base = await setup();
    const response = await post(base, `/households/${base.householdId}/card-purchases`, {
      accountId: base.checkingId,
      description: 'Compra',
      amountMinor: 10_000,
      purchaseDate: '2026-08-05',
      memberId: base.memberId,
      idempotencyKey: key('conta-errada'),
    });
    expect(response.statusCode).toBe(422);
    expect(response.json().code).toBe('INVALID_ACCOUNT_TYPE');
  });
});

describe('fatura', () => {
  async function purchaseAndStatement(base: Base, amountMinor = 200_000) {
    await post(base, `/households/${base.householdId}/card-purchases`, {
      accountId: base.cardId,
      description: 'Compras do mês',
      amountMinor,
      purchaseDate: '2026-08-05',
      memberId: base.memberId,
      installments: 1,
      idempotencyKey: key('fatura'),
    });
    const statements = await get(
      base,
      `/households/${base.householdId}/card-statements?accountId=${base.cardId}`,
    );
    return statements.json().items[0];
  }

  it('agrupa as compras do ciclo e calcula o total', async () => {
    const base = await setup();
    const statement = await purchaseAndStatement(base);

    expect(statement.status).toBe('OPEN');
    expect(statement.totalMinor).toBe(200_000);
    expect(statement.paidMinor).toBe(0);
    expect(statement.outstandingMinor).toBe(200_000);
    expect(statement.closingDate).toBe('2026-08-10');
    expect(statement.dueDate).toBe('2026-08-15');
    expect(statement.items).toHaveLength(1);
  });

  it('fechar a fatura muda o status e usa expectedVersion', async () => {
    const base = await setup();
    const statement = await purchaseAndStatement(base);

    const stale = await post(
      base,
      `/households/${base.householdId}/card-statements/${statement.id}/close`,
      { expectedVersion: statement.version + 5 },
    );
    expect(stale.statusCode).toBe(409);

    const closed = await post(
      base,
      `/households/${base.householdId}/card-statements/${statement.id}/close`,
      { expectedVersion: statement.version },
    );
    expect(closed.statusCode).toBe(200);
    expect(closed.json().status).toBe('CLOSED');
  });

  it('pagamento parcial deixa a fatura PARTIAL e não cria despesa', async () => {
    const base = await setup();
    const statement = await purchaseAndStatement(base);
    const closed = (
      await post(base, `/households/${base.householdId}/card-statements/${statement.id}/close`, {
        expectedVersion: statement.version,
      })
    ).json();

    const paid = await post(
      base,
      `/households/${base.householdId}/card-statements/${statement.id}/payments`,
      {
        amountMinor: 80_000,
        fromAccountId: base.checkingId,
        paidAt: '2026-08-15',
        memberId: base.memberId,
        idempotencyKey: key('pagamento'),
        expectedVersion: closed.version,
      },
    );

    expect(paid.statusCode).toBe(201);
    expect(paid.json().status).toBe('PARTIAL');
    expect(paid.json().outstandingMinor).toBe(120_000);
    expect(paid.json().paidPercent).toBe(40);

    // Saiu da conta e abateu a dívida do cartão.
    expect(await balance(base, base.checkingId)).toBe(1_000_000 - 80_000);
    expect(await balance(base, base.cardId)).toBe(200_000 - 80_000);

    // E NÃO virou despesa nova.
    const expenses = await get(base, `/households/${base.householdId}/transactions?type=EXPENSE`);
    expect(expenses.json().items).toHaveLength(0);
  });

  it('pagamento total deixa a fatura PAID e recusa novo pagamento', async () => {
    const base = await setup();
    const statement = await purchaseAndStatement(base);
    const closed = (
      await post(base, `/households/${base.householdId}/card-statements/${statement.id}/close`, {
        expectedVersion: statement.version,
      })
    ).json();

    const paid = (
      await post(base, `/households/${base.householdId}/card-statements/${statement.id}/payments`, {
        amountMinor: 200_000,
        fromAccountId: base.checkingId,
        paidAt: '2026-08-15',
        memberId: base.memberId,
        idempotencyKey: key('pagamento-total'),
        expectedVersion: closed.version,
      })
    ).json();
    expect(paid.status).toBe('PAID');
    expect(paid.outstandingMinor).toBe(0);

    const again = await post(
      base,
      `/households/${base.householdId}/card-statements/${statement.id}/payments`,
      {
        amountMinor: 1_000,
        fromAccountId: base.checkingId,
        paidAt: '2026-08-16',
        memberId: base.memberId,
        idempotencyKey: key('pagamento-extra'),
        expectedVersion: paid.version,
      },
    );
    expect(again.statusCode).toBe(409);
    expect(again.json().code).toBe('STATEMENT_ALREADY_PAID');
  });

  it('recusa pagamento maior que o saldo da fatura', async () => {
    const base = await setup();
    const statement = await purchaseAndStatement(base);
    const closed = (
      await post(base, `/households/${base.householdId}/card-statements/${statement.id}/close`, {
        expectedVersion: statement.version,
      })
    ).json();

    const response = await post(
      base,
      `/households/${base.householdId}/card-statements/${statement.id}/payments`,
      {
        amountMinor: 300_000,
        fromAccountId: base.checkingId,
        paidAt: '2026-08-15',
        memberId: base.memberId,
        idempotencyKey: key('pagamento-excesso'),
        expectedVersion: closed.version,
      },
    );
    expect(response.statusCode).toBe(422);
    expect(response.json().code).toBe('OUTSTANDING_AMOUNT_EXCEEDED');
  });

  it('a fatura não pode ser paga por outro cartão', async () => {
    const base = await setup();
    const statement = await purchaseAndStatement(base);
    const response = await post(
      base,
      `/households/${base.householdId}/card-statements/${statement.id}/payments`,
      {
        amountMinor: 1_000,
        fromAccountId: base.cardId,
        paidAt: '2026-08-15',
        memberId: base.memberId,
        idempotencyKey: key('pagamento-cartao'),
        expectedVersion: statement.version,
      },
    );
    expect(response.statusCode).toBe(422);
    expect(response.json().code).toBe('INVALID_ACCOUNT_TYPE');
  });

  it('estorno do pagamento reabre a fatura e devolve o saldo', async () => {
    const base = await setup();
    const statement = await purchaseAndStatement(base);
    const closed = (
      await post(base, `/households/${base.householdId}/card-statements/${statement.id}/close`, {
        expectedVersion: statement.version,
      })
    ).json();
    const paid = (
      await post(base, `/households/${base.householdId}/card-statements/${statement.id}/payments`, {
        amountMinor: 200_000,
        fromAccountId: base.checkingId,
        paidAt: '2026-08-15',
        memberId: base.memberId,
        idempotencyKey: key('pagamento-estorno'),
        expectedVersion: closed.version,
      })
    ).json();

    const reversed = await post(
      base,
      `/households/${base.householdId}/card-payments/${paid.payments[0].id}/reverse`,
      { reason: 'Pagamento não compensou', idempotencyKey: key('estorno-pagamento') },
    );

    expect(reversed.statusCode).toBe(201);
    expect(reversed.json().status).toBe('CLOSED');
    expect(reversed.json().outstandingMinor).toBe(200_000);
    expect(await balance(base, base.checkingId)).toBe(1_000_000);
  });
});

describe('reembolso', () => {
  it('abate a dívida do cartão e entra na fatura', async () => {
    const base = await setup();
    await post(base, `/households/${base.householdId}/card-purchases`, {
      accountId: base.cardId,
      description: 'Compra devolvida',
      amountMinor: 50_000,
      purchaseDate: '2026-08-05',
      memberId: base.memberId,
      installments: 1,
      idempotencyKey: key('compra-reembolso'),
    });

    const refund = await post(base, `/households/${base.householdId}/card-refunds`, {
      accountId: base.cardId,
      description: 'Estorno da loja',
      amountMinor: 50_000,
      occurredAt: '2026-08-07',
      memberId: base.memberId,
      idempotencyKey: key('reembolso'),
    });

    expect(refund.statusCode).toBe(201);
    expect(await balance(base, base.cardId)).toBe(0);

    const statements = await get(
      base,
      `/households/${base.householdId}/card-statements?accountId=${base.cardId}`,
    );
    expect(statements.json().items[0].totalMinor).toBe(0);
    expect(statements.json().items[0].items).toHaveLength(2);
  });
});

/**
 * Regressão do defeito encontrado no gate visual da 1b: havia três caminhos que
 * criam CARD_PURCHASE e só o endpoint dedicado anexava a compra a uma fatura.
 * Nos outros dois a dívida aparecia no saldo do cartão e a fatura ficava zerada
 * — a compra nunca era cobrada.
 */
describe('toda compra no cartão entra na fatura', () => {
  it('despesa lançada em conta de cartão vira item de fatura', async () => {
    const base = await setup();

    const expense = await post(base, `/households/${base.householdId}/expenses`, {
      description: 'Mercado',
      amountMinor: 89_010,
      accountId: base.cardId,
      memberId: base.memberId,
      occurredAt: '2026-08-05',
      competenceDate: '2026-08-05',
      idempotencyKey: key('despesa-cartao'),
    });
    expect(expense.statusCode).toBe(201);
    expect(expense.json().transactionType).toBe('CARD_PURCHASE');

    const statements = (
      await get(base, `/households/${base.householdId}/card-statements?accountId=${base.cardId}`)
    ).json();
    // Compra em 05/08 fecha no ciclo do dia 10/08 e vence em 15/08.
    expect(statements.items).toHaveLength(1);
    expect(statements.items[0].totalMinor).toBe(89_010);
    expect(statements.items[0].closingDate).toBe('2026-08-10');
    expect(statements.items[0].dueDate).toBe('2026-08-15');
    expect(await balance(base, base.cardId)).toBe(89_010);
  });

  it('baixa de conta prevista paga com cartão vira item de fatura', async () => {
    const base = await setup();

    const entry = (
      await post(base, `/households/${base.householdId}/planned-entries`, {
        nature: 'PAYABLE',
        description: 'Energia elétrica',
        originalAmountMinor: 31_240,
        competenceDate: '2026-08-08',
        dueDate: '2026-08-08',
        memberId: base.memberId,
        idempotencyKey: key('prevista-cartao'),
      })
    ).json().items[0];

    const settled = await post(
      base,
      `/households/${base.householdId}/planned-entries/${entry.id}/settlements`,
      {
        principalAmountMinor: 31_240,
        accountId: base.cardId,
        settledAt: '2026-08-08',
        idempotencyKey: key('baixa-cartao'),
        expectedVersion: entry.version,
      },
    );
    expect(settled.statusCode, settled.body).toBe(201);

    const statements = (
      await get(base, `/households/${base.householdId}/card-statements?accountId=${base.cardId}`)
    ).json();
    expect(statements.items).toHaveLength(1);
    expect(statements.items[0].totalMinor).toBe(31_240);
  });

  it('a fatura aberta aparece nos próximos compromissos do dashboard', async () => {
    const base = await setup();

    await post(base, `/households/${base.householdId}/expenses`, {
      description: 'Combustível',
      amountMinor: 90_000,
      accountId: base.cardId,
      memberId: base.memberId,
      occurredAt: '2026-08-05',
      competenceDate: '2026-08-05',
      idempotencyKey: key('despesa-dashboard'),
    });

    const dashboard = (
      await get(
        base,
        `/households/${base.householdId}/dashboard?mode=ACCRUAL&from=2026-08-01&to=2026-08-31`,
      )
    ).json();

    const fatura = dashboard.upcoming.find(
      (item: { kind: string }) => item.kind === 'CARD_STATEMENT',
    );
    // Formato exato de COMPONENT-SPECS §Linha de fatura.
    expect(fatura.description).toBe('Fatura · Cartão Azul •••• 4412');
    expect(fatura.meta).toBe('fecha 10/08 · vence 15/08');
    expect(fatura.amountMinor).toBe(90_000);
  });
});
