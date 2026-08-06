/**
 * O limitador roda desligado nas demais suítes; aqui ele é ligado de propósito
 * para provar que endpoints com credenciais têm limite estrito e que a resposta
 * sai no envelope do pacote.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeAdminPool, createTestContext, truncateAll, type TestContext } from './helpers.js';

let ctx: TestContext;

beforeAll(async () => {
  ctx = await createTestContext({ enableRateLimit: true });
  await truncateAll();
});

afterAll(async () => {
  await ctx.close();
  await closeAdminPool();
});

describe('rate limit', () => {
  it('bloqueia excesso de tentativas de login com código RATE_LIMITED', async () => {
    const attempt = () =>
      ctx.app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: {
          email: 'ninguem@exemplo.com',
          password: 'senha-qualquer-longa',
          device: {
            installationId: 'installation-rate-limit',
            platform: 'ios',
            name: 'iPhone',
            appVersion: '0.1.0',
          },
        },
      });

    let limited: Awaited<ReturnType<typeof attempt>> | undefined;
    for (let index = 0; index < 12; index += 1) {
      const response = await attempt();
      if (response.statusCode === 429) {
        limited = response;
        break;
      }
    }

    expect(limited).toBeDefined();
    expect(limited?.json()).toMatchObject({ code: 'RATE_LIMITED' });
    expect(limited?.json().requestId).toBeTruthy();
  });
});
