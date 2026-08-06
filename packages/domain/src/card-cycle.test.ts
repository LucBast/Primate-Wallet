import { describe, expect, it } from 'vitest';
import { isoDate } from './dates.js';
import {
  CardCycleError,
  cycleForPurchase,
  cyclesForInstallments,
  nextCycle,
} from './card-cycle.js';

describe('cycleForPurchase', () => {
  it('compra antes do fechamento entra na fatura que fecha neste mês', () => {
    // Fecha dia 10, vence dia 15.
    expect(cycleForPurchase(isoDate('2026-08-05'), 10, 15)).toEqual({
      cycleStart: '2026-07-11',
      cycleEnd: '2026-08-10',
      closingDate: '2026-08-10',
      dueDate: '2026-08-15',
    });
  });

  it('compra no dia do fechamento entra na fatura que fecha naquele dia', () => {
    expect(cycleForPurchase(isoDate('2026-08-10'), 10, 15).closingDate).toBe('2026-08-10');
  });

  it('compra depois do fechamento entra na fatura do mês seguinte', () => {
    expect(cycleForPurchase(isoDate('2026-08-11'), 10, 15)).toEqual({
      cycleStart: '2026-08-11',
      cycleEnd: '2026-09-10',
      closingDate: '2026-09-10',
      dueDate: '2026-09-15',
    });
  });

  it('vencimento antes do fechamento cai no mês seguinte', () => {
    // Fecha dia 25, vence dia 5: o vencimento é sempre no mês seguinte.
    expect(cycleForPurchase(isoDate('2026-08-20'), 25, 5).dueDate).toBe('2026-09-05');
  });

  it('respeita meses curtos no dia de fechamento', () => {
    // Fecha dia 31: em fevereiro, fecha no dia 28.
    expect(cycleForPurchase(isoDate('2026-02-15'), 31, 10).closingDate).toBe('2026-02-28');
  });

  it('recusa dias fora da faixa', () => {
    expect(() => cycleForPurchase(isoDate('2026-08-05'), 0, 15)).toThrow(CardCycleError);
    expect(() => cycleForPurchase(isoDate('2026-08-05'), 10, 32)).toThrow(CardCycleError);
  });
});

describe('nextCycle', () => {
  it('avança um mês', () => {
    const first = cycleForPurchase(isoDate('2026-08-05'), 10, 15);
    expect(nextCycle(first, 10, 15)).toEqual({
      cycleStart: '2026-08-11',
      cycleEnd: '2026-09-10',
      closingDate: '2026-09-10',
      dueDate: '2026-09-15',
    });
  });
});

describe('cyclesForInstallments', () => {
  it('distribui as parcelas em ciclos consecutivos', () => {
    const cycles = cyclesForInstallments(isoDate('2026-08-05'), 10, 15, 3);
    expect(cycles.map((cycle) => cycle.closingDate)).toEqual([
      '2026-08-10',
      '2026-09-10',
      '2026-10-10',
    ]);
    expect(cycles.map((cycle) => cycle.dueDate)).toEqual([
      '2026-08-15',
      '2026-09-15',
      '2026-10-15',
    ]);
  });

  it('recusa contagem inválida', () => {
    expect(() => cyclesForInstallments(isoDate('2026-08-05'), 10, 15, 0)).toThrow(CardCycleError);
    expect(() => cyclesForInstallments(isoDate('2026-08-05'), 10, 15, 200)).toThrow(CardCycleError);
  });
});
