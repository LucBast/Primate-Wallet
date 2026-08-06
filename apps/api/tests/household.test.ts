/**
 * Fase 1 — família, membros, convites e permissões.
 *
 * Os testes de permissão seguem a matriz de STATES-AND-MATRICES §2: cada papel
 * é exercitado contra as ações que pode e que não pode fazer.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  closeAdminPool,
  createTestContext,
  lastEmailLink,
  registerUser,
  truncateAll,
  type TestContext,
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

async function createHousehold(accessToken: string, name = 'Família Souza') {
  const response = await ctx.app.inject({
    method: 'POST',
    url: '/households',
    headers: { authorization: `Bearer ${accessToken}` },
    payload: { name, ownerDisplayName: 'Ana' },
  });
  expect(response.statusCode).toBe(201);
  return response.json();
}

/** Convida alguém e devolve o token do link enviado por e-mail. */
async function invite(accessToken: string, householdId: string, payload: Record<string, unknown>) {
  const response = await ctx.app.inject({
    method: 'POST',
    url: `/households/${householdId}/invitations`,
    headers: { authorization: `Bearer ${accessToken}` },
    payload,
  });
  return { response, token: response.statusCode === 201 ? lastEmailLink(ctx.mailer) : null };
}

describe('criação de família', () => {
  it('cria a família com o criador como proprietário', async () => {
    const ana = await registerUser(ctx, 'ana@exemplo.com');
    const household = await createHousehold(ana.accessToken);

    expect(household.myRole).toBe('OWNER');
    expect(household.memberCount).toBe(1);
    expect(household.currencyCode).toBe('BRL');
    expect(household.timezone).toBe('America/Sao_Paulo');
  });

  it('lista somente as famílias de quem pergunta', async () => {
    const ana = await registerUser(ctx, 'ana@exemplo.com');
    const bruno = await registerUser(ctx, 'bruno@exemplo.com');
    await createHousehold(ana.accessToken, 'Família Souza');
    await createHousehold(bruno.accessToken, 'Família Lima');

    const list = await ctx.app.inject({
      method: 'GET',
      url: '/households',
      headers: { authorization: `Bearer ${ana.accessToken}` },
    });
    const items = list.json().items;
    expect(items).toHaveLength(1);
    expect(items[0].name).toBe('Família Souza');
  });

  it('quem não é membro não enxerga a família', async () => {
    const ana = await registerUser(ctx, 'ana@exemplo.com');
    const bruno = await registerUser(ctx, 'bruno@exemplo.com');
    const household = await createHousehold(ana.accessToken);

    const response = await ctx.app.inject({
      method: 'GET',
      url: `/households/${household.id}/members`,
      headers: { authorization: `Bearer ${bruno.accessToken}` },
    });
    expect(response.statusCode).toBe(404);
    expect(response.json().code).toBe('HOUSEHOLD_NOT_FOUND');
  });
});

describe('convites', () => {
  it('convida, aparece como pendente e é aceito pelo destinatário', async () => {
    const ana = await registerUser(ctx, 'ana@exemplo.com', 'Ana');
    const household = await createHousehold(ana.accessToken);

    const { response, token } = await invite(ana.accessToken, household.id, {
      email: 'bruno@exemplo.com',
      displayName: 'Bruno',
      role: 'ADULT',
    });
    expect(response.statusCode).toBe(201);
    expect(response.json().expiresInDays).toBeGreaterThan(0);

    const pending = await ctx.app.inject({
      method: 'GET',
      url: `/households/${household.id}/invitations`,
      headers: { authorization: `Bearer ${ana.accessToken}` },
    });
    expect(pending.json().items).toHaveLength(1);

    const bruno = await registerUser(ctx, 'bruno@exemplo.com');
    const preview = await ctx.app.inject({
      method: 'GET',
      url: `/invitations/preview?token=${token}`,
      headers: { authorization: `Bearer ${bruno.accessToken}` },
    });
    expect(preview.statusCode).toBe(200);
    expect(preview.json()).toMatchObject({
      householdName: 'Família Souza',
      invitedByName: 'Ana',
      role: 'ADULT',
    });

    const accepted = await ctx.app.inject({
      method: 'POST',
      url: '/invitations/accept',
      headers: { authorization: `Bearer ${bruno.accessToken}` },
      payload: { token },
    });
    expect(accepted.statusCode).toBe(200);
    expect(accepted.json().role).toBe('ADULT');

    const members = await ctx.app.inject({
      method: 'GET',
      url: `/households/${household.id}/members`,
      headers: { authorization: `Bearer ${bruno.accessToken}` },
    });
    expect(members.json().items).toHaveLength(2);
  });

  it('o convite é nominal: outra conta não consegue usá-lo', async () => {
    const ana = await registerUser(ctx, 'ana@exemplo.com');
    const household = await createHousehold(ana.accessToken);
    const { token } = await invite(ana.accessToken, household.id, {
      email: 'bruno@exemplo.com',
      displayName: 'Bruno',
      role: 'ADULT',
    });

    const intruso = await registerUser(ctx, 'intruso@exemplo.com');
    const response = await ctx.app.inject({
      method: 'POST',
      url: '/invitations/accept',
      headers: { authorization: `Bearer ${intruso.accessToken}` },
      payload: { token },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().code).toBe('FORBIDDEN');
  });

  it('o mesmo convite não pode ser aceito duas vezes', async () => {
    const ana = await registerUser(ctx, 'ana@exemplo.com');
    const household = await createHousehold(ana.accessToken);
    const { token } = await invite(ana.accessToken, household.id, {
      email: 'bruno@exemplo.com',
      displayName: 'Bruno',
      role: 'ADULT',
    });
    const bruno = await registerUser(ctx, 'bruno@exemplo.com');

    const first = await ctx.app.inject({
      method: 'POST',
      url: '/invitations/accept',
      headers: { authorization: `Bearer ${bruno.accessToken}` },
      payload: { token },
    });
    const second = await ctx.app.inject({
      method: 'POST',
      url: '/invitations/accept',
      headers: { authorization: `Bearer ${bruno.accessToken}` },
      payload: { token },
    });
    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(400);
    expect(second.json().code).toBe('TOKEN_INVALID');
  });

  it('revogar o convite invalida o token e some com o membro pendente', async () => {
    const ana = await registerUser(ctx, 'ana@exemplo.com');
    const household = await createHousehold(ana.accessToken);
    const { response, token } = await invite(ana.accessToken, household.id, {
      email: 'bruno@exemplo.com',
      displayName: 'Bruno',
      role: 'MEMBER',
    });

    const revoked = await ctx.app.inject({
      method: 'DELETE',
      url: `/households/${household.id}/invitations/${response.json().id}`,
      headers: { authorization: `Bearer ${ana.accessToken}` },
    });
    expect(revoked.statusCode).toBe(200);

    const bruno = await registerUser(ctx, 'bruno@exemplo.com');
    const accepted = await ctx.app.inject({
      method: 'POST',
      url: '/invitations/accept',
      headers: { authorization: `Bearer ${bruno.accessToken}` },
      payload: { token },
    });
    expect(accepted.json().code).toBe('TOKEN_INVALID');

    const members = await ctx.app.inject({
      method: 'GET',
      url: `/households/${household.id}/members`,
      headers: { authorization: `Bearer ${ana.accessToken}` },
    });
    expect(members.json().items).toHaveLength(1);
  });

  it('exige valor limite quando a aprovação é por valor', async () => {
    const ana = await registerUser(ctx, 'ana@exemplo.com');
    const household = await createHousehold(ana.accessToken);
    const { response } = await invite(ana.accessToken, household.id, {
      email: 'caio@exemplo.com',
      displayName: 'Caio',
      role: 'CHILD',
      isSupervised: true,
      approvalMode: 'ABOVE_THRESHOLD',
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe('VALIDATION_ERROR');
  });
});

describe('matriz de permissões (STATES-AND-MATRICES §2)', () => {
  /** Monta uma família com proprietária, adulto e filho supervisionado. */
  async function familyWithRoles() {
    const ana = await registerUser(ctx, 'ana@exemplo.com');
    const household = await createHousehold(ana.accessToken);

    const brunoInvite = await invite(ana.accessToken, household.id, {
      email: 'bruno@exemplo.com',
      displayName: 'Bruno',
      role: 'ADULT',
    });
    const bruno = await registerUser(ctx, 'bruno@exemplo.com');
    await ctx.app.inject({
      method: 'POST',
      url: '/invitations/accept',
      headers: { authorization: `Bearer ${bruno.accessToken}` },
      payload: { token: brunoInvite.token },
    });

    const caioInvite = await invite(ana.accessToken, household.id, {
      email: 'caio@exemplo.com',
      displayName: 'Caio',
      role: 'CHILD',
      isSupervised: true,
      approvalMode: 'ABOVE_THRESHOLD',
      approvalThresholdMinor: 5000,
    });
    const caio = await registerUser(ctx, 'caio@exemplo.com');
    await ctx.app.inject({
      method: 'POST',
      url: '/invitations/accept',
      headers: { authorization: `Bearer ${caio.accessToken}` },
      payload: { token: caioInvite.token },
    });

    return { ana, bruno, caio, household };
  }

  it('adulto não convida membros', async () => {
    const { bruno, household } = await familyWithRoles();
    const { response } = await invite(bruno.accessToken, household.id, {
      email: 'novo@exemplo.com',
      displayName: 'Novo',
      role: 'MEMBER',
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().code).toBe('INSUFFICIENT_PERMISSION');
  });

  it('filho supervisionado não lê a auditoria da família', async () => {
    const { ana, caio, household } = await familyWithRoles();

    const asChild = await ctx.app.inject({
      method: 'GET',
      url: `/households/${household.id}/audit`,
      headers: { authorization: `Bearer ${caio.accessToken}` },
    });
    expect(asChild.statusCode).toBe(403);

    const asOwner = await ctx.app.inject({
      method: 'GET',
      url: `/households/${household.id}/audit`,
      headers: { authorization: `Bearer ${ana.accessToken}` },
    });
    expect(asOwner.statusCode).toBe(200);
    // Criação da família, convites e aceites entram na trilha.
    expect(asOwner.json().items.length).toBeGreaterThanOrEqual(3);
    expect(asOwner.json().items.map((item: { action: string }) => item.action)).toContain(
      'HOUSEHOLD_CREATED',
    );
  });

  it('todo membro enxerga a lista de membros', async () => {
    const { caio, household } = await familyWithRoles();
    const response = await ctx.app.inject({
      method: 'GET',
      url: `/households/${household.id}/members`,
      headers: { authorization: `Bearer ${caio.accessToken}` },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().items).toHaveLength(3);
  });

  it('adulto não altera permissões de outro membro', async () => {
    const { bruno, caio, household } = await familyWithRoles();
    const members = await ctx.app.inject({
      method: 'GET',
      url: `/households/${household.id}/members`,
      headers: { authorization: `Bearer ${caio.accessToken}` },
    });
    const caioMember = members
      .json()
      .items.find((item: { displayName: string }) => item.displayName === 'Caio');

    const response = await ctx.app.inject({
      method: 'PATCH',
      url: `/households/${household.id}/members/${caioMember.id}`,
      headers: { authorization: `Bearer ${bruno.accessToken}` },
      payload: { approvalMode: 'NEVER', expectedVersion: caioMember.version },
    });
    expect(response.statusCode).toBe(403);
  });
});

describe('permissões do membro (tela 3b)', () => {
  it('proprietária ajusta a regra de aprovação do filho', async () => {
    const ana = await registerUser(ctx, 'ana@exemplo.com');
    const household = await createHousehold(ana.accessToken);
    await invite(ana.accessToken, household.id, {
      email: 'caio@exemplo.com',
      displayName: 'Caio',
      role: 'CHILD',
      isSupervised: true,
      approvalMode: 'ALWAYS',
    });

    const members = await ctx.app.inject({
      method: 'GET',
      url: `/households/${household.id}/members`,
      headers: { authorization: `Bearer ${ana.accessToken}` },
    });
    const caio = members
      .json()
      .items.find((item: { displayName: string }) => item.displayName === 'Caio');

    const updated = await ctx.app.inject({
      method: 'PATCH',
      url: `/households/${household.id}/members/${caio.id}`,
      headers: { authorization: `Bearer ${ana.accessToken}` },
      payload: {
        approvalMode: 'ABOVE_THRESHOLD',
        approvalThresholdMinor: 5000,
        expectedVersion: caio.version,
      },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json()).toMatchObject({
      approvalMode: 'ABOVE_THRESHOLD',
      approvalThresholdMinor: 5000,
      version: caio.version + 1,
    });
  });

  it('recusa alteração com versão desatualizada (VERSION_CONFLICT)', async () => {
    const ana = await registerUser(ctx, 'ana@exemplo.com');
    const household = await createHousehold(ana.accessToken);
    await invite(ana.accessToken, household.id, {
      email: 'caio@exemplo.com',
      displayName: 'Caio',
      role: 'CHILD',
    });

    const members = await ctx.app.inject({
      method: 'GET',
      url: `/households/${household.id}/members`,
      headers: { authorization: `Bearer ${ana.accessToken}` },
    });
    const caio = members
      .json()
      .items.find((item: { displayName: string }) => item.displayName === 'Caio');

    const patch = (version: number) =>
      ctx.app.inject({
        method: 'PATCH',
        url: `/households/${household.id}/members/${caio.id}`,
        headers: { authorization: `Bearer ${ana.accessToken}` },
        payload: { displayName: 'Caio Souza', expectedVersion: version },
      });

    expect((await patch(caio.version)).statusCode).toBe(200);
    const stale = await patch(caio.version);
    expect(stale.statusCode).toBe(409);
    expect(stale.json().code).toBe('VERSION_CONFLICT');
  });

  it('suspende um membro', async () => {
    const ana = await registerUser(ctx, 'ana@exemplo.com');
    const household = await createHousehold(ana.accessToken);
    const brunoInvite = await invite(ana.accessToken, household.id, {
      email: 'bruno@exemplo.com',
      displayName: 'Bruno',
      role: 'ADULT',
    });
    const bruno = await registerUser(ctx, 'bruno@exemplo.com');
    await ctx.app.inject({
      method: 'POST',
      url: '/invitations/accept',
      headers: { authorization: `Bearer ${bruno.accessToken}` },
      payload: { token: brunoInvite.token },
    });

    const members = await ctx.app.inject({
      method: 'GET',
      url: `/households/${household.id}/members`,
      headers: { authorization: `Bearer ${ana.accessToken}` },
    });
    const brunoMember = members
      .json()
      .items.find((item: { displayName: string }) => item.displayName === 'Bruno');

    const suspended = await ctx.app.inject({
      method: 'PATCH',
      url: `/households/${household.id}/members/${brunoMember.id}`,
      headers: { authorization: `Bearer ${ana.accessToken}` },
      payload: { status: 'SUSPENDED', expectedVersion: brunoMember.version },
    });
    expect(suspended.statusCode).toBe(200);

    // Suspenso deixa de enxergar a família.
    const afterSuspension = await ctx.app.inject({
      method: 'GET',
      url: `/households/${household.id}/members`,
      headers: { authorization: `Bearer ${bruno.accessToken}` },
    });
    expect(afterSuspension.statusCode).toBe(404);
  });
});

describe('transferência de propriedade', () => {
  it('só o proprietário transfere, e a família fica com um único proprietário', async () => {
    const ana = await registerUser(ctx, 'ana@exemplo.com');
    const household = await createHousehold(ana.accessToken);
    const brunoInvite = await invite(ana.accessToken, household.id, {
      email: 'bruno@exemplo.com',
      displayName: 'Bruno',
      role: 'ADMIN',
    });
    const bruno = await registerUser(ctx, 'bruno@exemplo.com');
    await ctx.app.inject({
      method: 'POST',
      url: '/invitations/accept',
      headers: { authorization: `Bearer ${bruno.accessToken}` },
      payload: { token: brunoInvite.token },
    });

    const members = await ctx.app.inject({
      method: 'GET',
      url: `/households/${household.id}/members`,
      headers: { authorization: `Bearer ${ana.accessToken}` },
    });
    const brunoMember = members
      .json()
      .items.find((item: { displayName: string }) => item.displayName === 'Bruno');

    // Administrador não transfere.
    const byAdmin = await ctx.app.inject({
      method: 'POST',
      url: `/households/${household.id}/transfer-ownership`,
      headers: { authorization: `Bearer ${bruno.accessToken}` },
      payload: { toMemberId: brunoMember.id },
    });
    expect(byAdmin.statusCode).toBe(403);

    const byOwner = await ctx.app.inject({
      method: 'POST',
      url: `/households/${household.id}/transfer-ownership`,
      headers: { authorization: `Bearer ${ana.accessToken}` },
      payload: { toMemberId: brunoMember.id },
    });
    expect(byOwner.statusCode).toBe(200);

    const after = await ctx.app.inject({
      method: 'GET',
      url: `/households/${household.id}/members`,
      headers: { authorization: `Bearer ${bruno.accessToken}` },
    });
    const owners = after.json().items.filter((item: { role: string }) => item.role === 'OWNER');
    expect(owners).toHaveLength(1);
    expect(owners[0].displayName).toBe('Bruno');
  });
});
