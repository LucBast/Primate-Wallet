import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { DomainError } from '@ff/domain';
import { apiErrorSchema } from '@ff/api-contracts';
import { httpStatusFor, toApiError } from './error-handler.js';

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
