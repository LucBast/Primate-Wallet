/**
 * Dinheiro — invariante nº 1 do projeto (docs/04 §1).
 *
 * Todo valor monetário é um INTEIRO na menor unidade (centavos). Ponto flutuante
 * é proibido em cálculo financeiro. O tipo `MinorUnits` existe para que um número
 * "solto" não seja aceito por engano onde se espera dinheiro.
 */

import type { Brand } from './brand.js';

/** Valor monetário em centavos inteiros. */
export type MinorUnits = Brand<number, 'MinorUnits'>;

export class MoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MoneyError';
  }
}

/** Converte um número para centavos, recusando não-inteiros e valores inválidos. */
export function minor(value: number): MinorUnits {
  if (!Number.isFinite(value)) {
    throw new MoneyError(`Valor monetário inválido: ${String(value)}`);
  }
  if (!Number.isInteger(value)) {
    throw new MoneyError(`Valor monetário deve ser inteiro em centavos, recebido: ${value}`);
  }
  if (!Number.isSafeInteger(value)) {
    throw new MoneyError(`Valor monetário fora da faixa segura: ${value}`);
  }
  return value as MinorUnits;
}

export const ZERO: MinorUnits = minor(0);

export function isMinorUnits(value: unknown): value is MinorUnits {
  return typeof value === 'number' && Number.isSafeInteger(value);
}

export function add(...values: readonly MinorUnits[]): MinorUnits {
  return minor(values.reduce<number>((total, value) => total + value, 0));
}

export function subtract(a: MinorUnits, b: MinorUnits): MinorUnits {
  return minor(a - b);
}

export function negate(value: MinorUnits): MinorUnits {
  return minor(-value);
}

export function abs(value: MinorUnits): MinorUnits {
  return minor(Math.abs(value));
}

export function isZero(value: MinorUnits): boolean {
  return value === 0;
}

export function isPositive(value: MinorUnits): boolean {
  return value > 0;
}

export function isNegative(value: MinorUnits): boolean {
  return value < 0;
}

export function max(a: MinorUnits, b: MinorUnits): MinorUnits {
  return a >= b ? a : b;
}

export function min(a: MinorUnits, b: MinorUnits): MinorUnits {
  return a <= b ? a : b;
}

/**
 * Multiplica por um fator inteiro (ex.: quantidade). Fatores fracionários não são
 * aceitos — use `percentage` ou `allocate`, que preservam o total exato.
 */
export function multiply(value: MinorUnits, factor: number): MinorUnits {
  if (!Number.isInteger(factor)) {
    throw new MoneyError(`Fator deve ser inteiro, recebido: ${factor}. Use percentage/allocate.`);
  }
  return minor(value * factor);
}

/**
 * Percentual em basis points (1% = 100 bps), com arredondamento half-up sobre
 * inteiros — sem ponto flutuante intermediário perceptível no resultado.
 */
export function percentage(value: MinorUnits, basisPoints: number): MinorUnits {
  if (!Number.isInteger(basisPoints)) {
    throw new MoneyError(`Basis points devem ser inteiros, recebido: ${basisPoints}`);
  }
  const product = value * basisPoints;
  const sign = product < 0 ? -1 : 1;
  const magnitude = Math.abs(product);
  const quotient = Math.floor(magnitude / 10_000);
  const remainder = magnitude % 10_000;
  const rounded = remainder * 2 >= 10_000 ? quotient + 1 : quotient;
  return minor(sign * rounded);
}

/**
 * Rateio (docs/04 §12): distribui `total` conforme os pesos, garantindo que a
 * soma das partes seja EXATAMENTE o total. Os centavos restantes são entregues
 * às maiores frações (método do maior resto), de forma determinística.
 */
export function allocate(total: MinorUnits, weights: readonly number[]): MinorUnits[] {
  if (weights.length === 0) {
    throw new MoneyError('Rateio exige ao menos um peso.');
  }
  if (weights.some((weight) => !Number.isFinite(weight) || weight < 0)) {
    throw new MoneyError('Pesos de rateio devem ser números finitos não negativos.');
  }
  const weightSum = weights.reduce((sum, weight) => sum + weight, 0);
  if (weightSum <= 0) {
    throw new MoneyError('A soma dos pesos de rateio deve ser maior que zero.');
  }

  const sign = total < 0 ? -1 : 1;
  const magnitude = Math.abs(total);

  const shares = weights.map((weight, index) => {
    const exact = (magnitude * weight) / weightSum;
    const floor = Math.floor(exact);
    return { index, floor, remainder: exact - floor };
  });

  let distributed = shares.reduce((sum, share) => sum + share.floor, 0);
  let leftover = magnitude - distributed;

  // Maior resto primeiro; empate resolvido pelo índice (determinístico).
  const byRemainder = [...shares].sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  for (const share of byRemainder) {
    if (leftover <= 0) break;
    share.floor += 1;
    leftover -= 1;
    distributed += 1;
  }

  const result = shares.map((share) => minor(sign * share.floor));
  const check = result.reduce<number>((sum, value) => sum + value, 0);
  if (check !== total) {
    throw new MoneyError(`Rateio não fechou: soma ${check} ≠ total ${total}`);
  }
  return result;
}

/**
 * Parcelamento (docs/04 §10): parcelas iguais, com a diferença de centavos
 * aplicada na ÚLTIMA parcela — regra explícita do pacote, diferente do rateio.
 */
export function splitInstallments(total: MinorUnits, count: number): MinorUnits[] {
  if (!Number.isInteger(count) || count < 1) {
    throw new MoneyError(`Número de parcelas inválido: ${count}`);
  }
  const sign = total < 0 ? -1 : 1;
  const magnitude = Math.abs(total);
  const base = Math.floor(magnitude / count);
  const remainder = magnitude - base * count;

  const installments: MinorUnits[] = [];
  for (let index = 0; index < count; index += 1) {
    const isLast = index === count - 1;
    installments.push(minor(sign * (isLast ? base + remainder : base)));
  }
  const check = installments.reduce<number>((sum, value) => sum + value, 0);
  if (check !== total) {
    throw new MoneyError(`Parcelamento não fechou: soma ${check} ≠ total ${total}`);
  }
  return installments;
}

const BRL_FORMATTER = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const BRL_FORMATTER_NO_SYMBOL = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export type FormatMoneyOptions = {
  /** Exibe o símbolo "R$" (padrão: true). */
  readonly symbol?: boolean;
  /** Força o sinal "+" em valores positivos (usado em listas de receita). */
  readonly signDisplay?: 'auto' | 'always' | 'never';
};

/**
 * Formatação pt-BR (docs/05 §8): "R$ 1.248,05". O sinal negativo usa o caractere
 * "−" (U+2212) quando `signDisplay` é 'always' ou 'auto', igual ao design.
 */
export function formatMoney(value: MinorUnits, options: FormatMoneyOptions = {}): string {
  const { symbol = true, signDisplay = 'auto' } = options;
  const magnitude = Math.abs(value) / 100;
  const formatter = symbol ? BRL_FORMATTER : BRL_FORMATTER_NO_SYMBOL;
  const formatted = formatter.format(magnitude);

  if (signDisplay === 'never') return formatted;
  if (value < 0) return `−${formatted}`;
  if (signDisplay === 'always' && value > 0) return `+${formatted}`;
  return formatted;
}

/**
 * Lê um texto digitado pelo usuário em pt-BR ("1.248,05", "1248,05", "R$ 5")
 * e devolve centavos inteiros. Recusa entradas ambíguas ou com mais de 2 casas.
 */
export function parseMoney(input: string): MinorUnits {
  const trimmed = input.trim();
  if (trimmed === '') throw new MoneyError('Valor vazio.');

  const negative = /^[-−(]/.test(trimmed) || trimmed.endsWith(')');
  const digitsOnly = trimmed.replace(/[^\d,]/g, '');
  if (digitsOnly === '') throw new MoneyError(`Valor monetário inválido: "${input}"`);

  const parts = digitsOnly.split(',');
  if (parts.length > 2) throw new MoneyError(`Valor monetário inválido: "${input}"`);

  const integerPart = parts[0] ?? '';
  const fractionPart = parts[1] ?? '';
  if (fractionPart.length > 2) {
    throw new MoneyError(`Valor monetário com mais de 2 casas decimais: "${input}"`);
  }

  const cents = `${fractionPart}00`.slice(0, 2);
  const total = Number(`${integerPart === '' ? '0' : integerPart}${cents}`);
  if (!Number.isSafeInteger(total)) {
    throw new MoneyError(`Valor monetário fora da faixa segura: "${input}"`);
  }
  return minor(negative ? -total : total);
}
