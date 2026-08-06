/**
 * @ff/test-fixtures — dados determinísticos para testes de backend e app.
 *
 * Nada aqui usa aleatoriedade sem semente: um teste que falha deve falhar
 * sempre da mesma forma.
 */

import type { DeviceInfo, RegisterRequest } from '@ff/api-contracts';
import { isoDate, minor, type IsoDate, type MinorUnits } from '@ff/domain';

/** Contador determinístico por processo, para gerar valores únicos e estáveis. */
let sequence = 0;
export function nextSequence(): number {
  sequence += 1;
  return sequence;
}
export function resetSequence(): void {
  sequence = 0;
}

export const FIXED_NOW = new Date('2026-08-06T12:00:00.000Z');
export const FIXED_TODAY: IsoDate = isoDate('2026-08-06');
export const FAMILY_TIME_ZONE = 'America/Sao_Paulo';

export function brl(reais: number, cents = 0): MinorUnits {
  return minor(reais * 100 + cents);
}

export function makeDevice(overrides: Partial<DeviceInfo> = {}): DeviceInfo {
  return {
    installationId: `install-fixture-${nextSequence()}`,
    platform: 'ios',
    name: 'iPhone de Teste',
    appVersion: '0.1.0',
    ...overrides,
  };
}

export function makeRegisterRequest(overrides: Partial<RegisterRequest> = {}): RegisterRequest {
  const index = nextSequence();
  return {
    email: `pessoa${index}@exemplo.com`,
    password: 'senha-de-teste-longa',
    displayName: `Pessoa ${index}`,
    ...overrides,
  };
}

/** Conta prevista de exemplo usada nos testes de baixa parcial (docs/13 §2). */
export const PLANNED_ENTRY_FIXTURE = {
  originalAmountMinor: brl(1000),
  interestMinor: brl(15),
  penaltyMinor: brl(20),
  discountMinor: brl(5),
  settledMinor: brl(430),
} as const;
