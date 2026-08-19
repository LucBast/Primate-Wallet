/**
 * O que estes testes protegem: a ponte entrega HTML com um deep link clicável,
 * a lista de rotas é fechada (não vira redirecionador aberto), o token não
 * escapa do atributo e a página não carrega cabeçalho que permita cache.
 */

import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { registerLinkBridge } from './link-bridge.js';
import { resolveAppLinkBase, APP_LINK_BASE } from './server.js';

const TOKEN = 'a'.repeat(43);

describe('ponte de link do e-mail', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    app = Fastify();
    registerLinkBridge(app);
  });

  afterEach(async () => {
    await app.close();
  });

  it('devolve uma página com o deep link da rota pedida', async () => {
    const response = await app.inject({ url: `/abrir/verificar-email?token=${TOKEN}` });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/html');
    expect(response.body).toContain(`href="familyfinance://verificar-email?token=${TOKEN}"`);
    expect(response.body).toContain('Confirmar no app');
  });

  it('atende as quatro rotas que os e-mails usam', async () => {
    for (const rota of ['verificar-email', 'entrar', 'senha-nova', 'convite']) {
      const response = await app.inject({ url: `/abrir/${rota}?token=${TOKEN}` });
      expect(response.statusCode, rota).toBe(200);
      expect(response.body, rota).toContain(`href="familyfinance://${rota}?token=`);
    }
  });

  it('recusa rota fora da lista, para não virar redirecionador aberto', async () => {
    const response = await app.inject({ url: `/abrir/qualquer-coisa?token=${TOKEN}` });

    expect(response.statusCode).toBe(400);
    expect(response.body).not.toContain('familyfinance://qualquer-coisa');
    expect(response.body).toContain('Link inválido');
  });

  it('recusa token com caractere fora do alfabeto base64url', async () => {
    const response = await app.inject({
      url: '/abrir/entrar?token=' + encodeURIComponent('a"><b'),
    });

    expect(response.statusCode).toBe(400);
    expect(response.body).not.toContain('a"><b');
    expect(response.body).not.toContain('familyfinance://');
  });

  it('recusa token ausente ou curto demais', async () => {
    expect((await app.inject({ url: '/abrir/entrar' })).statusCode).toBe(400);
    expect((await app.inject({ url: '/abrir/entrar?token=abc' })).statusCode).toBe(400);
  });

  it('proíbe cache e indexação: a URL carrega um token de uso único', async () => {
    const response = await app.inject({ url: `/abrir/convite?token=${TOKEN}` });

    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['x-robots-tag']).toContain('noindex');
  });

  it('não consome o token: abrir duas vezes dá a mesma página', async () => {
    // Antivírus de e-mail abre todo link da mensagem antes de a pessoa ler.
    const first = await app.inject({ url: `/abrir/verificar-email?token=${TOKEN}` });
    const second = await app.inject({ url: `/abrir/verificar-email?token=${TOKEN}` });

    expect(second.statusCode).toBe(200);
    expect(second.body).toBe(first.body);
  });
});

describe('base dos links de e-mail', () => {
  it('usa a ponte https quando há URL pública', () => {
    expect(resolveAppLinkBase('https://api.exemplo.app')).toBe('https://api.exemplo.app/abrir');
  });

  it('cai no deep link cru sem URL pública (só desenvolvimento)', () => {
    expect(resolveAppLinkBase('')).toBe(APP_LINK_BASE);
  });
});
