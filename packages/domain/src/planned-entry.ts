/**
 * Conta prevista — saldo em aberto e status (docs/04 §4, §5, §7).
 *
 * `outstanding` e "vencido" são SEMPRE derivados. Nunca persistir "vencido".
 */

import { compareIsoDate, type IsoDate } from './dates.js';
import { add, max, type MinorUnits, minor, subtract, ZERO } from './money.js';

/** Status persistidos da conta prevista. */
export const PLANNED_ENTRY_STATUSES = ['OPEN', 'PARTIAL', 'SETTLED', 'CANCELED'] as const;
export type PlannedEntryStatus = (typeof PLANNED_ENTRY_STATUSES)[number];

export type OutstandingInput = {
  readonly originalAmountMinor: MinorUnits;
  readonly interestMinor?: MinorUnits;
  readonly penaltyMinor?: MinorUnits;
  readonly discountMinor?: MinorUnits;
  /** Soma das baixas válidas (não estornadas). */
  readonly settledMinor?: MinorUnits;
};

/**
 * outstanding = original + juros + multa − desconto − baixas válidas
 *
 * Pode ser negativo se houver excesso; quem chama decide o tratamento (o comando
 * de baixa recusa excesso com OUTSTANDING_AMOUNT_EXCEEDED).
 */
export function outstandingAmount(input: OutstandingInput): MinorUnits {
  const gross = add(
    input.originalAmountMinor,
    input.interestMinor ?? ZERO,
    input.penaltyMinor ?? ZERO,
  );
  const afterDiscount = subtract(gross, input.discountMinor ?? ZERO);
  return subtract(afterDiscount, input.settledMinor ?? ZERO);
}

/** Saldo em aberto nunca negativo, para exibição ("Falta pagar"). */
export function remainingAmount(input: OutstandingInput): MinorUnits {
  return max(outstandingAmount(input), ZERO);
}

/**
 * Deriva o status a partir dos valores. `CANCELED` é decisão explícita do
 * usuário e por isso entra como parâmetro, não é derivado.
 */
export function derivePlannedEntryStatus(
  input: OutstandingInput,
  canceled = false,
): PlannedEntryStatus {
  if (canceled) return 'CANCELED';
  const outstanding = outstandingAmount(input);
  const settled = input.settledMinor ?? ZERO;
  if (outstanding <= 0) return 'SETTLED';
  if (settled > 0) return 'PARTIAL';
  return 'OPEN';
}

export type OverdueInput = {
  readonly dueDate: IsoDate;
  readonly status: PlannedEntryStatus;
  readonly outstandingMinor: MinorUnits;
};

/**
 * Vencido (derivado):
 *   due_date < family_today AND outstanding > 0 AND status != CANCELED
 */
export function isOverdue(input: OverdueInput, familyToday: IsoDate): boolean {
  if (input.status === 'CANCELED') return false;
  if (input.outstandingMinor <= 0) return false;
  return compareIsoDate(input.dueDate, familyToday) === -1;
}

/** Dias de atraso (0 quando não está vencido) — usado no chip "há N dias". */
export function overdueDays(input: OverdueInput, familyToday: IsoDate): number {
  if (!isOverdue(input, familyToday)) return 0;
  const millisPerDay = 86_400_000;
  const due = Date.parse(`${input.dueDate}T00:00:00.000Z`);
  const today = Date.parse(`${familyToday}T00:00:00.000Z`);
  return (today - due) / millisPerDay;
}

/** Percentual pago (0–100) para a ProgressBar de baixa parcial. */
export function settledPercentage(input: OutstandingInput): number {
  const gross = add(
    input.originalAmountMinor,
    input.interestMinor ?? ZERO,
    input.penaltyMinor ?? ZERO,
  );
  const payable = subtract(gross, input.discountMinor ?? ZERO);
  if (payable <= 0) return 100;
  const settled = input.settledMinor ?? ZERO;
  const ratio = (settled * 100) / payable;
  const clamped = ratio < 0 ? 0 : ratio > 100 ? 100 : ratio;
  return Math.floor(clamped);
}

/** Valor máximo aceito numa baixa — o saldo em aberto (docs/04 §7). */
export function maxSettlementAmount(input: OutstandingInput): MinorUnits {
  return max(outstandingAmount(input), minor(0));
}
