import { describe, expect, it, vi, beforeEach } from 'vitest';
import { z } from 'zod';
import { DomainError } from '@ff/domain';
import { apiErrorSchema } from '@ff/api-contracts';
import { httpStatusFor, registerErrorHandler, toApiError } from './error-handler.js';

vi.mock('@sentry/node', () => ({ captureException: vi.fn() }));
const { captureException } = await import('@sentry/node');

const REQUEST_ID = '11111111-2222-3333-4444-555555555555';

describe('toApiError (docs/09 §2)', () => {
  it('converte DomainError preservando código e detalhes', () => {
    const error = new DomainError('OUTSTANDING_AMOUNT_EXCEEDED', { outstandingMinor: 60_000 });
    const body = toApiError(error, REQUEST_ID);
    expect(apiErrorSchema.parse(body)).toEqual({
      code: 'OUTSTANDING_AMOUNT_EXCEEDED',
      message: 'O valor informado excede o saldo em aberto.',
      details: { outstandingMinor: 60_000 },
      requestId: REQUEST_ID,
    });
    expect(httpStatusFor(error)).toBe(422);
  });

  it('converte erro de validação Zod', () => {
    const result = z.object({ valorMinor: z.int() }).safeParse({ valorMinor: 1.5 });
    expect(result.success).toBe(false);
    const body = toApiError(result.error, REQUEST_ID);
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(httpStatusFor(result.error)).toBe(400);
  });

  it('não vaza detalhe de erro inesperado', () => {
    const body = toApiError(new Error('conexão recusada em 10.0.0.5:5432'), REQUEST_ID);
    expect(body).toEqual({
      code: 'INTERNAL_ERROR',
      message: 'Não foi possível concluir agora. Tente de novo.',
      requestId: REQUEST_ID,
    });
    expect(JSON.stringify(body)).not.toContain('10.0.0.5');
  });

  it('mapeia rate limit e 404 do Fastify', () => {
    expect(toApiError({ statusCode: 429 }, REQUEST_ID).code).toBe('RATE_LIMITED');
    expect(toApiError({ statusCode: 404 }, REQUEST_ID).code).toBe('NOT_FOUND');
    expect(toApiError({ statusCode: 400 }, REQUEST_ID).code).toBe('VALIDATION_ERROR');
    expect(toApiError({ statusCode: 502 }, REQUEST_ID).code).toBe('INTERNAL_ERROR');
  });
});

describe('registerErrorHandler e o Sentry', () => {
  // O handler responde ao cliente e ENCERRA o erro: nada sobe para os handlers
  // globais do processo. Se a captura explícita sumir, o Sentry vira enfeite —
  // continua recebendo queda de container e nunca um 500 de rota. Daí o teste.
  function capturarHandler() {
    let handler: unknown;
    registerErrorHandler({
      setErrorHandler: (fn: unknown) => {
        handler = fn;
      },
      setNotFoundHandler: () => undefined,
    } as never);
    return handler as (erro: unknown, req: unknown, reply: unknown) => void;
  }

  const request = {
    id: REQUEST_ID,
    method: 'POST',
    url: '/households/9f1c/expenses?busca=mercado',
    routeOptions: { url: '/households/:householdId/expenses' },
    log: { error: vi.fn(), info: vi.fn() },
  };
  const reply = { status: () => reply, send: () => reply };

  beforeEach(() => {
    vi.mocked(captureException).mockClear();
  });

  it('reporta 5xx com o padrão da rota, nunca a URL concreta', () => {
    capturarHandler()(new Error('conexão recusada em 10.0.0.5:5432'), request, reply);

    expect(captureException).toHaveBeenCalledTimes(1);
    const [erro, escopo] = vi.mocked(captureException).mock.calls[0]!;
    expect((erro as Error).message).toContain('10.0.0.5');
    expect(escopo?.tags).toEqual({
      code: 'INTERNAL_ERROR',
      method: 'POST',
      route: '/households/:householdId/expenses',
    });
    expect(JSON.stringify(escopo)).not.toContain('9f1c');
    expect(JSON.stringify(escopo)).not.toContain('mercado');
  });

  it('não reporta 4xx: regra de negócio negada é fluxo esperado', () => {
    capturarHandler()(new DomainError('OUTSTANDING_AMOUNT_EXCEEDED'), request, reply);
    expect(captureException).not.toHaveBeenCalled();
  });
});
