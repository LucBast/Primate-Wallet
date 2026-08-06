/**
 * Datas (docs/04 §2): toda apresentação e toda derivação de "vencido" usam o
 * fuso da FAMÍLIA, nunca o fuso do dispositivo nem UTC.
 *
 * Datas de calendário (competência, vencimento, data prevista/efetiva) são
 * tratadas como `IsoDate` — "YYYY-MM-DD", sem hora e sem fuso. Instantes
 * (created_at, updated_at) continuam sendo ISO 8601 completos em UTC.
 */

import type { Brand } from './brand.js';

/** Data de calendário no formato "YYYY-MM-DD". */
export type IsoDate = Brand<string, 'IsoDate'>;

/** Identificador IANA de fuso, ex.: "America/Sao_Paulo". */
export type TimeZone = string;

export const DEFAULT_TIME_ZONE: TimeZone = 'America/Sao_Paulo';

export class DateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DateError';
  }
}

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isIsoDate(value: unknown): value is IsoDate {
  if (typeof value !== 'string') return false;
  const match = ISO_DATE_PATTERN.exec(value);
  if (!match) return false;
  const [, year, month, day] = match;
  const utc = Date.UTC(Number(year), Number(month) - 1, Number(day));
  const date = new Date(utc);
  return (
    date.getUTCFullYear() === Number(year) &&
    date.getUTCMonth() === Number(month) - 1 &&
    date.getUTCDate() === Number(day)
  );
}

export function isoDate(value: string): IsoDate {
  if (!isIsoDate(value)) {
    throw new DateError(`Data de calendário inválida: "${value}" (esperado YYYY-MM-DD).`);
  }
  return value;
}

const formatterCache = new Map<TimeZone, Intl.DateTimeFormat>();

function zonedFormatter(timeZone: TimeZone): Intl.DateTimeFormat {
  let formatter = formatterCache.get(timeZone);
  if (!formatter) {
    try {
      formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });
    } catch {
      throw new DateError(`Fuso horário inválido: "${timeZone}".`);
    }
    formatterCache.set(timeZone, formatter);
  }
  return formatter;
}

/** "Hoje" segundo o fuso da família — base para derivar vencimento. */
export function familyToday(timeZone: TimeZone, now: Date = new Date()): IsoDate {
  // en-CA formata como YYYY-MM-DD.
  return isoDate(zonedFormatter(timeZone).format(now));
}

/** Converte um instante para a data de calendário correspondente no fuso dado. */
export function toIsoDate(instant: Date, timeZone: TimeZone = DEFAULT_TIME_ZONE): IsoDate {
  return isoDate(zonedFormatter(timeZone).format(instant));
}

function toUtcMillis(date: IsoDate): number {
  const match = ISO_DATE_PATTERN.exec(date);
  /* c8 ignore next */
  if (!match) throw new DateError(`Data inválida: "${date}"`);
  const [, year, month, day] = match;
  return Date.UTC(Number(year), Number(month) - 1, Number(day));
}

function fromUtcMillis(millis: number): IsoDate {
  const date = new Date(millis);
  const year = String(date.getUTCFullYear()).padStart(4, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return isoDate(`${year}-${month}-${day}`);
}

const MILLIS_PER_DAY = 86_400_000;

export function addDays(date: IsoDate, days: number): IsoDate {
  if (!Number.isInteger(days)) throw new DateError(`Dias devem ser inteiros: ${days}`);
  return fromUtcMillis(toUtcMillis(date) + days * MILLIS_PER_DAY);
}

/** Diferença em dias inteiros (b − a). */
export function differenceInDays(a: IsoDate, b: IsoDate): number {
  return (toUtcMillis(b) - toUtcMillis(a)) / MILLIS_PER_DAY;
}

/** −1, 0 ou 1. */
export function compareIsoDate(a: IsoDate, b: IsoDate): -1 | 0 | 1 {
  const left = toUtcMillis(a);
  const right = toUtcMillis(b);
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

export function isBefore(a: IsoDate, b: IsoDate): boolean {
  return compareIsoDate(a, b) === -1;
}

export function isAfter(a: IsoDate, b: IsoDate): boolean {
  return compareIsoDate(a, b) === 1;
}

/** Adiciona meses preservando o fim de mês (31/01 + 1 mês = 28/02 ou 29/02). */
export function addMonths(date: IsoDate, months: number): IsoDate {
  if (!Number.isInteger(months)) throw new DateError(`Meses devem ser inteiros: ${months}`);
  const match = ISO_DATE_PATTERN.exec(date);
  /* c8 ignore next */
  if (!match) throw new DateError(`Data inválida: "${date}"`);
  const [, yearRaw, monthRaw, dayRaw] = match;
  const year = Number(yearRaw);
  const monthIndex = Number(monthRaw) - 1 + months;
  const day = Number(dayRaw);

  const targetYear = year + Math.floor(monthIndex / 12);
  const targetMonth = ((monthIndex % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const safeDay = day > lastDay ? lastDay : day;
  return fromUtcMillis(Date.UTC(targetYear, targetMonth, safeDay));
}

/** Primeiro e último dia do mês de competência de uma data. */
export function monthRange(date: IsoDate): { readonly start: IsoDate; readonly end: IsoDate } {
  const match = ISO_DATE_PATTERN.exec(date);
  /* c8 ignore next */
  if (!match) throw new DateError(`Data inválida: "${date}"`);
  const [, yearRaw, monthRaw] = match;
  const year = Number(yearRaw);
  const monthIndex = Number(monthRaw) - 1;
  return {
    start: fromUtcMillis(Date.UTC(year, monthIndex, 1)),
    end: fromUtcMillis(Date.UTC(year, monthIndex + 1, 0)),
  };
}

const DISPLAY_FORMATTER = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'UTC',
});

/** Apresentação pt-BR: "05/08/2026". */
export function formatDate(date: IsoDate): string {
  return DISPLAY_FORMATTER.format(new Date(toUtcMillis(date)));
}
