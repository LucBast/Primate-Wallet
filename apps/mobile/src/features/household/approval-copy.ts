/**
 * Copy da linha de contexto do pedido de aprovação (3c):
 * "hoje, 14:32 · via lançamento rápido".
 *
 * O screenshot mostra "hoje" em vez da data quando o pedido é do dia — é assim
 * que uma pessoa fala do que acabou de acontecer, e é a copy final do design.
 */

import type { TransactionSource } from '@ff/api-contracts';

const TIME = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });
const DAY_MONTH = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' });

/** Origem do lançamento, como aparece depois do "via" (SCREEN-SPECS §3c). */
const SOURCE_LABEL: Record<TransactionSource, string> = {
  MANUAL: 'lançamento manual',
  BOTTOM_ACTION: 'lançamento rápido',
  SHORTCUT: 'atalho do ícone',
  NOTIFICATION: 'notificação',
  RECURRENCE: 'recorrência',
  SETTLEMENT: 'baixa de conta prevista',
  IMPORT: 'importação',
  SYSTEM: 'sistema',
};

export function sourceLabel(source: TransactionSource): string {
  return SOURCE_LABEL[source];
}

/**
 * "hoje, 14:32" no mesmo dia; "ontem, 21:07" no anterior; "05/08, 14:32" antes
 * disso. Diferente do resto do app, aqui a hora é do APARELHO: o pedido é um
 * instante real, não um dia civil da família.
 */
export function requestedAtLabel(isoInstant: string): string {
  const moment = new Date(isoInstant);
  const time = TIME.format(moment);

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  if (moment.getTime() >= startOfDay.getTime()) return `hoje, ${time}`;

  const startOfYesterday = new Date(startOfDay);
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);
  if (moment.getTime() >= startOfYesterday.getTime()) return `ontem, ${time}`;

  return `${DAY_MONTH.format(moment)}, ${time}`;
}
