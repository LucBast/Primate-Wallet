/**
 * Primitivos Zod compartilhados (docs/09 §1): IDs UUID, valores em centavos,
 * datas ISO 8601, chaves de idempotência.
 *
 * Todo contrato de API deve ser montado a partir daqui — nunca com `z.number()`
 * cru para dinheiro, para que nenhuma rota aceite valor fracionário.
 */

import { z } from 'zod';
import { isIsoDate, type IsoDate, type MinorUnits } from '@ff/domain';

export const uuidSchema = z.uuid('Identificador inválido.');

/**
 * Valor monetário: inteiro em centavos. Rejeita float explicitamente — é a
 * primeira barreira contra a entrada de valores em reais por engano.
 * `z.int()` já restringe à faixa de inteiro seguro.
 */
export const minorUnitsSchema = z
  .int('Valor monetário deve ser inteiro em centavos (R$ 10,00 = 1000).')
  .transform((value) => value as MinorUnits);

/** Valor monetário estritamente positivo (lançamentos, baixas). */
export const positiveMinorUnitsSchema = minorUnitsSchema.refine(
  (value) => value > 0,
  'Valor deve ser maior que zero.',
);

/** Valor monetário não negativo (juros, multa, desconto). */
export const nonNegativeMinorUnitsSchema = minorUnitsSchema.refine(
  (value) => value >= 0,
  'Valor não pode ser negativo.',
);

/** Data de calendário "YYYY-MM-DD" (competência, vencimento, data efetiva). */
export const isoDateSchema = z
  .string()
  .refine(isIsoDate, 'Data inválida (esperado YYYY-MM-DD).')
  .transform((value) => value as IsoDate);

/** Instante ISO 8601 completo. */
export const isoDateTimeSchema = z.iso.datetime({ offset: true });

/** Fuso IANA da família. */
export const timeZoneSchema = z.string().min(1).max(64);

/**
 * Chave de idempotência (docs/04 §14): gerada pelo cliente, única por comando.
 * Aceita UUID ou qualquer string opaca de 16–128 caracteres seguros.
 */
export const idempotencyKeySchema = z
  .string()
  .min(16, 'Chave de idempotência muito curta.')
  .max(128, 'Chave de idempotência muito longa.')
  .regex(/^[A-Za-z0-9._:-]+$/, 'Chave de idempotência contém caracteres inválidos.');

/** Controle de concorrência otimista (docs/04 §15). */
export const expectedVersionSchema = z.int().nonnegative();

// Normaliza ANTES de validar: o usuário digita " Ana@Exemplo.COM " e o que
// chega ao banco é "ana@exemplo.com" (unicidade case-insensitive).
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email('E-mail inválido.').max(254));

/**
 * Senha: mínimo de 10 caracteres (docs/10 §2). Não impomos composição
 * artificial — comprimento e verificação contra reuso valem mais.
 */
export const passwordSchema = z
  .string()
  .min(10, 'A senha deve ter ao menos 10 caracteres.')
  .max(200, 'Senha muito longa.');

export const shortTextSchema = z.string().trim().min(1).max(120);
export const descriptionSchema = z.string().trim().max(500);

/** Paginação por cursor (docs/09 §11). */
export const cursorSchema = z.string().min(1).max(512);
export const pageSizeSchema = z.int().min(1).max(100).default(50);

export function paginated<T extends z.ZodType>(item: T) {
  return z.object({
    items: z.array(item),
    nextCursor: z.string().nullable(),
  });
}

export type Paginated<T> = { readonly items: readonly T[]; readonly nextCursor: string | null };
