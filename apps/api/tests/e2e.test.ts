/**
 * Fase 11 — E2E dos 15 fluxos críticos (docs/13 §5).
 *
 * É um teste só, narrativo, na ordem em que uma família de verdade usaria o
 * app: criar conta, criar família, cadastrar conta e cartão, criar uma conta a
 * pagar, dar baixa parcial, completar, comprar parcelado, fechar a fatura,
 * pagar em duas vezes, lançar pelo atalho, reenviar um comando como o outbox
 * faria, pedir e aprovar um gasto de filho e exportar o relatório.
 *
 * Quebrar em quinze testes independentes esconderia justamente o que este
 * arquivo existe para provar: que os estados se encadeiam. Um saldo errado no
 * passo 6 só aparece como fatura errada no 11.
 *
 * O saldo é conferido a cada passo, em centavos, contra o valor esperado
 * calculado à mão — nenhuma asserção usa a mesma fórmula do servidor.
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

let contador = 0;
const chave = (prefixo: string): string =>
  `${prefixo}-e2e-${(contador += 1).toString().padStart(8, '0')}`;

const auth = (user: TestUser) => ({ authorization: `Bearer ${user.accessToken}` });

async function post(user: TestUser, url: string, payload: unknown) {
  return ctx.app.inject({ method: 'POST', url, headers: auth(user), payload });
}
async function get(user: TestUser, url: string) {
  return ctx.app.inject({ method: 'GET', url, headers: auth(user) });
}

/** Falha com o corpo da resposta, senão o diagnóstico vira adivinhação. */
function ok(response: { statusCode: number; body: string }, esperado: number, passo: string): void {
  expect(response.statusCode, `${passo}: ${response.body}`).toBe(esperado);
}

describe('E2E — os 15 fluxos críticos de docs/13 §5', () => {
  it('percorre da criação da conta à exportação, com o saldo batendo em cada passo', async () => {
    // ---------------------------------------------------------------- 1 e 2
    const ana = await registerUser(ctx, 'ana@exemplo.com', 'Ana');

    const casa = await post(ana, '/households', {
      name: 'Família Souza',
      ownerDisplayName: 'Ana',
    });
    ok(casa, 201, 'criar família');
    const hh = casa.json().id as string;
    const rota = (sufixo: string): string => `/households/${hh}${sufixo}`;

    const membros = (await get(ana, rota('/members'))).json().items as Array<{
      id: string;
      displayName: string;
      version: number;
    }>;
    const anaId = membros[0]?.id ?? '';

    // ------------------------------------------------------------------- 3
    const conta = await post(ana, rota('/accounts'), {
      name: 'Conta Corrente',
      accountType: 'CHECKING',
      openingBalanceMinor: 1_000_00,
      primaryMemberId: anaId,
    });
    ok(conta, 201, 'cadastrar conta');
    const contaId = conta.json().id as string;

    const saldo = async (id = contaId): Promise<number> =>
      (await get(ana, rota(`/accounts/${id}`))).json().balanceMinor as number;

    expect(await saldo()).toBe(1_000_00);

    // ------------------------------------------------------------------- 4
    const cartao = await post(ana, rota('/accounts'), {
      name: 'Cartão Azul',
      accountType: 'CREDIT_CARD',
      cardBrand: 'Visa',
      cardLastFour: '4412',
      creditLimitMinor: 5_000_00,
      closingDay: 10,
      dueDay: 15,
      primaryMemberId: anaId,
      defaultPaymentAccountId: contaId,
    });
    ok(cartao, 201, 'cadastrar cartão');
    const cartaoId = cartao.json().id as string;

    const categorias = (await get(ana, rota('/categories'))).json().items as Array<{
      id: string;
      name: string;
      nature: string;
    }>;
    const categoriaDespesa = categorias.find((c) => c.nature === 'EXPENSE')?.id ?? '';

    // ------------------------------------------------------------------- 5
    const prevista = await post(ana, rota('/planned-entries'), {
      nature: 'PAYABLE',
      description: 'Energia elétrica',
      originalAmountMinor: 100_00,
      competenceDate: '2026-08-01',
      dueDate: '2026-08-08',
      expectedAccountId: contaId,
      memberId: anaId,
      categoryId: categoriaDespesa,
      idempotencyKey: chave('prevista'),
    });
    ok(prevista, 201, 'criar conta a pagar');
    const entrada = prevista.json().items[0] as { id: string; version: number };
    expect(prevista.json().items[0].outstandingMinor).toBe(100_00);

    // ------------------------------------------------------------------- 6
    const parcial = await post(ana, rota(`/planned-entries/${entrada.id}/settlements`), {
      principalAmountMinor: 40_00,
      accountId: contaId,
      settledAt: '2026-08-08',
      idempotencyKey: chave('baixa-parcial'),
      expectedVersion: entrada.version,
    });
    ok(parcial, 201, 'baixa parcial');
    expect(parcial.json().plannedEntry.status).toBe('PARTIAL');
    expect(parcial.json().plannedEntry.outstandingMinor).toBe(60_00);
    // Baixa parcial sai da conta: 1.000,00 − 40,00.
    expect(await saldo()).toBe(960_00);

    // ------------------------------------------------------------------- 7
    const completa = await post(ana, rota(`/planned-entries/${entrada.id}/settlements`), {
      principalAmountMinor: 60_00,
      accountId: contaId,
      settledAt: '2026-08-09',
      idempotencyKey: chave('baixa-final'),
      expectedVersion: parcial.json().plannedEntry.version,
    });
    ok(completa, 201, 'completar baixa');
    expect(completa.json().plannedEntry.status).toBe('SETTLED');
    expect(completa.json().plannedEntry.outstandingMinor).toBe(0);
    expect(await saldo()).toBe(900_00);

    // ------------------------------------------------------------------- 8
    const compra = await post(ana, rota('/card-purchases'), {
      accountId: cartaoId,
      description: 'Curso de inglês',
      amountMinor: 1_000_00,
      installments: 3,
      purchaseDate: '2026-08-05',
      memberId: anaId,
      categoryId: categoriaDespesa,
      idempotencyKey: chave('parcelada'),
    });
    ok(compra, 201, 'compra parcelada');
    const parcelas = compra.json().installments as Array<{
      amountMinor: number;
      carriesRounding: boolean;
    }>;
    expect(parcelas).toHaveLength(3);
    // Centavos na ÚLTIMA parcela: 333,33 + 333,33 + 333,34 = 1.000,00 exatos.
    expect(parcelas.map((p) => p.amountMinor)).toEqual([333_33, 333_33, 333_34]);
    expect(parcelas.reduce((soma, p) => soma + p.amountMinor, 0)).toBe(1_000_00);
    expect(parcelas[2]?.carriesRounding).toBe(true);

    // A compra no cartão NÃO tira dinheiro da conta bancária.
    expect(await saldo()).toBe(900_00);

    // ------------------------------------------------------------------- 9
    const faturas = (await get(ana, rota(`/card-statements?accountId=${cartaoId}`))).json()
      .items as Array<{ id: string; version: number; totalMinor: number; status: string }>;
    const primeira = faturas.find((f) => f.totalMinor === 333_33);
    expect(primeira, 'a primeira parcela precisa estar em alguma fatura').toBeDefined();

    const fechada = await post(ana, rota(`/card-statements/${primeira?.id}/close`), {
      expectedVersion: primeira?.version,
    });
    ok(fechada, 200, 'fechar fatura');
    expect(fechada.json().status).toBe('CLOSED');

    // ------------------------------------------------------------------ 10
    const pagamento1 = await post(ana, rota(`/card-statements/${primeira?.id}/payments`), {
      amountMinor: 100_00,
      fromAccountId: contaId,
      paidAt: '2026-08-15',
      memberId: anaId,
      idempotencyKey: chave('pag-1'),
      expectedVersion: fechada.json().version,
    });
    ok(pagamento1, 201, 'pagar fatura parcialmente');
    expect(pagamento1.json().status).toBe('PARTIAL');
    // Pagamento de fatura sai da conta — e NÃO é uma despesa nova.
    expect(await saldo()).toBe(800_00);

    // ------------------------------------------------------------------ 11
    const pagamento2 = await post(ana, rota(`/card-statements/${primeira?.id}/payments`), {
      amountMinor: 233_33,
      fromAccountId: contaId,
      paidAt: '2026-08-16',
      memberId: anaId,
      idempotencyKey: chave('pag-2'),
      expectedVersion: pagamento1.json().version,
    });
    ok(pagamento2, 201, 'completar pagamento da fatura');
    expect(pagamento2.json().status).toBe('PAID');
    expect(pagamento2.json().outstandingMinor).toBe(0);
    expect(await saldo()).toBe(566_67);

    // ------------------------------------------------------------------ 12
    const atalho = await post(ana, rota('/expenses'), {
      description: 'Padaria',
      amountMinor: 20_00,
      accountId: contaId,
      memberId: anaId,
      categoryId: categoriaDespesa,
      source: 'SHORTCUT',
      idempotencyKey: chave('atalho'),
    });
    ok(atalho, 201, 'despesa pelo atalho');
    expect(atalho.json().source).toBe('SHORTCUT');
    expect(await saldo()).toBe(546_67);

    // ------------------------------------------------------------------ 13
    // "Operar offline e sincronizar": do lado do servidor, sincronizar é
    // reenviar o MESMO comando com a MESMA chave — que é exatamente o que o
    // outbox faz quando não sabe se o primeiro envio chegou. Tem de devolver a
    // MESMA movimentação e não mexer no saldo de novo.
    const chaveDoOutbox = chave('outbox');
    const corpoOffline = {
      description: 'Feira',
      amountMinor: 35_00,
      accountId: contaId,
      memberId: anaId,
      categoryId: categoriaDespesa,
      source: 'BOTTOM_ACTION' as const,
      idempotencyKey: chaveDoOutbox,
    };

    const primeiroEnvio = await post(ana, rota('/expenses'), corpoOffline);
    ok(primeiroEnvio, 201, 'primeiro envio do item de outbox');
    const saldoDepoisDoEnvio = await saldo();
    expect(saldoDepoisDoEnvio).toBe(546_67 - 35_00);

    const reenvio = await post(ana, rota('/expenses'), corpoOffline);
    ok(reenvio, 201, 'reenvio do item de outbox');
    expect(reenvio.json().id).toBe(primeiroEnvio.json().id);
    expect(await saldo()).toBe(saldoDepoisDoEnvio);

    // ------------------------------------------------------------------ 14
    const convite = await post(ana, rota('/invitations'), {
      email: 'caio@exemplo.com',
      displayName: 'Caio',
      role: 'CHILD',
      isSupervised: true,
      approvalMode: 'ABOVE_THRESHOLD',
      approvalThresholdMinor: 50_00,
    });
    ok(convite, 201, 'convidar filho');
    const token = lastEmailLink(ctx.mailer);
    const caio = await registerUser(ctx, 'caio@exemplo.com', 'Caio');
    ok(await post(caio, '/invitations/accept', { token }), 200, 'aceitar convite');

    const comCaio = (await get(ana, rota('/members'))).json().items as Array<{
      id: string;
      displayName: string;
    }>;
    const caioId = comCaio.find((m) => m.displayName === 'Caio')?.id ?? '';

    ok(
      await ctx.app.inject({
        method: 'PUT',
        url: rota(`/members/${caioId}/account-permissions`),
        headers: auth(ana),
        payload: {
          permissions: [{ accountId: contaId, canView: true, canTransact: true, canEdit: false }],
        },
      }),
      200,
      'autorizar a conta do filho',
    );

    const saldoAntesDoPedido = await saldo();
    const pedido = await post(caio, rota('/expenses'), {
      description: 'Jogo online',
      amountMinor: 89_90,
      accountId: contaId,
      memberId: caioId,
      categoryId: categoriaDespesa,
      source: 'BOTTOM_ACTION',
      idempotencyKey: chave('gasto-filho'),
    });
    ok(pedido, 201, 'gasto do filho acima do limite');
    expect(pedido.json().status).toBe('PENDING_APPROVAL');
    // Pendente NÃO afeta saldo (docs/04 §16).
    expect(await saldo()).toBe(saldoAntesDoPedido);

    const pendencias = (await get(ana, rota('/approvals?status=PENDING'))).json() as {
      pendingCount: number;
      items: Array<{ id: string; version: number }>;
    };
    expect(pendencias.pendingCount).toBe(1);

    const aprovado = await post(ana, rota(`/approvals/${pendencias.items[0]?.id}/approve`), {
      expectedVersion: pendencias.items[0]?.version,
    });
    ok(aprovado, 200, 'aprovar gasto do filho');
    expect(aprovado.json().transaction.status).toBe('POSTED');
    expect(await saldo()).toBe(saldoAntesDoPedido - 89_90);

    // ------------------------------------------------------------------ 15
    const exportacao = await post(ana, rota('/reports/export'), {
      format: 'CSV',
      mode: 'ACCRUAL',
      from: '2026-08-01',
      to: '2026-08-31',
      content: 'TRANSACTIONS',
    });
    ok(exportacao, 200, 'exportar relatório');
    const csv = exportacao.json().content as string;
    expect(csv.split('\n').length).toBeGreaterThan(1);
    expect(csv).toContain('Padaria');
    expect(csv).toContain('Jogo online');
    // Exportação é evento de auditoria (docs/13 §5, item 15).
    const auditoria = (await get(ana, rota('/audit'))).json().items as Array<{ action: string }>;
    expect(auditoria.some((linha) => linha.action.includes('EXPORT'))).toBe(true);
  });
});
