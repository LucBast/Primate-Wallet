/**
 * Formatos de data que aparecem literalmente nos screenshots.
 *
 * A copy pt-BR do design é final (CLAUDE.md item 5), e os mesmos formatos se
 * repetem em telas diferentes — "Ago 2026" no seletor de mês da 1b e da 1d,
 * "vence sáb, 08/08" nas linhas de compromisso da 1b e do planejamento. Ficam
 * aqui para que uma correção de formato valha para todas as telas de uma vez.
 *
 * Todos usam UTC: as datas do domínio são `IsoDate` (dia civil da família),
 * nunca instantes, e converter para o fuso do aparelho mudaria o dia.
 */

const MONTH_SHORT = new Intl.DateTimeFormat('pt-BR', { month: 'short', timeZone: 'UTC' });
const MONTH_LONG = new Intl.DateTimeFormat('pt-BR', { month: 'long', timeZone: 'UTC' });
const DAY_MONTH = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  timeZone: 'UTC',
});
const WEEKDAY_DAY_MONTH = new Intl.DateTimeFormat('pt-BR', {
  weekday: 'short',
  day: '2-digit',
  month: '2-digit',
  timeZone: 'UTC',
});

/** Meio-dia UTC: imune a qualquer arredondamento de fuso. */
function atNoon(iso: string): Date {
  return new Date(`${iso}T12:00:00Z`);
}

/** Seletor de mês: "Ago 2026" (SCREEN-SPECS §1b e §1d, "‹ Ago 2026 ›"). */
export function monthLabel(iso: string): string {
  const short = MONTH_SHORT.format(atNoon(iso)).replace('.', '');
  return `${short.charAt(0).toUpperCase()}${short.slice(1)} ${atNoon(iso).getUTCFullYear()}`;
}

/** Rótulo por extenso do "Previsto × realizado" da 1b: "agosto". */
export function longMonthLabel(iso: string): string {
  return MONTH_LONG.format(atNoon(iso));
}

/** Data curta das metas de status: "02/08". */
export function dayMonth(iso: string): string {
  return DAY_MONTH.format(atNoon(iso));
}

/** Vencimento das linhas de compromisso: "sáb, 08/08". */
export function dueLabel(iso: string): string {
  // pt-BR devolve "sáb., 08/08"; o screenshot não tem o ponto do dia da semana.
  return WEEKDAY_DAY_MONTH.format(atNoon(iso)).replace('.,', ',');
}
