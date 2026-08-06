import { describe, expect, it } from 'vitest';
import {
  add,
  allocate,
  formatMoney,
  minor,
  MoneyError,
  multiply,
  parseMoney,
  percentage,
  splitInstallments,
  subtract,
} from './money.js';

describe('minor', () => {
  it('aceita inteiros e rejeita ponto flutuante', () => {
    expect(minor(12590)).toBe(12590);
    expect(() => minor(125.9)).toThrow(MoneyError);
    expect(() => minor(Number.NaN)).toThrow(MoneyError);
    expect(() => minor(Number.MAX_SAFE_INTEGER + 2)).toThrow(MoneyError);
  });

  it('usa a menor unidade conforme docs/04 §1', () => {
    expect(minor(1000)).toBe(1000); // R$ 10,00
    expect(minor(12590)).toBe(12590); // R$ 125,90
  });
});

describe('aritmética', () => {
  it('soma e subtrai sem erro de ponto flutuante', () => {
    // 0.1 + 0.2 !== 0.3 em float; em centavos é exato.
    expect(add(minor(10), minor(20))).toBe(30);
    expect(subtract(minor(30), minor(10))).toBe(20);
  });

  it('multiplica apenas por fatores inteiros', () => {
    expect(multiply(minor(1500), 3)).toBe(4500);
    expect(() => multiply(minor(1500), 1.5)).toThrow(MoneyError);
  });
});

describe('percentage (basis points)', () => {
  it('calcula percentuais com arredondamento half-up', () => {
    expect(percentage(minor(10_000), 1000)).toBe(1000); // 10% de R$ 100,00
    expect(percentage(minor(333), 5000)).toBe(167); // 50% de 3,33 → 1,665 → 1,67
    expect(percentage(minor(-333), 5000)).toBe(-167);
  });

  it('rejeita basis points fracionários', () => {
    expect(() => percentage(minor(100), 12.5)).toThrow(MoneyError);
  });
});

describe('allocate (rateio)', () => {
  it('a soma das partes é exatamente o total (docs/04 §12)', () => {
    const parts = allocate(minor(10_000), [1, 1, 1]);
    expect(parts).toEqual([3334, 3333, 3333]);
    expect(parts.reduce<number>((a, b) => a + b, 0)).toBe(10_000);
  });

  it('distribui por pesos desiguais mantendo o total', () => {
    const parts = allocate(minor(100_00), [70, 30]);
    expect(parts).toEqual([7000, 3000]);
  });

  it('é determinístico em empates de resto', () => {
    expect(allocate(minor(101), [1, 1])).toEqual([51, 50]);
    expect(allocate(minor(101), [1, 1])).toEqual([51, 50]);
  });

  it('preserva o sinal em valores negativos', () => {
    const parts = allocate(minor(-10_000), [1, 1, 1]);
    expect(parts.reduce<number>((a, b) => a + b, 0)).toBe(-10_000);
  });

  it('rejeita pesos inválidos', () => {
    expect(() => allocate(minor(100), [])).toThrow(MoneyError);
    expect(() => allocate(minor(100), [0, 0])).toThrow(MoneyError);
    expect(() => allocate(minor(100), [-1, 2])).toThrow(MoneyError);
  });

  it('fecha o total para uma faixa ampla de valores e pesos', () => {
    for (let total = 0; total <= 500; total += 7) {
      for (let n = 1; n <= 7; n += 1) {
        const weights = Array.from({ length: n }, (_, i) => i + 1);
        const sum = allocate(minor(total), weights).reduce<number>((a, b) => a + b, 0);
        expect(sum).toBe(total);
      }
    }
  });
});

describe('splitInstallments (parcelamento)', () => {
  it('coloca a diferença de centavos na última parcela (docs/04 §10)', () => {
    expect(splitInstallments(minor(10_000), 3)).toEqual([3333, 3333, 3334]);
  });

  it('soma das parcelas é igual ao valor original', () => {
    for (let total = 0; total <= 1000; total += 13) {
      for (let n = 1; n <= 12; n += 1) {
        const parcels = splitInstallments(minor(total), n);
        expect(parcels).toHaveLength(n);
        expect(parcels.reduce<number>((a, b) => a + b, 0)).toBe(total);
      }
    }
  });

  it('rejeita contagem inválida', () => {
    expect(() => splitInstallments(minor(100), 0)).toThrow(MoneyError);
    expect(() => splitInstallments(minor(100), 2.5)).toThrow(MoneyError);
  });
});

describe('formatMoney', () => {
  it('formata em pt-BR com separadores corretos', () => {
    // O Intl usa NBSP entre "R$" e o número; normalizamos para comparar.
    const NBSP = String.fromCharCode(0x00a0);
    const normalize = (value: string) => value.replaceAll(NBSP, ' ');
    expect(normalize(formatMoney(minor(124_805)))).toBe('R$ 1.248,05');
    expect(normalize(formatMoney(minor(0)))).toBe('R$ 0,00');
    expect(normalize(formatMoney(minor(-53_450)))).toBe('−R$ 534,50');
    expect(normalize(formatMoney(minor(53_450), { signDisplay: 'always' }))).toBe('+R$ 534,50');
    expect(formatMoney(minor(124_805), { symbol: false })).toBe('1.248,05');
    expect(normalize(formatMoney(minor(-100), { signDisplay: 'never' }))).toBe('R$ 1,00');
  });
});

describe('parseMoney', () => {
  it('lê entradas pt-BR', () => {
    expect(parseMoney('1.248,05')).toBe(124_805);
    expect(parseMoney('R$ 1.248,05')).toBe(124_805);
    expect(parseMoney('534,5')).toBe(53_450);
    expect(parseMoney('7')).toBe(700);
    expect(parseMoney(',5')).toBe(50);
    expect(parseMoney('-10,00')).toBe(-1000);
  });

  it('rejeita entradas inválidas', () => {
    expect(() => parseMoney('')).toThrow(MoneyError);
    expect(() => parseMoney('abc')).toThrow(MoneyError);
    expect(() => parseMoney('1,2,3')).toThrow(MoneyError);
    expect(() => parseMoney('1,234')).toThrow(MoneyError);
  });

  it('faz round-trip com formatMoney', () => {
    for (const cents of [0, 1, 99, 100, 12_590, 1_000_000]) {
      expect(parseMoney(formatMoney(minor(cents)))).toBe(cents);
    }
  });
});
