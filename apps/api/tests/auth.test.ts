/**
 * Testes de integração do fluxo de autenticação, contra Postgres real.
 *
 * Cobrem os itens de docs/10 §10 aplicáveis à Fase 0: enumeração de contas,
 * sessão revogada, token expirado/reutilizado e replay de token de uso único.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  closeAdminPool,
  createTestContext,
  lastEmailLink,
  TEST_DEVICE,
  truncateAll,
  type TestContext,
} from './helpers.js';

let ctx: TestContext;

const EMAIL = 'ana@exemplo.com';
const PASSWORD = 'senha-de-teste-longa';

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

async function registerAndVerify(email = EMAIL): Promise<{
  accessToken: string;
  refreshToken: string;
  profileId: string;
}> {
  const registered = await ctx.app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: { email, password: PASSWORD, displayName: 'Ana' },
  });
  expect(registered.statusCode).toBe(202);

  const token = lastEmailLink(ctx.mailer);
  const verified = await ctx.app.inject({
    method: 'POST',
    url: '/auth/verify-email',
    payload: { token, device: TEST_DEVICE },
  });
  expect(verified.statusCode).toBe(200);
  const session = verified.json();
  return {
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
    profileId: session.profile.id,
  };
}

describe('cadastro', () => {
  it('responde igual para e-mail novo e e-mail já cadastrado (anti-enumeração)', async () => {
    const first = await ctx.app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: EMAIL, password: PASSWORD, displayName: 'Ana' },
    });
    const second = await ctx.app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: EMAIL, password: PASSWORD, displayName: 'Outra pessoa' },
    });

    expect(first.statusCode).toBe(second.statusCode);
    expect(first.json()).toEqual(second.json());
    expect(first.json().status).toBe('ACCEPTED');
  });

  it('reenvia a confirmação quando a conta existe e nunca foi confirmada', async () => {
    // Sem isto a conta fica num beco sem saída: o primeiro link expira, o
    // login recusa com EMAIL_NOT_VERIFIED e não existe como pedir outro.
    await ctx.app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: EMAIL, password: PASSWORD, displayName: 'Ana' },
    });
    const primeiro = lastEmailLink(ctx.mailer);

    await ctx.app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: EMAIL, password: PASSWORD, displayName: 'Ana' },
    });
    const segundo = lastEmailLink(ctx.mailer);

    expect(segundo).not.toBe(primeiro);
    const ultimo = ctx.mailer.outbox?.[ctx.mailer.outbox.length - 1];
    expect(ultimo?.subject).toBe('Confirme seu e-mail');

    // O link novo vale; o antigo morreu junto (um link por vez).
    const antigo = await ctx.app.inject({
      method: 'POST',
      url: '/auth/verify-email',
      payload: { token: primeiro, device: TEST_DEVICE },
    });
    expect(antigo.statusCode).toBe(400);

    const novo = await ctx.app.inject({
      method: 'POST',
      url: '/auth/verify-email',
      payload: { token: segundo, device: TEST_DEVICE },
    });
    expect(novo.statusCode).toBe(200);
  });

  it('avisa em vez de reenviar quando a conta já está confirmada', async () => {
    await registerAndVerify();

    await ctx.app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: EMAIL, password: PASSWORD, displayName: 'Outra pessoa' },
    });

    const ultimo = ctx.mailer.outbox?.[ctx.mailer.outbox.length - 1];
    expect(ultimo?.subject).toBe('Tentativa de cadastro com o seu e-mail');
    // Nada de link: quem já confirmou entra pelo login.
    expect(ultimo?.link).toBeUndefined();
  });

  it('recusa senha curta com envelope de erro', async () => {
    const response = await ctx.app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: EMAIL, password: 'curta', displayName: 'Ana' },
    });
    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(body.requestId).toBeTruthy();
  });
});

describe('confirmação de e-mail', () => {
  it('confirma e já devolve sessão', async () => {
    const session = await registerAndVerify();
    expect(session.accessToken).toBeTruthy();
    expect(session.refreshToken).toContain('.');
  });

  it('o mesmo token não pode ser usado duas vezes (replay)', async () => {
    await ctx.app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: EMAIL, password: PASSWORD, displayName: 'Ana' },
    });
    const token = lastEmailLink(ctx.mailer);

    const first = await ctx.app.inject({
      method: 'POST',
      url: '/auth/verify-email',
      payload: { token, device: TEST_DEVICE },
    });
    const second = await ctx.app.inject({
      method: 'POST',
      url: '/auth/verify-email',
      payload: { token, device: TEST_DEVICE },
    });

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(400);
    expect(second.json().code).toBe('TOKEN_INVALID');
  });
});

describe('login', () => {
  it('entra com credenciais corretas', async () => {
    await registerAndVerify();
    const response = await ctx.app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: EMAIL, password: PASSWORD, device: TEST_DEVICE },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().profile.email).toBe(EMAIL);
  });

  it('responde igual para senha errada e e-mail inexistente', async () => {
    await registerAndVerify();
    const wrongPassword = await ctx.app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: EMAIL, password: 'senha-errada-longa', device: TEST_DEVICE },
    });
    const unknownEmail = await ctx.app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'ninguem@exemplo.com', password: PASSWORD, device: TEST_DEVICE },
    });

    expect(wrongPassword.statusCode).toBe(401);
    expect(unknownEmail.statusCode).toBe(401);
    expect(wrongPassword.json().code).toBe('INVALID_CREDENTIALS');
    expect(unknownEmail.json().code).toBe('INVALID_CREDENTIALS');
    expect(wrongPassword.json().message).toBe(unknownEmail.json().message);
  });

  it('exige e-mail confirmado', async () => {
    await ctx.app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: EMAIL, password: PASSWORD, displayName: 'Ana' },
    });
    const response = await ctx.app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: EMAIL, password: PASSWORD, device: TEST_DEVICE },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().code).toBe('EMAIL_NOT_VERIFIED');
  });

  it('bloqueia a conta após tentativas repetidas', async () => {
    await registerAndVerify();
    for (let attempt = 0; attempt < 8; attempt += 1) {
      await ctx.app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { email: EMAIL, password: 'senha-errada-longa', device: TEST_DEVICE },
      });
    }
    // Agora nem a senha correta entra, enquanto durar o bloqueio.
    const response = await ctx.app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: EMAIL, password: PASSWORD, device: TEST_DEVICE },
    });
    expect(response.statusCode).toBe(401);
    expect(response.json().code).toBe('INVALID_CREDENTIALS');
  });
});

describe('magic link', () => {
  it('responde neutro mesmo para e-mail inexistente', async () => {
    const response = await ctx.app.inject({
      method: 'POST',
      url: '/auth/magic-link',
      payload: { email: 'ninguem@exemplo.com' },
    });
    expect(response.statusCode).toBe(202);
    expect(response.json().status).toBe('ACCEPTED');
    expect(ctx.mailer.outbox).toHaveLength(0);
  });

  it('entrega sessão ao consumir o link', async () => {
    await registerAndVerify();
    await ctx.app.inject({ method: 'POST', url: '/auth/magic-link', payload: { email: EMAIL } });
    const token = lastEmailLink(ctx.mailer);

    const response = await ctx.app.inject({
      method: 'POST',
      url: '/auth/magic-link/consume',
      payload: { token, device: { ...TEST_DEVICE, installationId: 'outra-instalacao' } },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().profile.email).toBe(EMAIL);
  });
});

describe('refresh e revogação', () => {
  it('rotaciona o refresh token a cada uso', async () => {
    const session = await registerAndVerify();
    const response = await ctx.app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken: session.refreshToken },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().refreshToken).not.toBe(session.refreshToken);
  });

  it('reuso de refresh antigo revoga a sessão inteira', async () => {
    const session = await registerAndVerify();
    const rotated = await ctx.app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken: session.refreshToken },
    });
    const novo = rotated.json().refreshToken;

    // Alguém tenta usar o token antigo: indício de roubo.
    const reuse = await ctx.app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken: session.refreshToken },
    });
    expect(reuse.statusCode).toBe(401);
    expect(reuse.json().code).toBe('SESSION_REVOKED');

    // E o token legítimo também deixa de valer — a sessão foi encerrada.
    const afterRevoke = await ctx.app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken: novo },
    });
    expect(afterRevoke.statusCode).toBe(401);
  });

  it('logout revoga a sessão e invalida o access token', async () => {
    const session = await registerAndVerify();

    const before = await ctx.app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { authorization: `Bearer ${session.accessToken}` },
    });
    expect(before.statusCode).toBe(200);

    await ctx.app.inject({
      method: 'POST',
      url: '/auth/logout',
      payload: { refreshToken: session.refreshToken },
    });

    // Sem esperar o token expirar: a sessão é revalidada a cada request.
    const after = await ctx.app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { authorization: `Bearer ${session.accessToken}` },
    });
    expect(after.statusCode).toBe(401);
    expect(after.json().code).toBe('SESSION_REVOKED');
  });
});

describe('rotas autenticadas', () => {
  it('exige token', async () => {
    const response = await ctx.app.inject({ method: 'GET', url: '/auth/me' });
    expect(response.statusCode).toBe(401);
    expect(response.json().code).toBe('AUTH_REQUIRED');
  });

  it('recusa token forjado', async () => {
    const response = await ctx.app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { authorization: 'Bearer nao.e.um.jwt' },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe('TOKEN_INVALID');
  });

  it('lista e revoga sessões do próprio usuário', async () => {
    const session = await registerAndVerify();
    await ctx.app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: {
        email: EMAIL,
        password: PASSWORD,
        device: { ...TEST_DEVICE, installationId: 'segundo-aparelho', name: 'Android de Ana' },
      },
    });

    const list = await ctx.app.inject({
      method: 'GET',
      url: '/auth/sessions',
      headers: { authorization: `Bearer ${session.accessToken}` },
    });
    expect(list.statusCode).toBe(200);
    const items = list.json().items;
    expect(items).toHaveLength(2);
    expect(items.filter((item: { current: boolean }) => item.current)).toHaveLength(1);

    const other = items.find((item: { current: boolean }) => !item.current);
    const revoked = await ctx.app.inject({
      method: 'DELETE',
      url: `/auth/sessions/${other.id}`,
      headers: { authorization: `Bearer ${session.accessToken}` },
    });
    expect(revoked.statusCode).toBe(200);
    expect(revoked.json().revoked).toBe(true);
  });

  it('não revoga sessão de outra pessoa', async () => {
    const ana = await registerAndVerify('ana@exemplo.com');
    const bruno = await registerAndVerify('bruno@exemplo.com');

    const brunoSessions = await ctx.app.inject({
      method: 'GET',
      url: '/auth/sessions',
      headers: { authorization: `Bearer ${bruno.accessToken}` },
    });
    const brunoSessionId = brunoSessions.json().items[0].id;

    const attempt = await ctx.app.inject({
      method: 'DELETE',
      url: `/auth/sessions/${brunoSessionId}`,
      headers: { authorization: `Bearer ${ana.accessToken}` },
    });
    expect(attempt.statusCode).toBe(404);
    expect(attempt.json().revoked).toBe(false);
  });
});

describe('health', () => {
  it('reporta o estado do banco', async () => {
    const response = await ctx.app.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: 'ok', checks: { database: 'ok' } });
  });

  it('devolve x-request-id em toda resposta', async () => {
    const response = await ctx.app.inject({
      method: 'GET',
      url: '/health',
      headers: { 'x-request-id': 'correlacao-de-teste' },
    });
    expect(response.headers['x-request-id']).toBe('correlacao-de-teste');
  });
});
