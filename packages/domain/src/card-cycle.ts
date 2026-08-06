/**
 * Ciclos de fatura de cartão (docs/04 §10).
 *
 * O cartão define um dia de fechamento e um dia de vencimento. A partir de uma
 * data de compra, estas funções dizem em QUAL fatura ela cai — e quando essa
 * fatura fecha e vence.
 *
 * Convenção adotada (registrada em docs/21-DECISIONS.md): o ciclo vai do dia
 * seguinte ao fechamento anterior até o dia do fechamento, inclusive. Uma compra
 * feita exatamente no dia do fechamento entra na fatura que fecha naquele dia.
 * Se o dia de vencimento for menor ou igual ao de fechamento, o vencimento cai
 * no mês seguinte ao fechamento.
 */

import { addDays, addMonths, compareIsoDate, isoDate, type IsoDate } from './dates.js';

export class CardCycleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CardCycleError';
  }
}

export type CardCycle = {
  readonly cycleStart: IsoDate;
  readonly cycleEnd: IsoDate;
  readonly closingDate: IsoDate;
  readonly dueDate: IsoDate;
};

function assertDay(day: number, label: string): void {
  if (!Number.isInteger(day) || day < 1 || day > 31) {
    throw new CardCycleError(`${label} deve estar entre 1 e 31; recebido: ${day}`);
  }
}

/** Aplica o dia pedido ao mês da data, respeitando meses mais curtos. */
function withDay(reference: IsoDate, day: number): IsoDate {
  const [year, month] = reference.split('-');
  const lastDay = new Date(Date.UTC(Number(year), Number(month), 0)).getUTCDate();
  const safeDay = Math.min(day, lastDay);
  return isoDate(`${year}-${month}-${String(safeDay).padStart(2, '0')}`);
}

/**
 * Ciclo em que a compra cai.
 *
 * @param purchaseDate data da compra
 * @param closingDay dia de fechamento do cartão (1–31)
 * @param dueDay dia de vencimento do cartão (1–31)
 */
export function cycleForPurchase(
  purchaseDate: IsoDate,
  closingDay: number,
  dueDay: number,
): CardCycle {
  assertDay(closingDay, 'Dia de fechamento');
  assertDay(dueDay, 'Dia de vencimento');

  const closingThisMonth = withDay(purchaseDate, closingDay);
  // Compra depois do fechamento deste mês entra na fatura do mês seguinte.
  const closingDate =
    compareIsoDate(purchaseDate, closingThisMonth) <= 0
      ? closingThisMonth
      : withDay(addMonths(purchaseDate, 1), closingDay);

  const previousClosing = withDay(addMonths(closingDate, -1), closingDay);
  const cycleStart = addDays(previousClosing, 1);

  // Vencimento no mesmo mês do fechamento quando o dia é maior; senão, no mês
  // seguinte — é o comportamento usual dos cartões brasileiros.
  const dueSameMonth = withDay(closingDate, dueDay);
  const dueDate =
    compareIsoDate(dueSameMonth, closingDate) > 0
      ? dueSameMonth
      : withDay(addMonths(closingDate, 1), dueDay);

  return { cycleStart, cycleEnd: closingDate, closingDate, dueDate };
}

/** Ciclo imediatamente seguinte — usado para gerar as parcelas. */
export function nextCycle(cycle: CardCycle, closingDay: number, dueDay: number): CardCycle {
  return cycleForPurchase(addDays(cycle.closingDate, 1), closingDay, dueDay);
}

/**
 * Ciclos de uma compra parcelada: a primeira parcela cai no ciclo da compra e
 * as demais nos ciclos seguintes, um por mês.
 */
export function cyclesForInstallments(
  purchaseDate: IsoDate,
  closingDay: number,
  dueDay: number,
  installments: number,
): CardCycle[] {
  if (!Number.isInteger(installments) || installments < 1 || installments > 120) {
    throw new CardCycleError(`Número de parcelas inválido: ${installments}`);
  }
  const cycles: CardCycle[] = [cycleForPurchase(purchaseDate, closingDay, dueDay)];
  for (let index = 1; index < installments; index += 1) {
    const previous = cycles[index - 1];
    /* c8 ignore next */
    if (!previous) throw new CardCycleError('Falha ao gerar o ciclo seguinte.');
    cycles.push(nextCycle(previous, closingDay, dueDay));
  }
  return cycles;
}
