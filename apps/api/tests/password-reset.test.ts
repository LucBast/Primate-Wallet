/**
 * Recuperação de acesso (docs/07 §3, tela obrigatória; docs/10 §2).
 *
 * Antes disto, "Esqueci a senha" na tela 6a disparava um MAGIC LINK: a pessoa
 * pedia para trocar a senha e recebia um link de entrada, sem nunca poder
 * trocar a senha de fato. A copy prometia uma coisa e o app fazia outra.
 *
 * O que precisa ficar provado:
 *  - a resposta é neutra: e-mail cadastrado e não cadastrado são idênticos;
 *  - o link troca a senha de verdade, e a antiga para de funcionar;
 *  - redefinir DERRUBA as outras sessões — quem redefine costuma estar
 *    reagindo a um acesso indevido;
 *  - o token é de uso único e o pedido novo invalida o anterior.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  closeAdminPool,
  createTestContext,
  lastEmailLink,
  registerUser,
  TEST_DEVICE,
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

const SENHA_NOVA = 'senha-nova-bem-longa';

function pedir(email: string) {
  return ctx.app.inject({ method: 'POST', url: '/auth/password-reset', payload: { email } });
}

function consumir(token: string, password = SENHA_NOVA, installationId = 'novo-aparelho-1') {
  return ctx.app.inject({
    method: 'POST',
    url: '/auth/password-reset/consume',
    payload: { token, password, device: { ...TEST_DEVICE, installationId } },
  });
}

function entrar(email: string, password: string, installationId = 'login-teste-1') {
  return ctx.app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { email, password, device: { ...TEST_DEVICE, installationId } },
  });
}

describe('pedido de recuperação', () => {
  it('responde igual para e-mail cadastrado e para desconhecido', async () => {
    await registerUser(ctx, 'ana@exemplo.com', 'Ana');
    ctx.mailer.outbox?.splice(0, ctx.mailer.outbox.length);

    const cadastrado = await pedir('ana@exemplo.com');
    const desconhecido = await pedir('ninguem@exemplo.com');

    expect(cadastrado.statusCode).toBe(202);
    expect(desconhecido.statusCode).toBe(202);
    expect(cadastrado.json()).toEqual(desconhecido.json());
    // E, ainda assim, só o cadastrado recebe e-mail.
    expect(ctx.mailer.outbox).toHaveLength(1);
  });

  it('pedir de novo invalida o link anterior', async () => {
    await registerUser(ctx, 'ana@exemplo.com', 'Ana');
    ctx.mailer.outbox?.splice(0, ctx.mailer.outbox.length);

    await pedir('ana@exemplo.com');
    const primeiro = lastEmailLink(ctx.mailer);
    await pedir('ana@exemplo.com');
    const segundo = lastEmailLink(ctx.mailer);
    expect(primeiro).not.toBe(segundo);

    const velho = await consumir(primeiro);
    expect(velho.statusCode).toBe(400);
    expect(velho.json().code).toBe('TOKEN_INVALID');

    expect((await consumir(segundo)).statusCode).toBe(200);
  });
});

describe('troca da senha', () => {
  it('a senha nova entra e a antiga para de funcionar', async () => {
    const ana = await registerUser(ctx, 'ana@exemplo.com', 'Ana');
    ctx.mailer.outbox?.splice(0, ctx.mailer.outbox.length);

    await pedir('ana@exemplo.com');
    const resposta = await consumir(lastEmailLink(ctx.mailer));
    expect(resposta.statusCode).toBe(200);
    // Devolve sessão pronta: quem acabou de provar posse do e-mail já entra.
    expect(resposta.json().profile.email).toBe('ana@exemplo.com');
    expect(resposta.json().accessToken).toBeTruthy();

    const comNova = await entrar('ana@exemplo.com', SENHA_NOVA, 'depois-1');
    expect(comNova.statusCode).toBe(200);

    const comAntiga = await entrar('ana@exemplo.com', 'senha-de-teste-longa', 'depois-2');
    expect(comAntiga.statusCode).toBe(401);
    expect(comAntiga.json().code).toBe('INVALID_CREDENTIALS');

    // A sessão que existia antes da troca foi derrubada.
    const antiga = await ctx.app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { authorization: `Bearer ${ana.accessToken}` },
    });
    expect([401, 403]).toContain(antiga.statusCode);
  });

  it('o token é de uso único', async () => {
    await registerUser(ctx, 'ana@exemplo.com', 'Ana');
    ctx.mailer.outbox?.splice(0, ctx.mailer.outbox.length);

    await pedir('ana@exemplo.com');
    const token = lastEmailLink(ctx.mailer);
    expect((await consumir(token)).statusCode).toBe(200);

    const repetido = await consumir(token, 'outra-senha-bem-longa', 'terceiro-1');
    expect(repetido.statusCode).toBe(400);
    expect(repetido.json().code).toBe('TOKEN_INVALID');
  });

  it('senha fraca é recusada pelo contrato, não gravada', async () => {
    await registerUser(ctx, 'ana@exemplo.com', 'Ana');
    ctx.mailer.outbox?.splice(0, ctx.mailer.outbox.length);

    await pedir('ana@exemplo.com');
    const token = lastEmailLink(ctx.mailer);
    const fraca = await consumir(token, '123');
    expect(fraca.statusCode).toBe(400);
    expect(fraca.json().code).toBe('VALIDATION_ERROR');

    // E o token continua válido: a pessoa erra a senha e tenta de novo.
    expect((await consumir(token)).statusCode).toBe(200);
  });
});
