/**
 * Recorrências (docs/05 §4.8).
 *
 * A geração de ocorrências é PURA: recebe a regra e uma data de corte, devolve
 * as datas. Assim o mesmo código roda no job do servidor e na prévia que o app
 * mostra ao usuário, sem chance de divergirem.
 *
 * Regra de fim de mês: uma recorrência mensal no dia 31 cai no último dia dos
 * meses mais curtos (28/29/30) e VOLTA para 31 nos meses que têm — o dia
 * pedido é preservado como intenção, não como estado.
 */

import { addDays, addMonths, compareIsoDate, isoDate, type IsoDate } from './dates.js';

export const FREQUENCIES = ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'] as const;
export type Frequency = (typeof FREQUENCIES)[number];

export type RecurrenceRule = {
  readonly frequency: Frequency;
  /** A cada quantos períodos: 2 + MONTHLY = bimestral. */
  readonly interval: number;
  readonly startDate: IsoDate;
  readonly endDate?: IsoDate | undefined;
  readonly maxOccurrences?: number | undefined;
  /** Dia do mês pedido (1–31), para MONTHLY e YEARLY. */
  readonly dayOfMonth?: number | undefined;
  /** 0 = domingo … 6 = sábado, para WEEKLY. */
  readonly daysOfWeek?: readonly number[] | undefined;
};

export class RecurrenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RecurrenceError';
  }
}

function assertValid(rule: RecurrenceRule): void {
  if (!Number.isInteger(rule.interval) || rule.interval < 1 || rule.interval > 60) {
    throw new RecurrenceError(`Intervalo inválido: ${rule.interval}`);
  }
  if (rule.maxOccurrences !== undefined && rule.maxOccurrences < 1) {
    throw new RecurrenceError('A recorrência precisa gerar ao menos uma ocorrência.');
  }
  if (rule.endDate !== undefined && compareIsoDate(rule.endDate, rule.startDate) === -1) {
    throw new RecurrenceError('A data final não pode ser anterior à inicial.');
  }
  if (
    rule.frequency === 'WEEKLY' &&
    rule.daysOfWeek !== undefined &&
    rule.daysOfWeek.some((day) => !Number.isInteger(day) || day < 0 || day > 6)
  ) {
    throw new RecurrenceError('Dias da semana devem estar entre 0 (domingo) e 6 (sábado).');
  }
}

function weekdayOf(date: IsoDate): number {
  return new Date(`${date}T00:00:00.000Z`).getUTCDay();
}

/** Aplica o dia do mês pedido, respeitando meses mais curtos. */
function withDayOfMonth(date: IsoDate, dayOfMonth: number): IsoDate {
  const [year, month] = date.split('-');
  const lastDay = new Date(Date.UTC(Number(year), Number(month), 0)).getUTCDate();
  const day = Math.min(dayOfMonth, lastDay);
  return isoDate(`${year}-${month}-${String(day).padStart(2, '0')}`);
}

/**
 * Gera as próximas ocorrências a partir de (e incluindo) `from`, até `limit`
 * datas ou até o fim da regra — o que vier primeiro.
 */
export function generateOccurrences(
  rule: RecurrenceRule,
  limit: number,
  from: IsoDate = rule.startDate,
): IsoDate[] {
  assertValid(rule);
  if (limit <= 0) return [];

  const result: IsoDate[] = [];
  const cap = rule.maxOccurrences ?? Number.POSITIVE_INFINITY;
  // Guarda contra regras que não avançam (ex.: semanal sem dia compatível).
  const maxIterations = limit * 400 + 2000;

  let index = 0;
  let produced = 0;
  let cursor = rule.startDate;
  let iterations = 0;

  while (result.length < limit && produced < cap && iterations < maxIterations) {
    iterations += 1;

    if (
      rule.frequency === 'WEEKLY' &&
      rule.daysOfWeek !== undefined &&
      rule.daysOfWeek.length > 0
    ) {
      // Semanal com dias específicos: caminha dia a dia dentro das semanas
      // múltiplas do intervalo.
      // A diferença entre duas datas de calendário em UTC é sempre múltipla
      // exata de um dia, então não há arredondamento a fazer.
      const daysFromStart =
        (Date.parse(`${cursor}T00:00:00Z`) - Date.parse(`${rule.startDate}T00:00:00Z`)) /
        86_400_000;
      const weeksFromStart = Math.floor(daysFromStart / 7);
      const inCycle = weeksFromStart % rule.interval === 0;
      if (inCycle && rule.daysOfWeek.includes(weekdayOf(cursor))) {
        if (rule.endDate !== undefined && compareIsoDate(cursor, rule.endDate) === 1) break;
        produced += 1;
        if (compareIsoDate(cursor, from) >= 0) result.push(cursor);
      }
      cursor = addDays(cursor, 1);
      continue;
    }

    const occurrence = (() => {
      switch (rule.frequency) {
        case 'DAILY':
          return addDays(rule.startDate, index * rule.interval);
        case 'WEEKLY':
          return addDays(rule.startDate, index * rule.interval * 7);
        case 'MONTHLY': {
          const base = addMonths(rule.startDate, index * rule.interval);
          return rule.dayOfMonth === undefined ? base : withDayOfMonth(base, rule.dayOfMonth);
        }
        case 'YEARLY': {
          const base = addMonths(rule.startDate, index * rule.interval * 12);
          return rule.dayOfMonth === undefined ? base : withDayOfMonth(base, rule.dayOfMonth);
        }
      }
    })();

    index += 1;
    if (rule.endDate !== undefined && compareIsoDate(occurrence, rule.endDate) === 1) break;
    produced += 1;
    if (compareIsoDate(occurrence, from) >= 0) result.push(occurrence);
  }

  return result;
}

/** Próxima ocorrência estritamente após `after`, ou null se a regra terminou. */
export function nextOccurrence(rule: RecurrenceRule, after: IsoDate): IsoDate | null {
  const next = generateOccurrences(rule, 1, addDays(after, 1));
  return next[0] ?? null;
}

/** Descrição legível em pt-BR, usada na tela de recorrência. */
export function describeRecurrence(rule: RecurrenceRule): string {
  const every = rule.interval === 1 ? '' : ` a cada ${rule.interval}`;
  switch (rule.frequency) {
    case 'DAILY':
      return rule.interval === 1 ? 'Todo dia' : `A cada ${rule.interval} dias`;
    case 'WEEKLY':
      return rule.interval === 1 ? 'Toda semana' : `A cada ${rule.interval} semanas`;
    case 'MONTHLY':
      return rule.dayOfMonth === undefined
        ? `Todo mês${every === '' ? '' : `${every} meses`}`
        : `Todo dia ${rule.dayOfMonth}${rule.interval === 1 ? '' : `, a cada ${rule.interval} meses`}`;
    case 'YEARLY':
      return rule.interval === 1 ? 'Todo ano' : `A cada ${rule.interval} anos`;
  }
}
