import { describe, expect, it } from 'vitest';
import { isoDate } from './dates.js';
import { minor } from './money.js';
import {
  derivePlannedEntryStatus,
  isOverdue,
  maxSettlementAmount,
  outstandingAmount,
  overdueDays,
  remainingAmount,
  settledPercentage,
} from './planned-entry.js';

describe('outstandingAmount (docs/04 §4)', () => {
  it('aplica a fórmula original + juros + multa − desconto − baixas', () => {
    expect(
      outstandingAmount({
        originalAmountMinor: minor(100_000),
        interestMinor: minor(1_500),
        penaltyMinor: minor(2_000),
        discountMinor: minor(500),
        settledMinor: minor(43_000),
      }),
    ).toBe(60_000);
  });

  it('sem encargos nem baixas, é o valor original', () => {
    expect(outstandingAmount({ originalAmountMinor: minor(51_010) })).toBe(51_010);
  });

  it('remainingAmount nunca é negativo', () => {
    const input = { originalAmountMinor: minor(1_000), settledMinor: minor(1_500) };
    expect(outstandingAmount(input)).toBe(-500);
    expect(remainingAmount(input)).toBe(0);
    expect(maxSettlementAmount(input)).toBe(0);
  });
});

describe('derivePlannedEntryStatus (docs/04 §5)', () => {
  it('OPEN quando não há baixa', () => {
    expect(derivePlannedEntryStatus({ originalAmountMinor: minor(10_000) })).toBe('OPEN');
  });

  it('PARTIAL quando há baixa e ainda sobra saldo', () => {
    expect(
      derivePlannedEntryStatus({
        originalAmountMinor: minor(10_000),
        settledMinor: minor(4_400),
      }),
    ).toBe('PARTIAL');
  });

  it('SETTLED quando o saldo em aberto zera', () => {
    expect(
      derivePlannedEntryStatus({
        originalAmountMinor: minor(10_000),
        settledMinor: minor(10_000),
      }),
    ).toBe('SETTLED');
  });

  it('SETTLED quando o desconto cobre o restante', () => {
    expect(
      derivePlannedEntryStatus({
        originalAmountMinor: minor(10_000),
        discountMinor: minor(1_000),
        settledMinor: minor(9_000),
      }),
    ).toBe('SETTLED');
  });

  it('CANCELED prevalece sobre qualquer derivação', () => {
    expect(derivePlannedEntryStatus({ originalAmountMinor: minor(10_000) }, true)).toBe('CANCELED');
  });
});

describe('isOverdue (derivado, nunca persistido)', () => {
  const today = isoDate('2026-08-06');

  it('é vencido quando a data passou e ainda há saldo', () => {
    expect(
      isOverdue(
        { dueDate: isoDate('2026-08-01'), status: 'OPEN', outstandingMinor: minor(100) },
        today,
      ),
    ).toBe(true);
    expect(
      overdueDays(
        { dueDate: isoDate('2026-08-01'), status: 'OPEN', outstandingMinor: minor(100) },
        today,
      ),
    ).toBe(5);
  });

  it('não é vencido no próprio dia do vencimento', () => {
    expect(isOverdue({ dueDate: today, status: 'OPEN', outstandingMinor: minor(100) }, today)).toBe(
      false,
    );
  });

  it('não é vencido se está quitado ou cancelado', () => {
    expect(
      isOverdue(
        { dueDate: isoDate('2026-01-01'), status: 'SETTLED', outstandingMinor: minor(0) },
        today,
      ),
    ).toBe(false);
    expect(
      isOverdue(
        { dueDate: isoDate('2026-01-01'), status: 'CANCELED', outstandingMinor: minor(5_000) },
        today,
      ),
    ).toBe(false);
    expect(
      overdueDays(
        { dueDate: isoDate('2026-01-01'), status: 'CANCELED', outstandingMinor: minor(5_000) },
        today,
      ),
    ).toBe(0);
  });
});

describe('settledPercentage (ProgressBar de baixa parcial)', () => {
  it('calcula o percentual pago exibido junto do status', () => {
    expect(
      settledPercentage({ originalAmountMinor: minor(10_000), settledMinor: minor(4_400) }),
    ).toBe(44);
    expect(settledPercentage({ originalAmountMinor: minor(10_000) })).toBe(0);
    expect(
      settledPercentage({ originalAmountMinor: minor(10_000), settledMinor: minor(10_000) }),
    ).toBe(100);
  });

  it('limita a 100 e trata valor pagável zero', () => {
    expect(
      settledPercentage({ originalAmountMinor: minor(1_000), settledMinor: minor(5_000) }),
    ).toBe(100);
    expect(
      settledPercentage({ originalAmountMinor: minor(1_000), discountMinor: minor(1_000) }),
    ).toBe(100);
  });
});
