import { describe, expect, it } from 'vitest';
import { isoDate } from './dates.js';
import {
  describeRecurrence,
  generateOccurrences,
  nextOccurrence,
  RecurrenceError,
} from './recurrence.js';

describe('generateOccurrences', () => {
  it('gera ocorrências diárias com intervalo', () => {
    expect(
      generateOccurrences({ frequency: 'DAILY', interval: 3, startDate: isoDate('2026-08-01') }, 4),
    ).toEqual(['2026-08-01', '2026-08-04', '2026-08-07', '2026-08-10']);
  });

  it('gera ocorrências mensais preservando o dia pedido', () => {
    // Dia 31 cai no último dia dos meses curtos e VOLTA para 31 depois.
    expect(
      generateOccurrences(
        { frequency: 'MONTHLY', interval: 1, startDate: isoDate('2026-01-31'), dayOfMonth: 31 },
        4,
      ),
    ).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
  });

  it('gera ocorrências semanais em dias específicos', () => {
    // 2026-08-03 é uma segunda-feira.
    expect(
      generateOccurrences(
        {
          frequency: 'WEEKLY',
          interval: 1,
          startDate: isoDate('2026-08-03'),
          daysOfWeek: [1, 4],
        },
        4,
      ),
    ).toEqual(['2026-08-03', '2026-08-06', '2026-08-10', '2026-08-13']);
  });

  it('respeita data final e número máximo de ocorrências', () => {
    expect(
      generateOccurrences(
        {
          frequency: 'MONTHLY',
          interval: 1,
          startDate: isoDate('2026-01-10'),
          endDate: isoDate('2026-03-31'),
        },
        12,
      ),
    ).toEqual(['2026-01-10', '2026-02-10', '2026-03-10']);

    expect(
      generateOccurrences(
        { frequency: 'MONTHLY', interval: 1, startDate: isoDate('2026-01-10'), maxOccurrences: 2 },
        12,
      ),
    ).toHaveLength(2);
  });

  it('a partir de uma data de corte, devolve só o que vem depois', () => {
    expect(
      generateOccurrences(
        { frequency: 'MONTHLY', interval: 1, startDate: isoDate('2026-01-10') },
        2,
        isoDate('2026-03-01'),
      ),
    ).toEqual(['2026-03-10', '2026-04-10']);
  });

  it('conta ocorrências puladas contra o máximo, não só as devolvidas', () => {
    // Máximo de 3 desde janeiro: pedir a partir de março devolve só a terceira.
    expect(
      generateOccurrences(
        { frequency: 'MONTHLY', interval: 1, startDate: isoDate('2026-01-10'), maxOccurrences: 3 },
        12,
        isoDate('2026-03-01'),
      ),
    ).toEqual(['2026-03-10']);
  });

  it('recusa regras inválidas', () => {
    expect(() =>
      generateOccurrences({ frequency: 'DAILY', interval: 0, startDate: isoDate('2026-01-01') }, 1),
    ).toThrow(RecurrenceError);
    expect(() =>
      generateOccurrences(
        {
          frequency: 'DAILY',
          interval: 1,
          startDate: isoDate('2026-02-01'),
          endDate: isoDate('2026-01-01'),
        },
        1,
      ),
    ).toThrow(RecurrenceError);
    expect(() =>
      generateOccurrences(
        { frequency: 'WEEKLY', interval: 1, startDate: isoDate('2026-01-01'), daysOfWeek: [9] },
        1,
      ),
    ).toThrow(RecurrenceError);
  });
});

describe('nextOccurrence', () => {
  it('devolve a próxima data depois da informada', () => {
    expect(
      nextOccurrence(
        { frequency: 'MONTHLY', interval: 1, startDate: isoDate('2026-01-10') },
        isoDate('2026-03-10'),
      ),
    ).toBe('2026-04-10');
  });

  it('devolve null quando a regra acabou', () => {
    expect(
      nextOccurrence(
        {
          frequency: 'MONTHLY',
          interval: 1,
          startDate: isoDate('2026-01-10'),
          endDate: isoDate('2026-02-28'),
        },
        isoDate('2026-02-10'),
      ),
    ).toBeNull();
  });
});

describe('describeRecurrence', () => {
  it('descreve em pt-BR', () => {
    expect(
      describeRecurrence({ frequency: 'DAILY', interval: 1, startDate: isoDate('2026-01-01') }),
    ).toBe('Todo dia');
    expect(
      describeRecurrence({ frequency: 'WEEKLY', interval: 2, startDate: isoDate('2026-01-01') }),
    ).toBe('A cada 2 semanas');
    expect(
      describeRecurrence({
        frequency: 'MONTHLY',
        interval: 1,
        startDate: isoDate('2026-01-05'),
        dayOfMonth: 5,
      }),
    ).toBe('Todo dia 5');
    expect(
      describeRecurrence({ frequency: 'YEARLY', interval: 1, startDate: isoDate('2026-01-01') }),
    ).toBe('Todo ano');
  });
});
