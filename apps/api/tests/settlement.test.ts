/**
 * Fase 5 — Baixas.
 *
 * Cobre os casos financeiros obrigatórios de docs/13 §2: baixa parcial, baixa
 * completa após parcial, excesso, concorrência, idempotência e estorno que
 * reabre a conta prevista.
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
  accountId: string;
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

  const account = (
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

  return {
    owner,
    householdId: household.id,
    memberId: members.items[0].id,
    accountId: account.id,
  };
}

/** Cria uma conta a pagar de R$ 1.000,00. */
async function payable(base: Base, amountMinor = 100_000) {
  const created = await ctx.app.inject({
    method: 'POST',
    url: `/households/${base.householdId}/planned-entries`,
    headers: headers(base.owner),
    payload: {
      nature: 'PAYABLE',
      description: 'Energia elétrica',
      originalAmountMinor: amountMinor,
      competenceDate: '2026-08-01',
      dueDate: '2026-08-08',
      expectedAccountId: base.accountId,
      memberId: base.memberId,
      idempotencyKey: key('prevista'),
    },
  });
  return created.json().items[0];
}

function settle(base: Base, entryId: string, payload: Record<string, unknown>) {
  return ctx.app.inject({
    method: 'POST',
    url: `/households/${base.householdId}/planned-entries/${entryId}/settlements`,
    headers: headers(base.owner),
    payload,
  });
}

async function balance(base: Base): Promise<number> {
  const response = await ctx.app.inject({
    method: 'GET',
    url: `/households/${base.householdId}/accounts/${base.accountId}`,
    headers: headers(base.owner),
  });
  return response.json().balanceMinor;
}

describe('baixa parcial (docs/13 §2)', () => {
  it('preserva o saldo em aberto e deixa o status PARTIAL', async () => {
    const base = await setup();
    const entry = await payable(base);

    const response = await settle(base, entry.id, {
      principalAmountMinor: 44_000,
      accountId: base.accountId,
      settledAt: '2026-08-08',
      idempotencyKey: key('baixa'),
      expectedVersion: entry.version,
    });

    expect(response.statusCode).toBe(201);
    const { plannedEntry, settlement } = response.json();
    expect(plannedEntry.status).toBe('PARTIAL');
    expect(plannedEntry.outstandingMinor).toBe(56_000);
    expect(plannedEntry.settledMinor).toBe(44_000);
    expect(plannedEntry.settledPercent).toBe(44);
    expect(settlement.netAmountMinor).toBe(44_000);
    expect(await balance(base)).toBe(1_000_000 - 44_000);
  });

  it('juros, multa e desconto entram separados e mudam só o que sai da conta', async () => {
    const base = await setup();
    const entry = await payable(base);

    const response = await settle(base, entry.id, {
      principalAmountMinor: 50_000,
      interestAmountMinor: 1_500,
      penaltyAmountMinor: 2_000,
      discountAmountMinor: 500,
      accountId: base.accountId,
      settledAt: '2026-08-10',
      idempotencyKey: key('baixa-encargos'),
      expectedVersion: entry.version,
    });

    const { plannedEntry, settlement } = response.json();
    // O principal quitado é 50.000; encargos não reduzem o saldo em aberto.
    expect(plannedEntry.outstandingMinor).toBe(50_000);
    expect(settlement.netAmountMinor).toBe(53_000);
    expect(await balance(base)).toBe(1_000_000 - 53_000);
  });

  it('recusa desconto maior que o valor da baixa', async () => {
    const base = await setup();
    const entry = await payable(base);
    const response = await settle(base, entry.id, {
      principalAmountMinor: 1_000,
      discountAmountMinor: 5_000,
      accountId: base.accountId,
      settledAt: '2026-08-08',
      idempotencyKey: key('desconto-grande'),
      expectedVersion: entry.version,
    });
    expect(response.statusCode).toBe(400);
  });
});

describe('baixa completa após parcial', () => {
  it('quita a conta e deixa o status SETTLED', async () => {
    const base = await setup();
    const entry = await payable(base);

    const first = await settle(base, entry.id, {
      principalAmountMinor: 44_000,
      accountId: base.accountId,
      settledAt: '2026-08-08',
      idempotencyKey: key('parcial'),
      expectedVersion: entry.version,
    });
    const afterFirst = first.json().plannedEntry;

    const second = await settle(base, entry.id, {
      principalAmountMinor: 56_000,
      accountId: base.accountId,
      settledAt: '2026-08-20',
      idempotencyKey: key('restante'),
      expectedVersion: afterFirst.version,
    });

    expect(second.statusCode).toBe(201);
    expect(second.json().plannedEntry.status).toBe('SETTLED');
    expect(second.json().plannedEntry.outstandingMinor).toBe(0);
    expect(second.json().plannedEntry.settledPercent).toBe(100);
    expect(await balance(base)).toBe(1_000_000 - 100_000);
  });

  it('não aceita nova baixa depois de quitada', async () => {
    const base = await setup();
    const entry = await payable(base);
    const settled = (
      await settle(base, entry.id, {
        principalAmountMinor: 100_000,
        accountId: base.accountId,
        settledAt: '2026-08-08',
        idempotencyKey: key('total'),
        expectedVersion: entry.version,
      })
    ).json().plannedEntry;

    const extra = await settle(base, entry.id, {
      principalAmountMinor: 1_000,
      accountId: base.accountId,
      settledAt: '2026-08-09',
      idempotencyKey: key('extra'),
      expectedVersion: settled.version,
    });
    expect(extra.statusCode).toBe(409);
    expect(extra.json().code).toBe('ALREADY_SETTLED');
  });
});

describe('excesso (docs/13 §2)', () => {
  it('recusa principal maior que o saldo em aberto', async () => {
    const base = await setup();
    const entry = await payable(base);

    const response = await settle(base, entry.id, {
      principalAmountMinor: 150_000,
      accountId: base.accountId,
      settledAt: '2026-08-08',
      idempotencyKey: key('excesso'),
      expectedVersion: entry.version,
    });

    expect(response.statusCode).toBe(422);
    expect(response.json().code).toBe('OUTSTANDING_AMOUNT_EXCEEDED');
    expect(response.json().details.outstandingMinor).toBe(100_000);
    expect(await balance(base)).toBe(1_000_000);
  });

  it('recusa excesso também depois de uma baixa parcial', async () => {
    const base = await setup();
    const entry = await payable(base);
    const afterPartial = (
      await settle(base, entry.id, {
        principalAmountMinor: 60_000,
        accountId: base.accountId,
        settledAt: '2026-08-08',
        idempotencyKey: key('parcial-antes'),
        expectedVersion: entry.version,
      })
    ).json().plannedEntry;

    const response = await settle(base, entry.id, {
      principalAmountMinor: 50_000,
      accountId: base.accountId,
      settledAt: '2026-08-09',
      idempotencyKey: key('excesso-depois'),
      expectedVersion: afterPartial.version,
    });
    expect(response.statusCode).toBe(422);
    expect(response.json().details.outstandingMinor).toBe(40_000);
  });
});

describe('concorrência (docs/13 §2)', () => {
  it('duas baixas simultâneas do saldo inteiro: só uma passa', async () => {
    const base = await setup();
    const entry = await payable(base);

    const [first, second] = await Promise.all([
      settle(base, entry.id, {
        principalAmountMinor: 100_000,
        accountId: base.accountId,
        settledAt: '2026-08-08',
        idempotencyKey: key('corrida-a'),
        expectedVersion: entry.version,
      }),
      settle(base, entry.id, {
        principalAmountMinor: 100_000,
        accountId: base.accountId,
        settledAt: '2026-08-08',
        idempotencyKey: key('corrida-b'),
        expectedVersion: entry.version,
      }),
    ]);

    const codes = [first.statusCode, second.statusCode].sort();
    expect(codes[0]).toBe(201);
    expect(codes[1]).toBeGreaterThanOrEqual(400);
    // O saldo saiu uma vez só.
    expect(await balance(base)).toBe(1_000_000 - 100_000);

    const entries = await ctx.app.inject({
      method: 'GET',
      url: `/households/${base.householdId}/planned-entries/${entry.id}`,
      headers: headers(base.owner),
    });
    expect(entries.json().outstandingMinor).toBe(0);
  });

  it('versão desatualizada recebe VERSION_CONFLICT', async () => {
    const base = await setup();
    const entry = await payable(base);

    await settle(base, entry.id, {
      principalAmountMinor: 10_000,
      accountId: base.accountId,
      settledAt: '2026-08-08',
      idempotencyKey: key('primeira'),
      expectedVersion: entry.version,
    });

    const stale = await settle(base, entry.id, {
      principalAmountMinor: 10_000,
      accountId: base.accountId,
      settledAt: '2026-08-08',
      idempotencyKey: key('desatualizada'),
      expectedVersion: entry.version,
    });
    expect(stale.statusCode).toBe(409);
    expect(stale.json().code).toBe('VERSION_CONFLICT');
  });
});

describe('idempotência (docs/13 §2)', () => {
  it('a mesma chave devolve a MESMA baixa e não duplica o efeito', async () => {
    const base = await setup();
    const entry = await payable(base);
    const payload = {
      principalAmountMinor: 30_000,
      accountId: base.accountId,
      settledAt: '2026-08-08',
      idempotencyKey: 'baixa-repetida-000001',
      expectedVersion: entry.version,
    };

    const first = await settle(base, entry.id, payload);
    const second = await settle(base, entry.id, payload);

    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(201);
    expect(second.json().settlement.id).toBe(first.json().settlement.id);
    expect(await balance(base)).toBe(1_000_000 - 30_000);
  });
});

describe('estorno de baixa', () => {
  it('reabre a conta prevista e devolve o saldo', async () => {
    const base = await setup();
    const entry = await payable(base);
    const settled = (
      await settle(base, entry.id, {
        principalAmountMinor: 100_000,
        accountId: base.accountId,
        settledAt: '2026-08-08',
        idempotencyKey: key('para-estornar'),
        expectedVersion: entry.version,
      })
    ).json();
    expect(settled.plannedEntry.status).toBe('SETTLED');

    const reversed = await ctx.app.inject({
      method: 'POST',
      url: `/households/${base.householdId}/settlements/${settled.settlement.id}/reverse`,
      headers: headers(base.owner),
      payload: { reason: 'Pagamento não compensou', idempotencyKey: key('estorno-baixa') },
    });

    expect(reversed.statusCode).toBe(201);
    expect(reversed.json().plannedEntry.status).toBe('OPEN');
    expect(reversed.json().plannedEntry.outstandingMinor).toBe(100_000);
    expect(reversed.json().settlement.reversedAt).not.toBeNull();
    expect(reversed.json().settlement.reversalReason).toBe('Pagamento não compensou');
    expect(await balance(base)).toBe(1_000_000);
  });

  it('estorno de uma baixa parcial volta o status para OPEN quando era a única', async () => {
    const base = await setup();
    const entry = await payable(base);
    const first = (
      await settle(base, entry.id, {
        principalAmountMinor: 40_000,
        accountId: base.accountId,
        settledAt: '2026-08-08',
        idempotencyKey: key('parcial-estorno'),
        expectedVersion: entry.version,
      })
    ).json();

    const reversed = await ctx.app.inject({
      method: 'POST',
      url: `/households/${base.householdId}/settlements/${first.settlement.id}/reverse`,
      headers: headers(base.owner),
      payload: { reason: 'Erro de digitação', idempotencyKey: key('estorno-parcial') },
    });
    expect(reversed.json().plannedEntry.status).toBe('OPEN');
    expect(reversed.json().plannedEntry.settledMinor).toBe(0);
  });

  it('bloqueia estorno duplicado da mesma baixa', async () => {
    const base = await setup();
    const entry = await payable(base);
    const settled = (
      await settle(base, entry.id, {
        principalAmountMinor: 20_000,
        accountId: base.accountId,
        settledAt: '2026-08-08',
        idempotencyKey: key('duplo'),
        expectedVersion: entry.version,
      })
    ).json();

    const first = await ctx.app.inject({
      method: 'POST',
      url: `/households/${base.householdId}/settlements/${settled.settlement.id}/reverse`,
      headers: headers(base.owner),
      payload: { reason: 'Erro', idempotencyKey: key('estorno-1') },
    });
    const second = await ctx.app.inject({
      method: 'POST',
      url: `/households/${base.householdId}/settlements/${settled.settlement.id}/reverse`,
      headers: headers(base.owner),
      payload: { reason: 'Erro de novo', idempotencyKey: key('estorno-2') },
    });

    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(409);
    expect(second.json().code).toBe('TRANSACTION_ALREADY_REVERSED');
  });
});

describe('histórico de baixas (tela 1e)', () => {
  it('lista as baixas com autor, conta e data', async () => {
    const base = await setup();
    const entry = await payable(base);
    await settle(base, entry.id, {
      principalAmountMinor: 40_000,
      accountId: base.accountId,
      settledAt: '2026-08-08',
      idempotencyKey: key('hist-a'),
      expectedVersion: entry.version,
    });

    const history = await ctx.app.inject({
      method: 'GET',
      url: `/households/${base.householdId}/planned-entries/${entry.id}/settlements`,
      headers: headers(base.owner),
    });

    expect(history.statusCode).toBe(200);
    expect(history.json().items).toHaveLength(1);
    expect(history.json().items[0]).toMatchObject({
      principalAmountMinor: 40_000,
      accountName: 'Conta Corrente',
      createdByName: 'Ana',
      settledAt: '2026-08-08',
    });
  });
});
