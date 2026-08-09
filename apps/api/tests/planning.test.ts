/**
 * Fase 3 — planejamento: contas a pagar/receber, parcelamento, recorrência,
 * lembretes, cancelamento e anexos.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
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
  categoryId: string;
};

async function setup(): Promise<Base> {
  const owner = await registerUser(ctx, 'ana@exemplo.com', 'Ana');
  const auth = { authorization: `Bearer ${owner.accessToken}` };

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
      payload: { name: 'Conta Corrente', accountType: 'CHECKING', openingBalanceMinor: 500_000 },
    })
  ).json();

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
    accountId: account.id,
    categoryId: categories.items.find((c: { name: string }) => c.name === 'Moradia').id,
  };
}

function post(base: Base, url: string, payload: unknown) {
  return ctx.app.inject({
    method: 'POST',
    url,
    headers: { authorization: `Bearer ${base.owner.accessToken}` },
    payload,
  });
}

function get(base: Base, url: string) {
  return ctx.app.inject({
    method: 'GET',
    url,
    headers: { authorization: `Bearer ${base.owner.accessToken}` },
  });
}

let keyCounter = 0;
/** A chave de idempotência exige 16+ caracteres (contrato do doc 09). */
const key = (prefix: string): string =>
  `${prefix}-teste-${(keyCounter += 1).toString().padStart(8, '0')}`;

/**
 * Datas relativas a hoje, não fixas no calendário.
 *
 * A conta a pagar deste arquivo vencia em 2026-08-08. No dia 2026-08-09 o teste
 * quebrou sozinho, sem nenhuma mudança no produto: "vencido" é DERIVADO da data
 * de hoje no fuso da família (docs/04 §7), então uma data fixa vira uma bomba de
 * relógio. Três dias à frente mantém a conta em aberto em qualquer fuso.
 */
function isoDay(offsetDays: number): string {
  const day = new Date();
  day.setUTCDate(day.getUTCDate() + offsetDays);
  return day.toISOString().slice(0, 10);
}

const DUE_DATE = isoDay(3);
const MONTH_FROM = `${DUE_DATE.slice(0, 7)}-01`;
/** Último dia do mês do vencimento: dia 0 do mês seguinte. */
const MONTH_TO = (() => {
  const [year, month] = DUE_DATE.split('-').map(Number);
  return new Date(Date.UTC(year ?? 0, month ?? 1, 0)).toISOString().slice(0, 10);
})();

function payable(base: Base, overrides: Record<string, unknown> = {}) {
  return {
    nature: 'PAYABLE',
    description: 'Energia elétrica',
    originalAmountMinor: 31_240,
    competenceDate: MONTH_FROM,
    dueDate: DUE_DATE,
    expectedAccountId: base.accountId,
    memberId: base.memberId,
    categoryId: base.categoryId,
    idempotencyKey: key('planned'),
    ...overrides,
  };
}

describe('conta a pagar', () => {
  it('cria e aparece no mês com saldo em aberto igual ao valor', async () => {
    const base = await setup();
    const created = await post(
      base,
      `/households/${base.householdId}/planned-entries`,
      payable(base),
    );

    expect(created.statusCode).toBe(201);
    const entry = created.json().items[0];
    expect(entry).toMatchObject({
      status: 'OPEN',
      outstandingMinor: 31_240,
      settledMinor: 0,
      settledPercent: 0,
      overdue: false,
    });

    const list = await get(
      base,
      `/households/${base.householdId}/planned-entries?nature=PAYABLE&from=${MONTH_FROM}&to=${MONTH_TO}`,
    );
    expect(list.json().items).toHaveLength(1);
    expect(list.json().summary).toMatchObject({
      plannedMinor: 31_240,
      settledMinor: 0,
      outstandingMinor: 31_240,
    });
  });

  it('a mesma chave de idempotência não duplica', async () => {
    const base = await setup();
    const input = payable(base, { idempotencyKey: 'planned-fixo-de-teste-0001' });
    const first = await post(base, `/households/${base.householdId}/planned-entries`, input);
    const second = await post(base, `/households/${base.householdId}/planned-entries`, input);

    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(409);
    expect(second.json().code).toBe('DUPLICATE_IDEMPOTENCY_KEY');
  });

  it('recusa valor fracionário e valor zero', async () => {
    const base = await setup();
    expect(
      (
        await post(
          base,
          `/households/${base.householdId}/planned-entries`,
          payable(base, { originalAmountMinor: 10.5 }),
        )
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await post(
          base,
          `/households/${base.householdId}/planned-entries`,
          payable(base, { originalAmountMinor: 0 }),
        )
      ).statusCode,
    ).toBe(400);
  });

  it('"vencido" é derivado do fuso da família e nunca persistido', async () => {
    const base = await setup();
    const created = await post(
      base,
      `/households/${base.householdId}/planned-entries`,
      payable(base, { dueDate: '2020-01-10', competenceDate: '2020-01-01' }),
    );
    const entry = created.json().items[0];
    expect(entry.overdue).toBe(true);
    expect(entry.overdueDays).toBeGreaterThan(2000);

    // Nada de "vencido" no banco: só data, status e saldo.
    const columns = await adminQuery<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'planned_entries'`,
    );
    expect(columns.map((c) => c.column_name)).not.toContain('overdue');
    expect(columns.map((c) => c.column_name)).not.toContain('is_overdue');
  });

  it('vencidas de meses anteriores continuam na lista do mês atual', async () => {
    const base = await setup();
    await post(
      base,
      `/households/${base.householdId}/planned-entries`,
      payable(base, {
        description: 'Atrasada',
        dueDate: '2020-01-10',
        competenceDate: '2020-01-01',
      }),
    );
    await post(base, `/households/${base.householdId}/planned-entries`, payable(base));

    const list = await get(
      base,
      `/households/${base.householdId}/planned-entries?nature=PAYABLE&from=${MONTH_FROM}&to=${MONTH_TO}`,
    );
    const descriptions = list.json().items.map((item: { description: string }) => item.description);
    expect(descriptions).toContain('Atrasada');
    expect(list.json().summary.overdueCount).toBe(1);
  });
});

describe('parcelamento (docs/04 §10)', () => {
  it('a soma das parcelas é exatamente o total, com os centavos na última', async () => {
    const base = await setup();
    const created = await post(
      base,
      `/households/${base.householdId}/planned-entries`,
      payable(base, {
        description: 'Sofá',
        originalAmountMinor: 100_000,
        installments: 3,
        idempotencyKey: key('parcelado'),
      }),
    );

    expect(created.statusCode).toBe(201);
    const items = created.json().items;
    expect(items).toHaveLength(3);
    expect(items.map((item: { originalAmountMinor: number }) => item.originalAmountMinor)).toEqual([
      33_333, 33_333, 33_334,
    ]);
    expect(
      items.reduce(
        (sum: number, item: { originalAmountMinor: number }) => sum + item.originalAmountMinor,
        0,
      ),
    ).toBe(100_000);
    expect(items.map((item: { installmentNumber: number }) => item.installmentNumber)).toEqual([
      1, 2, 3,
    ]);
    expect(items.every((item: { installmentTotal: number }) => item.installmentTotal === 3)).toBe(
      true,
    );
  });

  it('as parcelas caem em meses consecutivos', async () => {
    const base = await setup();
    const created = await post(
      base,
      `/households/${base.householdId}/planned-entries`,
      payable(base, {
        description: 'Curso',
        originalAmountMinor: 60_000,
        dueDate: '2026-01-31',
        competenceDate: '2026-01-31',
        installments: 3,
        idempotencyKey: key('parcelado'),
      }),
    );
    // Janeiro 31 → fevereiro 28 → março 31 (fim de mês preservado).
    expect(created.json().items.map((item: { dueDate: string }) => item.dueDate)).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
    ]);
  });
});

describe('recorrência', () => {
  it('cria a série mensal com o mesmo valor', async () => {
    const base = await setup();
    const created = await post(
      base,
      `/households/${base.householdId}/planned-entries`,
      payable(base, {
        description: 'Aluguel',
        originalAmountMinor: 180_000,
        dueDate: '2026-08-05',
        competenceDate: '2026-08-01',
        recurrence: { frequency: 'MONTHLY', interval: 1, maxOccurrences: 4 },
        idempotencyKey: key('recorrente'),
      }),
    );

    expect(created.statusCode).toBe(201);
    const items = created.json().items;
    expect(items).toHaveLength(4);
    expect(items.map((item: { dueDate: string }) => item.dueDate)).toEqual([
      '2026-08-05',
      '2026-09-05',
      '2026-10-05',
      '2026-11-05',
    ]);
    expect(
      items.every((item: { originalAmountMinor: number }) => item.originalAmountMinor === 180_000),
    ).toBe(true);
    expect(items[0].recurrenceRuleId).not.toBeNull();
  });

  it('não aceita parcelamento e recorrência juntos', async () => {
    const base = await setup();
    const response = await post(
      base,
      `/households/${base.householdId}/planned-entries`,
      payable(base, {
        installments: 3,
        recurrence: { frequency: 'MONTHLY', interval: 1 },
        idempotencyKey: key('conflito'),
      }),
    );
    expect(response.statusCode).toBe(400);
  });
});

describe('edição e cancelamento', () => {
  it('edita com controle de versão', async () => {
    const base = await setup();
    const entry = (
      await post(base, `/households/${base.householdId}/planned-entries`, payable(base))
    ).json().items[0];

    const updated = await ctx.app.inject({
      method: 'PATCH',
      url: `/households/${base.householdId}/planned-entries/${entry.id}`,
      headers: { authorization: `Bearer ${base.owner.accessToken}` },
      payload: { originalAmountMinor: 35_000, expectedVersion: entry.version },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().originalAmountMinor).toBe(35_000);

    const stale = await ctx.app.inject({
      method: 'PATCH',
      url: `/households/${base.householdId}/planned-entries/${entry.id}`,
      headers: { authorization: `Bearer ${base.owner.accessToken}` },
      payload: { description: 'Outra', expectedVersion: entry.version },
    });
    expect(stale.statusCode).toBe(409);
    expect(stale.json().code).toBe('VERSION_CONFLICT');
  });

  it('cancelar exige motivo e preserva o registro', async () => {
    const base = await setup();
    const entry = (
      await post(base, `/households/${base.householdId}/planned-entries`, payable(base))
    ).json().items[0];

    const semMotivo = await post(
      base,
      `/households/${base.householdId}/planned-entries/${entry.id}/cancel`,
      { expectedVersion: entry.version },
    );
    expect(semMotivo.statusCode).toBe(400);

    const canceled = await post(
      base,
      `/households/${base.householdId}/planned-entries/${entry.id}/cancel`,
      { reason: 'Cobrança indevida', expectedVersion: entry.version },
    );
    expect(canceled.statusCode).toBe(200);
    expect(canceled.json().status).toBe('CANCELED');
    expect(canceled.json().overdue).toBe(false);

    // O registro continua existindo.
    const still = await get(base, `/households/${base.householdId}/planned-entries/${entry.id}`);
    expect(still.statusCode).toBe(200);
  });
});

describe('anexos (docs/10 §7)', () => {
  it('cria o anexo com caminho escopado pela família', async () => {
    const base = await setup();
    const entry = (
      await post(base, `/households/${base.householdId}/planned-entries`, payable(base))
    ).json().items[0];

    const created = await post(base, `/households/${base.householdId}/attachments`, {
      entityType: 'planned_entry',
      entityId: entry.id,
      fileName: 'conta-de-luz.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 120_000,
    });

    expect(created.statusCode).toBe(201);
    expect(created.json().storagePath.startsWith(`${base.householdId}/`)).toBe(true);

    const list = await get(
      base,
      `/households/${base.householdId}/attachments?entityType=planned_entry&entityId=${entry.id}`,
    );
    expect(list.json().items).toHaveLength(1);

    const withAttachment = await get(
      base,
      `/households/${base.householdId}/planned-entries/${entry.id}`,
    );
    expect(withAttachment.json().attachmentCount).toBe(1);
  });

  it('recusa tipo de arquivo fora da lista permitida', async () => {
    const base = await setup();
    const entry = (
      await post(base, `/households/${base.householdId}/planned-entries`, payable(base))
    ).json().items[0];

    const response = await post(base, `/households/${base.householdId}/attachments`, {
      entityType: 'planned_entry',
      entityId: entry.id,
      fileName: 'malicioso.exe',
      mimeType: 'application/x-msdownload',
      sizeBytes: 1000,
    });
    expect(response.statusCode).toBe(400);
  });
});
