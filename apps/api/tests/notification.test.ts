/**
 * Notificações, preferências e o ciclo do agendador (docs/12 §3, §4 e §5).
 *
 * O que precisa ficar provado, porque é onde o erro aparece na mão da pessoa:
 *  - rodar o ciclo duas vezes NÃO gera dois avisos do mesmo fato;
 *  - pagar a conta cancela o aviso, e cancelar não é apagar;
 *  - adiar o vencimento troca o aviso, em vez de acumular dois;
 *  - desligar a preferência para de gerar;
 *  - o aviso de aprovação vai para quem decide e nunca para quem pediu;
 *  - o aviso é correspondência pessoal: nem o Proprietário lê o do outro.
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

let contador = 0;
const chave = (prefixo: string): string =>
  `${prefixo}-notif-${(contador += 1).toString().padStart(8, '0')}`;

const auth = (user: TestUser) => ({ authorization: `Bearer ${user.accessToken}` });

/** Uma passada do agendador, pelas mesmas funções que a API chama. */
async function ciclo(): Promise<{ criados: number; cancelados: number }> {
  await adminQuery('SELECT app.notification_preferences_backfill()');
  const cancelados = await adminQuery<{ count: number }>(
    'SELECT app.notifications_cancel_resolved() AS count',
  );
  const criados = await adminQuery<{ count: number }>(
    'SELECT app.notifications_generate() AS count',
  );
  return { criados: criados[0]?.count ?? 0, cancelados: cancelados[0]?.count ?? 0 };
}

type Base = {
  ana: TestUser;
  householdId: string;
  contaId: string;
  membroId: string;
};

async function familia(): Promise<Base> {
  const ana = await registerUser(ctx, 'ana@exemplo.com', 'Ana');
  const headers = auth(ana);

  const casa = (
    await ctx.app.inject({
      method: 'POST',
      url: '/households',
      headers,
      payload: { name: 'Família Souza', ownerDisplayName: 'Ana' },
    })
  ).json();

  const membros = (
    await ctx.app.inject({ method: 'GET', url: `/households/${casa.id}/members`, headers })
  ).json().items as Array<{ id: string }>;

  const conta = (
    await ctx.app.inject({
      method: 'POST',
      url: `/households/${casa.id}/accounts`,
      headers,
      payload: { name: 'Conta Corrente', accountType: 'CHECKING', openingBalanceMinor: 500_00 },
    })
  ).json();

  return { ana, householdId: casa.id, contaId: conta.id, membroId: membros[0]?.id ?? '' };
}

/** Conta a pagar vencendo em `emDias` — dentro da janela padrão de 3 dias. */
async function contaPrevista(base: Base, emDias: number, descricao = 'Internet fibra') {
  const dia = new Date();
  dia.setUTCDate(dia.getUTCDate() + emDias);
  const due = dia.toISOString().slice(0, 10);

  const criada = await ctx.app.inject({
    method: 'POST',
    url: `/households/${base.householdId}/planned-entries`,
    headers: auth(base.ana),
    payload: {
      nature: 'PAYABLE',
      description: descricao,
      originalAmountMinor: 129_90,
      competenceDate: due,
      dueDate: due,
      expectedAccountId: base.contaId,
      memberId: base.membroId,
      idempotencyKey: chave('prevista'),
    },
  });
  expect(criada.statusCode, criada.body).toBe(201);
  return { entrada: criada.json().items[0] as { id: string; version: number }, due };
}

async function avisos(base: Base, user = base.ana) {
  const response = await ctx.app.inject({
    method: 'GET',
    url: `/households/${base.householdId}/notifications`,
    headers: auth(user),
  });
  expect(response.statusCode).toBe(200);
  return response.json() as {
    items: Array<{ id: string; kind: string; title: string; entityId: string | null }>;
    unreadCount: number;
  };
}

describe('geração de avisos', () => {
  it('gera o aviso de vencimento uma vez, por mais que o ciclo rode', async () => {
    const base = await familia();
    await contaPrevista(base, 2);

    const primeira = await ciclo();
    expect(primeira.criados).toBe(1);

    // A promessa do pacote: "evitar duplicidade" (docs/12 §5).
    const segunda = await ciclo();
    expect(segunda.criados).toBe(0);
    const terceira = await ciclo();
    expect(terceira.criados).toBe(0);

    const lista = await avisos(base);
    expect(lista.items).toHaveLength(1);
    expect(lista.items[0]?.kind).toBe('DUE_SOON');
    expect(lista.items[0]?.title).toContain('Internet fibra');
    expect(lista.unreadCount).toBe(1);
  });

  it('não avisa do que está fora da janela de antecedência', async () => {
    const base = await familia();
    // Padrão é 3 dias; dez dias à frente não deve gerar nada ainda.
    await contaPrevista(base, 10);
    expect((await ciclo()).criados).toBe(0);
    expect((await avisos(base)).items).toHaveLength(0);
  });

  it('conta já vencida vira OVERDUE, não DUE_SOON', async () => {
    const base = await familia();
    await contaPrevista(base, -4);
    await ciclo();

    const lista = await avisos(base);
    expect(lista.items[0]?.kind).toBe('OVERDUE');
    expect(lista.items[0]?.title).toContain('venceu há');
  });

  it('desligar a preferência para de gerar', async () => {
    const base = await familia();
    await contaPrevista(base, 2);

    const atuais = (
      await ctx.app.inject({
        method: 'GET',
        url: `/households/${base.householdId}/notification-preferences`,
        headers: auth(base.ana),
      })
    ).json();
    expect(atuais.dueEnabled).toBe(true);
    expect(atuais.dueDaysBefore).toBe(3);
    expect(atuais.dueHour).toBe(9);

    const desligada = await ctx.app.inject({
      method: 'PATCH',
      url: `/households/${base.householdId}/notification-preferences`,
      headers: auth(base.ana),
      payload: { dueEnabled: false, expectedVersion: atuais.version },
    });
    expect(desligada.statusCode).toBe(200);
    expect(desligada.json().dueEnabled).toBe(false);

    expect((await ciclo()).criados).toBe(0);
  });
});

describe('cancelamento (docs/12 §5)', () => {
  it('pagar a conta cancela o aviso — e cancelar não é apagar', async () => {
    const base = await familia();
    const { entrada } = await contaPrevista(base, 2);
    await ciclo();
    expect((await avisos(base)).items).toHaveLength(1);

    const baixa = await ctx.app.inject({
      method: 'POST',
      url: `/households/${base.householdId}/planned-entries/${entrada.id}/settlements`,
      headers: auth(base.ana),
      payload: {
        principalAmountMinor: 129_90,
        accountId: base.contaId,
        settledAt: new Date().toISOString().slice(0, 10),
        idempotencyKey: chave('baixa'),
        expectedVersion: entrada.version,
      },
    });
    expect(baixa.statusCode, baixa.body).toBe(201);

    const depois = await ciclo();
    expect(depois.cancelados).toBe(1);
    expect((await avisos(base)).items).toHaveLength(0);

    // A linha continua lá, com o motivo: a auditoria não perde a explicação.
    const linhas = await adminQuery<{ canceled_reason: string }>(
      'SELECT canceled_reason FROM notifications WHERE entity_id = $1',
      [entrada.id],
    );
    expect(linhas).toHaveLength(1);
    expect(linhas[0]?.canceled_reason).toBe('RESOLVED');
  });

  it('adiar o vencimento troca o aviso em vez de acumular dois', async () => {
    const base = await familia();
    const { entrada } = await contaPrevista(base, 1);
    await ciclo();
    const antes = await avisos(base);
    expect(antes.items).toHaveLength(1);

    // Adia para dentro da janela, para que o aviso novo também seja gerado.
    const novaData = new Date();
    novaData.setUTCDate(novaData.getUTCDate() + 3);
    const alterada = await ctx.app.inject({
      method: 'PATCH',
      url: `/households/${base.householdId}/planned-entries/${entrada.id}`,
      headers: auth(base.ana),
      payload: {
        dueDate: novaData.toISOString().slice(0, 10),
        expectedVersion: entrada.version,
      },
    });
    expect(alterada.statusCode, alterada.body).toBe(200);

    await ciclo();
    const depois = await avisos(base);
    // Um aviso, não dois: o da data velha caiu, o da nova entrou.
    expect(depois.items).toHaveLength(1);
    expect(depois.items[0]?.id).not.toBe(antes.items[0]?.id);
  });
});

describe('aprovação e privacidade', () => {
  it('o aviso vai para quem decide, e nunca para quem pediu', async () => {
    const base = await familia();
    const headers = auth(base.ana);

    const convite = await ctx.app.inject({
      method: 'POST',
      url: `/households/${base.householdId}/invitations`,
      headers,
      payload: {
        email: 'caio@exemplo.com',
        displayName: 'Caio',
        role: 'CHILD',
        isSupervised: true,
        approvalMode: 'ALWAYS',
      },
    });
    expect(convite.statusCode).toBe(201);
    const token = lastEmailLink(ctx.mailer);
    const caio = await registerUser(ctx, 'caio@exemplo.com', 'Caio');
    await ctx.app.inject({
      method: 'POST',
      url: '/invitations/accept',
      headers: auth(caio),
      payload: { token },
    });

    const membros = (
      await ctx.app.inject({
        method: 'GET',
        url: `/households/${base.householdId}/members`,
        headers,
      })
    ).json().items as Array<{ id: string; displayName: string }>;
    const caioId = membros.find((m) => m.displayName === 'Caio')?.id ?? '';

    await ctx.app.inject({
      method: 'PUT',
      url: `/households/${base.householdId}/members/${caioId}/account-permissions`,
      headers,
      payload: {
        permissions: [
          { accountId: base.contaId, canView: true, canTransact: true, canEdit: false },
        ],
      },
    });

    const pedido = await ctx.app.inject({
      method: 'POST',
      url: `/households/${base.householdId}/expenses`,
      headers: auth(caio),
      payload: {
        description: 'Jogo online',
        amountMinor: 89_90,
        accountId: base.contaId,
        memberId: caioId,
        idempotencyKey: chave('gasto'),
      },
    });
    expect(pedido.json().status).toBe('PENDING_APPROVAL');

    await ciclo();

    // Ana decide: recebe. Caio pediu: não recebe.
    const daAna = (await avisos(base)).items.filter((i) => i.kind === 'APPROVAL_REQUESTED');
    expect(daAna).toHaveLength(1);
    expect(daAna[0]?.title).toBe('Caio pediu aprovação');

    const doCaio = (await avisos(base, caio)).items.filter((i) => i.kind === 'APPROVAL_REQUESTED');
    expect(doCaio).toHaveLength(0);
  });

  it('aviso é correspondência pessoal: nem o Proprietário lê o do outro', async () => {
    const base = await familia();
    await contaPrevista(base, 2);
    await ciclo();

    const bruno = await registerUser(ctx, 'bruno@exemplo.com', 'Bruno');
    const convite = await ctx.app.inject({
      method: 'POST',
      url: `/households/${base.householdId}/invitations`,
      headers: auth(base.ana),
      payload: { email: 'bruno@exemplo.com', displayName: 'Bruno', role: 'ADULT' },
    });
    expect(convite.statusCode).toBe(201);
    await ctx.app.inject({
      method: 'POST',
      url: '/invitations/accept',
      headers: auth(bruno),
      payload: { token: lastEmailLink(ctx.mailer) },
    });

    // Bruno entrou depois da geração: vê os avisos DELE, que ainda não existem.
    expect((await avisos(base, bruno)).items).toHaveLength(0);
    // E a Ana continua vendo o dela.
    expect((await avisos(base)).items).toHaveLength(1);
  });
});

describe('leitura', () => {
  it('marcar como lida zera a contagem; dispensar tira da central', async () => {
    const base = await familia();
    await contaPrevista(base, 2, 'Água');
    await contaPrevista(base, 1, 'Energia');
    await ciclo();

    const lista = await avisos(base);
    expect(lista.unreadCount).toBe(2);

    const lida = await ctx.app.inject({
      method: 'POST',
      url: `/households/${base.householdId}/notifications/${lista.items[0]?.id}/read`,
      headers: auth(base.ana),
    });
    expect(lida.statusCode).toBe(204);
    expect((await avisos(base)).unreadCount).toBe(1);

    const dispensada = await ctx.app.inject({
      method: 'POST',
      url: `/households/${base.householdId}/notifications/${lista.items[1]?.id}/dismiss`,
      headers: auth(base.ana),
    });
    expect(dispensada.statusCode).toBe(204);

    const depois = await avisos(base);
    expect(depois.items).toHaveLength(1);
    expect(depois.unreadCount).toBe(0);
  });
});
