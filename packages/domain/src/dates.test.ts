import { describe, expect, it } from 'vitest';
import {
  addDays,
  addMonths,
  compareIsoDate,
  DateError,
  differenceInDays,
  familyToday,
  formatDate,
  isIsoDate,
  isoDate,
  monthRange,
  toIsoDate,
} from './dates.js';

describe('isoDate', () => {
  it('aceita datas de calendário válidas', () => {
    expect(isoDate('2026-08-06')).toBe('2026-08-06');
    expect(isIsoDate('2024-02-29')).toBe(true);
  });

  it('rejeita datas inexistentes ou malformadas', () => {
    expect(isIsoDate('2026-02-30')).toBe(false);
    expect(isIsoDate('2026-13-01')).toBe(false);
    expect(isIsoDate('06/08/2026')).toBe(false);
    expect(isIsoDate(20260806)).toBe(false);
    expect(() => isoDate('2026-2-6')).toThrow(DateError);
  });
});

describe('familyToday', () => {
  it('usa o fuso da família, não UTC', () => {
    // 2026-08-07T01:30Z ainda é 06/08 em São Paulo (UTC−3).
    const instant = new Date('2026-08-07T01:30:00.000Z');
    expect(familyToday('America/Sao_Paulo', instant)).toBe('2026-08-06');
    expect(familyToday('UTC', instant)).toBe('2026-08-07');
    expect(familyToday('Asia/Tokyo', instant)).toBe('2026-08-07');
  });

  it('rejeita fuso inválido', () => {
    expect(() => familyToday('Nao/Existe')).toThrow(DateError);
  });

  it('toIsoDate usa o fuso informado', () => {
    expect(toIsoDate(new Date('2026-01-01T02:00:00.000Z'), 'America/Sao_Paulo')).toBe('2025-12-31');
  });
});

describe('aritmética de datas', () => {
  it('soma dias atravessando meses e anos', () => {
    expect(addDays(isoDate('2026-08-31'), 1)).toBe('2026-09-01');
    expect(addDays(isoDate('2026-01-01'), -1)).toBe('2025-12-31');
    expect(() => addDays(isoDate('2026-01-01'), 1.5)).toThrow(DateError);
  });

  it('soma meses preservando o fim de mês', () => {
    expect(addMonths(isoDate('2026-01-31'), 1)).toBe('2026-02-28');
    expect(addMonths(isoDate('2024-01-31'), 1)).toBe('2024-02-29');
    expect(addMonths(isoDate('2026-03-15'), -3)).toBe('2025-12-15');
    expect(addMonths(isoDate('2026-12-15'), 1)).toBe('2027-01-15');
    expect(() => addMonths(isoDate('2026-01-01'), 0.5)).toThrow(DateError);
  });

  it('calcula diferença e ordem', () => {
    expect(differenceInDays(isoDate('2026-08-01'), isoDate('2026-08-06'))).toBe(5);
    expect(compareIsoDate(isoDate('2026-08-01'), isoDate('2026-08-06'))).toBe(-1);
    expect(compareIsoDate(isoDate('2026-08-06'), isoDate('2026-08-01'))).toBe(1);
    expect(compareIsoDate(isoDate('2026-08-06'), isoDate('2026-08-06'))).toBe(0);
  });

  it('não é afetado por horário de verão', () => {
    // Faixa que historicamente continha transições de DST no Brasil.
    expect(differenceInDays(isoDate('2018-10-01'), isoDate('2018-11-01'))).toBe(31);
    expect(addDays(isoDate('2018-11-03'), 1)).toBe('2018-11-04');
  });

  it('devolve o intervalo do mês de competência', () => {
    expect(monthRange(isoDate('2026-02-10'))).toEqual({ start: '2026-02-01', end: '2026-02-28' });
    expect(monthRange(isoDate('2026-08-06'))).toEqual({ start: '2026-08-01', end: '2026-08-31' });
  });
});

describe('formatDate', () => {
  it('formata em pt-BR', () => {
    expect(formatDate(isoDate('2026-08-06'))).toBe('06/08/2026');
  });
});
