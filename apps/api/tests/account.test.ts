/**
 * Fase 2 — contas, cartões, categorias, permissões por conta, saldo e ajuste.
 *
 * Cobre os critérios de aceite "Conta unificada" (docs/17) e a visibilidade de
 * contas da matriz de permissões.
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

type Ctx = { owner: TestUser; householdId: string };

async function setup(): Promise<Ctx> {
  const owner = await registerUser(ctx, 'ana@exemplo.com', 'Ana');
  const created = await ctx.app.inject({
    method: 'POST',
    url: '/households',
    headers: { authorization: `Bearer ${owner.accessToken}` },
    payload: { name: 'Família Souza', ownerDisplayName: 'Ana' },
  });
  return { owner, householdId: created.json().id };
}

/** Convida alguém, aceita o convite e devolve a sessão. */
async function addMember(
  base: Ctx,
  email: string,
  role: string,
  extra: Record<string, unknown> = {},
): Promise<TestUser> {
  await ctx.app.inject({
    method: 'POST',
    url: `/households/${base.householdId}/invitations`,
    headers: { authorization: `Bearer ${base.owner.accessToken}` },
    payload: { email, displayName: email.split('@')[0], role, ...extra },
  });
  const token = lastEmailLink(ctx.mailer);
  const user = await registerUser(ctx, email);
  await ctx.app.inject({
    method: 'POST',
    url: '/invitations/accept',
    headers: { authorization: `Bearer ${user.accessToken}` },
    payload: { token },
  });
  return user;
}

function post(user: TestUser, url: string, payload: unknown) {
  return ctx.app.inject({
    method: 'POST',
    url,
    headers: { authorization: `Bearer ${user.accessToken}` },
    payload,
  });
}

function get(user: TestUser, url: string) {
  return ctx.app.inject({
    method: 'GET',
    url,
    headers: { authorization: `Bearer ${user.accessToken}` },
  });
}

describe('conta unificada (docs/17 §Conta unificada)', () => {
  it('cria conta corrente e cartão na mesma tabela e no mesmo formulário', async () => {
    const base = await setup();

    const checking = await post(base.owner, `/households/${base.householdId}/accounts`, {
      name: 'Conta Corrente',
      accountType: 'CHECKING',
      institutionName: 'Banco Azul',
      openingBalanceMinor: 250_000,
    });
    const card = await post(base.owner, `/households/${base.householdId}/accounts`, {
      name: 'Cartão Azul',
      accountType: 'CREDIT_CARD',
      cardBrand: 'Visa',
      cardLastFour: '4412',
      creditLimitMinor: 500_000,
      closingDay: 10,
      dueDay: 15,
    });

    expect(checking.statusCode).toBe(201);
    expect(card.statusCode).toBe(201);
    expect(checking.json().balanceMinor).toBe(250_000);
    expect(card.json().balanceMinor).toBe(0);
    expect(card.json().availableLimitMinor).toBe(500_000);
    expect(checking.json().availableLimitMinor).toBeNull();
  });

  it('cartão exige limite, fechamento e vencimento', async () => {
    const base = await setup();
    const response = await post(base.owner, `/households/${base.householdId}/accounts`, {
      name: 'Cartão sem limite',
      accountType: 'CREDIT_CARD',
      cardBrand: 'Visa',
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe('VALIDATION_ERROR');
  });

  it('conta que não é cartão recusa campos de cartão', async () => {
    const base = await setup();
    const response = await post(base.owner, `/households/${base.householdId}/accounts`, {
      name: 'Poupança',
      accountType: 'SAVINGS',
      creditLimitMinor: 100_000,
    });
    expect(response.statusCode).toBe(400);
  });

  it('não aceita saldo inicial fracionário', async () => {
    const base = await setup();
    const response = await post(base.owner, `/households/${base.householdId}/accounts`, {
      name: 'Carteira',
      accountType: 'CASH',
      openingBalanceMinor: 10.5,
    });
    expect(response.statusCode).toBe(400);
  });
});

describe('visibilidade de contas (docs/10 §5)', () => {
  it('conta OWNER_ONLY não chega para outro membro', async () => {
    const base = await setup();
    const bruno = await addMember(base, 'bruno@exemplo.com', 'MEMBER');

    // A conta é do membro proprietário (Ana), com visibilidade só dela.
    const members = await get(base.owner, `/households/${base.householdId}/members`);
    const ana = members.json().items.find((m: { displayName: string }) => m.displayName === 'Ana');

    await post(base.owner, `/households/${base.householdId}/accounts`, {
      name: 'Reserva pessoal',
      accountType: 'SAVINGS',
      visibilityScope: 'OWNER_ONLY',
      primaryMemberId: ana.id,
      openingBalanceMinor: 100_000,
    });
    await post(base.owner, `/households/${base.householdId}/accounts`, {
      name: 'Conta da casa',
      accountType: 'CHECKING',
      openingBalanceMinor: 50_000,
    });

    const asOwner = await get(base.owner, `/households/${base.householdId}/accounts`);
    const asMember = await get(bruno, `/households/${base.householdId}/accounts`);

    expect(asOwner.json().items).toHaveLength(2);
    // O membro só recebe a conta da casa — a restrita NÃO chega ao cliente.
    expect(asMember.json().items).toHaveLength(1);
    expect(asMember.json().items[0].name).toBe('Conta da casa');
  });

  it('SELECTED_MEMBERS libera apenas quem foi escolhido', async () => {
    const base = await setup();
    const bruno = await addMember(base, 'bruno@exemplo.com', 'MEMBER');
    const caio = await addMember(base, 'caio@exemplo.com', 'MEMBER');

    const members = await get(base.owner, `/households/${base.householdId}/members`);
    const brunoMember = members
      .json()
      .items.find((m: { displayName: string }) => m.displayName === 'bruno');

    await post(base.owner, `/households/${base.householdId}/accounts`, {
      name: 'Mesada digital',
      accountType: 'DIGITAL_WALLET',
      visibilityScope: 'SELECTED_MEMBERS',
      selectedMemberIds: [brunoMember.id],
    });

    expect(
      (await get(bruno, `/households/${base.householdId}/accounts`)).json().items,
    ).toHaveLength(1);
    expect((await get(caio, `/households/${base.householdId}/accounts`)).json().items).toHaveLength(
      0,
    );
  });

  it('acesso direto por ID a conta restrita não retorna nada', async () => {
    const base = await setup();
    const bruno = await addMember(base, 'bruno@exemplo.com', 'MEMBER');
    const created = await post(base.owner, `/households/${base.householdId}/accounts`, {
      name: 'Reserva',
      accountType: 'SAVINGS',
      visibilityScope: 'SELECTED_MEMBERS',
      selectedMemberIds: [],
    });
    // Sem membros escolhidos o contrato recusa; criamos com ADULTS_ONLY então.
    expect(created.statusCode).toBe(400);

    const adultsOnly = await post(base.owner, `/households/${base.householdId}/accounts`, {
      name: 'Reserva',
      accountType: 'SAVINGS',
      visibilityScope: 'ADULTS_ONLY',
    });
    const accountId = adultsOnly.json().id;

    const direct = await get(bruno, `/households/${base.householdId}/accounts/${accountId}`);
    expect(direct.statusCode).toBe(404);
    expect(direct.json().code).toBe('ACCOUNT_NOT_FOUND');
  });
});

describe('permissões por conta (tela 3b)', () => {
  it('administrador concede e revoga acesso a uma conta', async () => {
    const base = await setup();
    const caio = await addMember(base, 'caio@exemplo.com', 'CHILD', { isSupervised: true });

    const account = await post(base.owner, `/households/${base.householdId}/accounts`, {
      name: 'Mesada digital',
      accountType: 'DIGITAL_WALLET',
      visibilityScope: 'ADULTS_ONLY',
    });
    const members = await get(base.owner, `/households/${base.householdId}/members`);
    const caioMember = members
      .json()
      .items.find((m: { displayName: string }) => m.displayName === 'caio');

    // Sem permissão: a conta não aparece.
    expect((await get(caio, `/households/${base.householdId}/accounts`)).json().items).toHaveLength(
      0,
    );

    const granted = await ctx.app.inject({
      method: 'PUT',
      url: `/households/${base.householdId}/members/${caioMember.id}/account-permissions`,
      headers: { authorization: `Bearer ${base.owner.accessToken}` },
      payload: {
        permissions: [
          { accountId: account.json().id, canView: true, canTransact: true, canEdit: false },
        ],
      },
    });
    expect(granted.statusCode).toBe(200);
    expect((await get(caio, `/households/${base.householdId}/accounts`)).json().items).toHaveLength(
      1,
    );

    await ctx.app.inject({
      method: 'PUT',
      url: `/households/${base.householdId}/members/${caioMember.id}/account-permissions`,
      headers: { authorization: `Bearer ${base.owner.accessToken}` },
      payload: {
        permissions: [
          { accountId: account.json().id, canView: false, canTransact: false, canEdit: false },
        ],
      },
    });
    expect((await get(caio, `/households/${base.householdId}/accounts`)).json().items).toHaveLength(
      0,
    );
  });

  it('membro comum não altera permissões', async () => {
    const base = await setup();
    const bruno = await addMember(base, 'bruno@exemplo.com', 'MEMBER');
    const members = await get(base.owner, `/households/${base.householdId}/members`);
    const brunoMember = members
      .json()
      .items.find((m: { displayName: string }) => m.displayName === 'bruno');

    const response = await ctx.app.inject({
      method: 'PUT',
      url: `/households/${base.householdId}/members/${brunoMember.id}/account-permissions`,
      headers: { authorization: `Bearer ${bruno.accessToken}` },
      payload: { permissions: [] },
    });
    expect(response.statusCode).toBe(403);
  });
});

describe('ajuste de saldo (tela 2d, docs/04 §18)', () => {
  async function accountWithBalance(base: Ctx, openingBalanceMinor: number) {
    const created = await post(base.owner, `/households/${base.householdId}/accounts`, {
      name: 'Conta Corrente',
      accountType: 'CHECKING',
      openingBalanceMinor,
    });
    return created.json();
  }

  it('cria uma movimentação com a diferença e exige motivo', async () => {
    const base = await setup();
    const account = await accountWithBalance(base, 100_000);

    const semMotivo = await post(
      base.owner,
      `/households/${base.householdId}/accounts/${account.id}/adjust-balance`,
      { newBalanceMinor: 101_275, idempotencyKey: 'ajuste-sem-motivo-1', expectedVersion: 1 },
    );
    expect(semMotivo.statusCode).toBe(400);

    const response = await post(
      base.owner,
      `/households/${base.householdId}/accounts/${account.id}/adjust-balance`,
      {
        newBalanceMinor: 101_275,
        reason: 'Conferência com o extrato do banco',
        idempotencyKey: 'ajuste-de-teste-0001',
        expectedVersion: account.version,
      },
    );
    expect(response.statusCode).toBe(200);
    expect(response.json().adjustmentMinor).toBe(1_275);
    expect(response.json().account.balanceMinor).toBe(101_275);
  });

  it('a mesma chave de idempotência não gera dois ajustes', async () => {
    const base = await setup();
    const account = await accountWithBalance(base, 100_000);

    const first = await post(
      base.owner,
      `/households/${base.householdId}/accounts/${account.id}/adjust-balance`,
      {
        newBalanceMinor: 110_000,
        reason: 'Conferência',
        idempotencyKey: 'ajuste-duplicado-0001',
        expectedVersion: account.version,
      },
    );
    const second = await post(
      base.owner,
      `/households/${base.householdId}/accounts/${account.id}/adjust-balance`,
      {
        newBalanceMinor: 120_000,
        reason: 'Conferência',
        idempotencyKey: 'ajuste-duplicado-0001',
        expectedVersion: first.json().account.version,
      },
    );
    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(409);
    expect(second.json().code).toBe('DUPLICATE_IDEMPOTENCY_KEY');

    const account2 = await get(
      base.owner,
      `/households/${base.householdId}/accounts/${account.id}`,
    );
    expect(account2.json().balanceMinor).toBe(110_000);
  });

  it('adulto não ajusta saldo (matriz de permissões)', async () => {
    const base = await setup();
    const bruno = await addMember(base, 'bruno@exemplo.com', 'ADULT');
    const account = await accountWithBalance(base, 100_000);

    const response = await post(
      bruno,
      `/households/${base.householdId}/accounts/${account.id}/adjust-balance`,
      {
        newBalanceMinor: 200_000,
        reason: 'Tentativa',
        idempotencyKey: 'ajuste-do-adulto-001',
        expectedVersion: account.version,
      },
    );
    expect(response.statusCode).toBe(403);
    expect(response.json().code).toBe('INSUFFICIENT_PERMISSION');
  });

  it('recusa versão desatualizada e ajuste sem diferença', async () => {
    const base = await setup();
    const account = await accountWithBalance(base, 100_000);

    const semDiferenca = await post(
      base.owner,
      `/households/${base.householdId}/accounts/${account.id}/adjust-balance`,
      {
        newBalanceMinor: 100_000,
        reason: 'Sem diferença',
        idempotencyKey: 'ajuste-sem-diferenca-1',
        expectedVersion: account.version,
      },
    );
    expect(semDiferenca.statusCode).toBe(400);

    const versaoErrada = await post(
      base.owner,
      `/households/${base.householdId}/accounts/${account.id}/adjust-balance`,
      {
        newBalanceMinor: 150_000,
        reason: 'Conferência',
        idempotencyKey: 'ajuste-versao-errada-1',
        expectedVersion: account.version + 5,
      },
    );
    expect(versaoErrada.statusCode).toBe(409);
    expect(versaoErrada.json().code).toBe('VERSION_CONFLICT');
  });

  it('o extrato mostra o ajuste com motivo e autor', async () => {
    const base = await setup();
    const account = await accountWithBalance(base, 100_000);
    await post(
      base.owner,
      `/households/${base.householdId}/accounts/${account.id}/adjust-balance`,
      {
        newBalanceMinor: 98_725,
        reason: 'Tarifa não lançada',
        idempotencyKey: 'ajuste-extrato-00001',
        expectedVersion: account.version,
      },
    );

    const today = new Date().toISOString().slice(0, 10);
    const statement = await get(
      base.owner,
      `/households/${base.householdId}/accounts/${account.id}/statement?from=${today}&to=${today}`,
    );
    expect(statement.statusCode).toBe(200);
    const rows = statement.json().items;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      transactionType: 'ADJUSTMENT',
      signedAmountMinor: -1_275,
      reason: 'Tarifa não lançada',
      memberName: 'Ana',
    });
  });
});

describe('arquivamento (docs/04 §17)', () => {
  it('arquivar tira da lista padrão, mantém no histórico e impede edição', async () => {
    const base = await setup();
    const account = (
      await post(base.owner, `/households/${base.householdId}/accounts`, {
        name: 'Conta antiga',
        accountType: 'CHECKING',
      })
    ).json();

    await post(base.owner, `/households/${base.householdId}/accounts/${account.id}/archive`, {
      archived: true,
    });

    const visible = await get(base.owner, `/households/${base.householdId}/accounts`);
    const withArchived = await get(
      base.owner,
      `/households/${base.householdId}/accounts?includeArchived=true`,
    );
    expect(visible.json().items).toHaveLength(0);
    expect(withArchived.json().items).toHaveLength(1);

    const edit = await ctx.app.inject({
      method: 'PATCH',
      url: `/households/${base.householdId}/accounts/${account.id}`,
      headers: { authorization: `Bearer ${base.owner.accessToken}` },
      payload: { name: 'Outro nome', expectedVersion: account.version + 1 },
    });
    expect(edit.statusCode).toBe(409);
    expect(edit.json().code).toBe('ACCOUNT_ARCHIVED');
  });
});

describe('categorias', () => {
  it('família nova nasce com as categorias padrão em pt-BR', async () => {
    const base = await setup();
    const response = await get(base.owner, `/households/${base.householdId}/categories`);
    const names = response.json().items.map((c: { name: string }) => c.name);
    expect(names).toContain('Moradia');
    expect(names).toContain('Alimentação');
    expect(names).toContain('Salário');
    expect(response.json().items.every((c: { isSystem: boolean }) => c.isSystem)).toBe(true);
  });

  it('cria subcategoria e recusa um terceiro nível', async () => {
    const base = await setup();
    const categories = await get(base.owner, `/households/${base.householdId}/categories`);
    const moradia = categories.json().items.find((c: { name: string }) => c.name === 'Moradia');

    const sub = await post(base.owner, `/households/${base.householdId}/categories`, {
      name: 'Aluguel',
      nature: 'EXPENSE',
      parentId: moradia.id,
    });
    expect(sub.statusCode).toBe(201);
    expect(sub.json().parentId).toBe(moradia.id);

    const third = await post(base.owner, `/households/${base.householdId}/categories`, {
      name: 'Aluguel garagem',
      nature: 'EXPENSE',
      parentId: sub.json().id,
    });
    expect(third.statusCode).toBe(500);
  });

  it('a subcategoria herda a natureza da categoria', async () => {
    const base = await setup();
    const categories = await get(base.owner, `/households/${base.householdId}/categories`);
    const moradia = categories.json().items.find((c: { name: string }) => c.name === 'Moradia');

    const wrong = await post(base.owner, `/households/${base.householdId}/categories`, {
      name: 'Receita estranha',
      nature: 'INCOME',
      parentId: moradia.id,
    });
    expect(wrong.statusCode).toBe(500);
  });

  it('arquiva categoria em vez de excluir', async () => {
    const base = await setup();
    const created = await post(base.owner, `/households/${base.householdId}/categories`, {
      name: 'Categoria temporária',
      nature: 'EXPENSE',
    });

    const archived = await ctx.app.inject({
      method: 'PATCH',
      url: `/households/${base.householdId}/categories/${created.json().id}`,
      headers: { authorization: `Bearer ${base.owner.accessToken}` },
      payload: { archived: true },
    });
    expect(archived.statusCode).toBe(200);
    expect(archived.json().archivedAt).not.toBeNull();

    const visible = await get(base.owner, `/households/${base.householdId}/categories`);
    expect(
      visible.json().items.some((c: { name: string }) => c.name === 'Categoria temporária'),
    ).toBe(false);
  });
});
