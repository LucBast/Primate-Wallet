import { describe, expect, it } from 'vitest';
import { DOMAIN_ERROR_CODES } from '@ff/domain';
import { apiErrorHasCode, apiErrorSchema, isApiError } from './error.js';
import { deviceInfoSchema, loginRequestSchema, registerRequestSchema } from './auth.js';

const device = {
  installationId: 'install-abc-123',
  platform: 'ios' as const,
  name: 'iPhone de Ana',
  appVersion: '0.1.0',
};

describe('apiErrorSchema (docs/09 §2)', () => {
  it('valida o envelope de erro do pacote', () => {
    const payload = {
      code: 'OUTSTANDING_AMOUNT_EXCEEDED',
      message: 'O valor informado excede o saldo em aberto.',
      details: { outstandingMinor: 60000 },
      requestId: '3f0d1f9a-2b6e-4c5d-9a1b-2c3d4e5f6a7b',
    };
    expect(apiErrorSchema.parse(payload)).toEqual(payload);
    expect(isApiError(payload)).toBe(true);
    expect(apiErrorHasCode(payload, 'OUTSTANDING_AMOUNT_EXCEEDED')).toBe(true);
    expect(apiErrorHasCode(payload, 'VERSION_CONFLICT')).toBe(false);
  });

  it('rejeita código fora da lista tipada', () => {
    expect(isApiError({ code: 'ALGO_INVENTADO', message: 'x', requestId: 'r' })).toBe(false);
  });

  it('cobre todos os códigos mínimos exigidos pelo pacote', () => {
    const required = [
      'AUTH_REQUIRED',
      'FORBIDDEN',
      'HOUSEHOLD_NOT_FOUND',
      'ACCOUNT_NOT_FOUND',
      'ACCOUNT_ARCHIVED',
      'INVALID_ACCOUNT_TYPE',
      'OUTSTANDING_AMOUNT_EXCEEDED',
      'ALREADY_SETTLED',
      'VERSION_CONFLICT',
      'DUPLICATE_IDEMPOTENCY_KEY',
      'INVALID_ALLOCATION_TOTAL',
      'STATEMENT_ALREADY_PAID',
      'INSUFFICIENT_PERMISSION',
      'APPROVAL_REQUIRED',
      'TRANSACTION_ALREADY_REVERSED',
      'OFFLINE_OPERATION_REJECTED',
    ];
    for (const code of required) {
      expect(DOMAIN_ERROR_CODES).toContain(code);
    }
  });
});

describe('contratos de auth', () => {
  it('normaliza e-mail e exige senha longa no registro', () => {
    const parsed = registerRequestSchema.parse({
      email: '  Ana@Exemplo.COM ',
      password: 'senha-bem-longa',
      displayName: ' Ana ',
    });
    expect(parsed.email).toBe('ana@exemplo.com');
    expect(parsed.displayName).toBe('Ana');
    expect(() =>
      registerRequestSchema.parse({ email: 'a@b.com', password: 'curta', displayName: 'Ana' }),
    ).toThrow();
  });

  it('login exige identificação do aparelho (sessão revogável)', () => {
    expect(
      loginRequestSchema.parse({ email: 'ana@exemplo.com', password: 'x', device }),
    ).toBeTruthy();
    expect(() => loginRequestSchema.parse({ email: 'ana@exemplo.com', password: 'x' })).toThrow();
    expect(() => deviceInfoSchema.parse({ ...device, platform: 'windows' })).toThrow();
  });
});
