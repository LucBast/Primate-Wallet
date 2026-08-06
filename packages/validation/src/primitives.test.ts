import { describe, expect, it } from 'vitest';
import {
  idempotencyKeySchema,
  isoDateSchema,
  minorUnitsSchema,
  paginated,
  passwordSchema,
  positiveMinorUnitsSchema,
} from './primitives.js';
import { z } from 'zod';

describe('minorUnitsSchema', () => {
  it('aceita centavos inteiros', () => {
    expect(minorUnitsSchema.parse(12_590)).toBe(12_590);
    expect(minorUnitsSchema.parse(0)).toBe(0);
    expect(minorUnitsSchema.parse(-500)).toBe(-500);
  });

  it('rejeita valores fracionários — a barreira contra "reais" na API', () => {
    expect(() => minorUnitsSchema.parse(125.9)).toThrow();
    expect(() => minorUnitsSchema.parse('1000')).toThrow();
    expect(() => positiveMinorUnitsSchema.parse(0)).toThrow();
  });
});

describe('isoDateSchema', () => {
  it('aceita YYYY-MM-DD válido e rejeita o resto', () => {
    expect(isoDateSchema.parse('2026-08-06')).toBe('2026-08-06');
    expect(() => isoDateSchema.parse('06/08/2026')).toThrow();
    expect(() => isoDateSchema.parse('2026-02-30')).toThrow();
  });
});

describe('idempotencyKeySchema', () => {
  it('aceita chave opaca com tamanho suficiente', () => {
    expect(idempotencyKeySchema.parse('7f1c2e4a-1b2c-4d5e-8f90-abcdef012345')).toBeTruthy();
  });

  it('rejeita chave curta ou com caracteres inválidos', () => {
    expect(() => idempotencyKeySchema.parse('curta')).toThrow();
    expect(() => idempotencyKeySchema.parse('chave com espaço e mais texto')).toThrow();
  });
});

describe('passwordSchema', () => {
  it('exige ao menos 10 caracteres', () => {
    expect(() => passwordSchema.parse('123456789')).toThrow();
    expect(passwordSchema.parse('senha-bem-longa')).toBe('senha-bem-longa');
  });
});

describe('paginated', () => {
  it('modela lista por cursor (docs/09 §11)', () => {
    const schema = paginated(z.object({ id: z.string() }));
    expect(schema.parse({ items: [{ id: 'a' }], nextCursor: null })).toEqual({
      items: [{ id: 'a' }],
      nextCursor: null,
    });
    expect(() => schema.parse({ items: [] })).toThrow();
  });
});
