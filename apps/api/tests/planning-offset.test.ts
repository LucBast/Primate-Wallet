/**
 * Cancelamento em série, desfazer, e baixa por compensação (docs/04).
 *
 * O caso que originou a compensação: consertos no apartamento que eram
 * obrigação do proprietário, abatidos do aluguel. O que precisa ficar provado é
 * que o dinheiro NÃO é contado duas vezes — é o erro que um app de finanças não
 * pode cometer.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  adminQuery,
  closeAdminPool,
  createTestContext,
  registerUser,
  truncateAll,
  type TestContext,
  type TestUser,
} from './helpers.js';

let ctx: TestContext;
let ana: TestUser;
let householdId: string;
let contaId: string;
let memberId: string;

const auth = (user: TestUser) => ({ authorization: `Bearer ${user.accessToken}` });

beforeAll(async () => {
  ctx = await createTestContext();
});

afterAll(async () => {
  await ctx.close();
  await closeAdminPool();
});

beforeEach(async () => {
  await truncateAll();
  ana = await registerUser(ctx, 'ana@exemplo.com', 'Ana');

  const familia = (
    await ctx.app.inject({
      method: 'POST',
      url: '/households',
      headers: auth(ana),
      payload: { name: 'Família Souza', ownerDisplayName: 'Ana' },
    })
  ).json();
  householdId = familia.id;

  const membros = (
    await ctx.app.inject({
      method: 'GET',
      url: `/households/${householdId}/members`,
      headers: auth(ana),
    })
  ).json();
  memberId = membros.items[0].id;

  const conta = (
    await ctx.app.inject({
      method: 'POST',
      url: `/households/${householdId}/accounts`,
      headers: auth(ana),
      payload: { name: 'Conta Corrente', accountType: 'CHECKING', openingBalanceMinor: 500_000 },
    })
  ).json();
  contaId = conta.id;
});

/** Conta prevista de aluguel: R$ 2.000. */
async function aluguel(extra: Record<string, unknown> = {}) {
  const resposta = await ctx.app.inject({
    method: 'POST',
    url: `/households/${householdId}/planned-entries`,
    headers: auth(ana),
    payload: {
      nature: 'PAYABLE',
      description: 'Aluguel',
      originalAmountMinor: 200_000,
      competenceDate: '2026-08-01',
      dueDate: '2026-08-10',
      memberId,
      idempotencyKey: randomUUID(),
      ...extra,
    },
  });
  expect(resposta.statusCode, resposta.body).toBe(201);
  // `create` devolve a serie inteira; sem parcelamento, um item so.
  return resposta.json().items[0];
}

/** Despesa já registrada: o conserto que o proprietário mandou abater. */
async function conserto(valorMinor: number) {
  const resposta = await ctx.app.inject({
    method: 'POST',
    url: `/households/${householdId}/expenses`,
    headers: auth(ana),
    payload: {
      description: 'Conserto do chuveiro',
      amountMinor: valorMinor,
      occurredAt: '2026-08-05',
      competenceDate: '2026-08-05',
      accountId: contaId,
      memberId,
      idempotencyKey: randomUUID(),
    },
  });
  expect(resposta.statusCode, resposta.body).toBe(201);
  return resposta.json();
}

describe('baixa por compensação', () => {
  it('abate o aluguel com o conserto sem contar a despesa duas vezes', async () => {
    const entrada = await aluguel();
    const reparo = await conserto(50_000);

    const candidatos = await ctx.app.inject({
      method: 'GET',
      url: `/households/${householdId}/planned-entries/${entrada.id}/offset-candidates`,
      headers: auth(ana),
    });
    expect(candidatos.statusCode).toBe(200);
    expect(
      candidatos.json().items.map((i: { transactionId: string }) => i.transactionId),
    ).toContain(reparo.id);

    const compensada = await ctx.app.inject({
      method: 'POST',
      url: `/households/${householdId}/planned-entries/${entrada.id}/offset-settlements`,
      headers: auth(ana),
      payload: {
        transactionIds: [reparo.id],
        settledAt: '2026-08-10',
        idempotencyKey: randomUUID(),
        expectedVersion: entrada.version,
      },
    });
    expect(compensada.statusCode, compensada.body).toBe(201);
    const corpo = compensada.json();

    expect(corpo.offsetTotalMinor).toBe(50_000);
    expect(corpo.plannedEntry.outstandingMinor).toBe(150_000);
    expect(corpo.plannedEntry.status).toBe('PARTIAL');

    // O ponto central: NENHUMA movimentação nova. O dinheiro do conserto já
    // tinha saído; se aparecesse outra, a despesa contaria duas vezes.
    const movimentacoes = await adminQuery<{ n: string }>(
      'SELECT count(*)::text AS n FROM transactions WHERE household_id = $1',
      [householdId],
    );
    expect(movimentacoes[0]!.n).toBe('1');
  });

  it('a mesma movimentação não abate duas contas', async () => {
    const primeira = await aluguel();
    const segunda = await aluguel({ dueDate: '2026-09-10', competenceDate: '2026-09-01' });
    const reparo = await conserto(50_000);

    const usa = (entrada: { id: string; version: number }) =>
      ctx.app.inject({
        method: 'POST',
        url: `/households/${householdId}/planned-entries/${entrada.id}/offset-settlements`,
        headers: auth(ana),
        payload: {
          transactionIds: [reparo.id],
          settledAt: '2026-08-10',
          idempotencyKey: randomUUID(),
          expectedVersion: entrada.version,
        },
      });

    expect((await usa(primeira)).statusCode).toBe(201);
    const repetida = await usa(segunda);
    expect(repetida.statusCode).toBe(400);
  });

  it('recusa compensar acima do saldo em aberto', async () => {
    const entrada = await aluguel();
    const caro = await conserto(300_000);

    const resposta = await ctx.app.inject({
      method: 'POST',
      url: `/households/${householdId}/planned-entries/${entrada.id}/offset-settlements`,
      headers: auth(ana),
      payload: {
        transactionIds: [caro.id],
        settledAt: '2026-08-10',
        idempotencyKey: randomUUID(),
        expectedVersion: entrada.version,
      },
    });
    expect(resposta.statusCode, resposta.body).toBe(422);
    expect(resposta.json().code).toBe('OUTSTANDING_AMOUNT_EXCEEDED');
  });

  it('não oferece receita para abater conta a pagar', async () => {
    const entrada = await aluguel();

    await ctx.app.inject({
      method: 'POST',
      url: `/households/${householdId}/incomes`,
      headers: auth(ana),
      payload: {
        description: 'Salário',
        amountMinor: 500_000,
        occurredAt: '2026-08-05',
        competenceDate: '2026-08-05',
        accountId: contaId,
        memberId,
        idempotencyKey: randomUUID(),
      },
    });

    const candidatos = await ctx.app.inject({
      method: 'GET',
      url: `/households/${householdId}/planned-entries/${entrada.id}/offset-candidates`,
      headers: auth(ana),
    });
    expect(candidatos.json().items).toHaveLength(0);
  });
});

describe('cancelar em série e desfazer', () => {
  /** Cria a série de 3 parcelas e devolve as contas em ordem de vencimento. */
  async function parcelado() {
    await ctx.app.inject({
      method: 'POST',
      url: `/households/${householdId}/planned-entries`,
      headers: auth(ana),
      payload: {
        nature: 'PAYABLE',
        description: 'Sofá',
        originalAmountMinor: 300_000,
        competenceDate: '2026-08-01',
        dueDate: '2026-08-10',
        memberId,
        installments: 3,
        idempotencyKey: randomUUID(),
      },
    });
    const lista = await ctx.app.inject({
      method: 'GET',
      url: `/households/${householdId}/planned-entries?from=2026-08-01&to=2026-12-31`,
      headers: auth(ana),
    });
    return (lista.json().items as Array<{ id: string; version: number; dueDate: string }>).sort(
      (a, b) => a.dueDate.localeCompare(b.dueDate),
    );
  }

  it('cancela esta e as próximas, e desfazer devolve exatamente o mesmo lote', async () => {
    const parcelas = await parcelado();
    expect(parcelas).toHaveLength(3);

    const cancelada = await ctx.app.inject({
      method: 'POST',
      url: `/households/${householdId}/planned-entries/${parcelas[1]!.id}/cancel`,
      headers: auth(ana),
      payload: {
        reason: 'Devolvi o sofá',
        expectedVersion: parcelas[1]!.version,
        scope: 'THIS_AND_FUTURE',
      },
    });
    expect(cancelada.statusCode, cancelada.body).toBe(200);
    const corpo = cancelada.json();
    expect(corpo.canceledCount).toBe(2); // a 2ª e a 3ª; a 1ª fica de pé
    expect(corpo.batchId).toBeTruthy();

    const depois = await adminQuery<{ id: string; status: string }>(
      'SELECT id, status FROM planned_entries WHERE household_id = $1 ORDER BY due_date',
      [householdId],
    );
    expect(depois.map((d) => d.status)).toEqual(['OPEN', 'CANCELED', 'CANCELED']);

    const desfeito = await ctx.app.inject({
      method: 'POST',
      url: `/households/${householdId}/planned-entries/cancellations/${corpo.batchId}/undo`,
      headers: auth(ana),
    });
    expect(desfeito.statusCode, desfeito.body).toBe(200);
    expect(desfeito.json().restoredCount).toBe(2);

    const restaurado = await adminQuery<{ status: string }>(
      'SELECT status FROM planned_entries WHERE household_id = $1 ORDER BY due_date',
      [householdId],
    );
    expect(restaurado.map((d) => d.status)).toEqual(['OPEN', 'OPEN', 'OPEN']);
  });

  it('desfazer não mexe em cancelamento de outro lote', async () => {
    const parcelas = await parcelado();

    const primeiro = await ctx.app.inject({
      method: 'POST',
      url: `/households/${householdId}/planned-entries/${parcelas[0]!.id}/cancel`,
      headers: auth(ana),
      payload: { reason: 'Errei nesta', expectedVersion: parcelas[0]!.version },
    });
    const loteAntigo = primeiro.json().batchId;

    const segundo = await ctx.app.inject({
      method: 'POST',
      url: `/households/${householdId}/planned-entries/${parcelas[2]!.id}/cancel`,
      headers: auth(ana),
      payload: { reason: 'E nesta também', expectedVersion: parcelas[2]!.version },
    });

    await ctx.app.inject({
      method: 'POST',
      url: `/households/${householdId}/planned-entries/cancellations/${segundo.json().batchId}/undo`,
      headers: auth(ana),
    });

    // O primeiro cancelamento continua de pé: desfazer é por lote, não "solta
    // tudo que estiver cancelado".
    const estados = await adminQuery<{ status: string }>(
      'SELECT status FROM planned_entries WHERE household_id = $1 ORDER BY due_date',
      [householdId],
    );
    expect(estados.map((e) => e.status)).toEqual(['CANCELED', 'OPEN', 'OPEN']);
    expect(loteAntigo).toBeTruthy();
  });

  it('pula a parcela que já tem baixa, em vez de recusar o cancelamento inteiro', async () => {
    const parcelas = await parcelado();

    await ctx.app.inject({
      method: 'POST',
      url: `/households/${householdId}/planned-entries/${parcelas[2]!.id}/settlements`,
      headers: auth(ana),
      payload: {
        principalAmountMinor: 100_000,
        accountId: contaId,
        settledAt: '2026-10-10',
        idempotencyKey: randomUUID(),
        expectedVersion: parcelas[2]!.version,
      },
    });

    const cancelada = await ctx.app.inject({
      method: 'POST',
      url: `/households/${householdId}/planned-entries/${parcelas[0]!.id}/cancel`,
      headers: auth(ana),
      payload: {
        reason: 'Devolvi',
        expectedVersion: parcelas[0]!.version,
        scope: 'THIS_AND_FUTURE',
      },
    });
    expect(cancelada.statusCode, cancelada.body).toBe(200);
    expect(cancelada.json().canceledCount).toBe(2); // 1ª e 2ª
    expect(cancelada.json().skippedWithSettlements).toBe(1); // a 3ª, com baixa
  });
});
