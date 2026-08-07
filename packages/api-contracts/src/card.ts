/**
 * Contratos de cartão de crédito: compras, parcelas e faturas
 * (docs/09 §7, §8; telas 1f e 2e).
 */

import { z } from 'zod';
import {
  descriptionSchema,
  idempotencyKeySchema,
  isoDateSchema,
  minorUnitsSchema,
  positiveMinorUnitsSchema,
  shortTextSchema,
  uuidSchema,
} from '@ff/validation';

export const cardStatementStatusSchema = z.enum(['OPEN', 'CLOSED', 'PARTIAL', 'PAID']);
export type CardStatementStatus = z.infer<typeof cardStatementStatusSchema>;

export const cardStatementItemSchema = z.object({
  id: uuidSchema,
  transactionId: uuidSchema,
  description: z.string(),
  amountMinor: minorUnitsSchema,
  occurredAt: z.string(),
  memberName: z.string().nullable(),
  categoryName: z.string().nullable(),
  transactionType: z.string(),
  status: z.string(),
  installmentNumber: z.int().nullable(),
  installmentTotal: z.int().nullable(),
  /** Motivo do estorno — a linha "● Estornada em 03/08 · motivo: …" da 1f. */
  reversalReason: z.string().nullable(),
});
export type CardStatementItem = z.infer<typeof cardStatementItemSchema>;

export const cardStatementPaymentSchema = z.object({
  id: uuidSchema,
  transactionId: uuidSchema,
  amountMinor: minorUnitsSchema,
  paidAt: z.string(),
  accountName: z.string().nullable(),
  createdByName: z.string().nullable(),
  reversedAt: z.string().nullable(),
});
export type CardStatementPayment = z.infer<typeof cardStatementPaymentSchema>;

export const cardStatementSchema = z.object({
  id: uuidSchema,
  householdId: uuidSchema,
  accountId: uuidSchema,
  accountName: z.string(),
  cardLastFour: z.string().nullable(),
  cycleStartDate: z.string(),
  cycleEndDate: z.string(),
  closingDate: z.string(),
  dueDate: z.string(),
  status: cardStatementStatusSchema,
  /** Derivado com o fuso da família: fechada, vencida e sem pagamento. */
  overdue: z.boolean(),
  totalMinor: minorUnitsSchema,
  paidMinor: minorUnitsSchema,
  outstandingMinor: minorUnitsSchema,
  paidPercent: z.int(),
  /** Limite do cartão e uso, para a barra da tela 1f. */
  creditLimitMinor: minorUnitsSchema.nullable(),
  usedLimitMinor: minorUnitsSchema,
  availableLimitMinor: minorUnitsSchema.nullable(),
  items: z.array(cardStatementItemSchema),
  payments: z.array(cardStatementPaymentSchema),
  version: z.int(),
});
export type CardStatement = z.infer<typeof cardStatementSchema>;

/** Compra no cartão, à vista ou parcelada (tela 2e). */
export const createCardPurchaseRequestSchema = z.object({
  accountId: uuidSchema,
  description: shortTextSchema.max(120),
  amountMinor: positiveMinorUnitsSchema,
  purchaseDate: isoDateSchema,
  memberId: uuidSchema,
  categoryId: uuidSchema.optional(),
  counterpartyName: shortTextSchema.max(80).optional(),
  notes: descriptionSchema.optional(),
  /** 1 = à vista. A soma das parcelas é sempre o valor total. */
  installments: z.int().min(1).max(120).default(1),
  idempotencyKey: idempotencyKeySchema,
});
export type CreateCardPurchaseRequest = z.infer<typeof createCardPurchaseRequestSchema>;

export const cardPurchasePreviewItemSchema = z.object({
  installmentNumber: z.int(),
  amountMinor: minorUnitsSchema,
  closingDate: z.string(),
  dueDate: z.string(),
  /** Marca a parcela que recebeu a diferença de centavos. */
  carriesRounding: z.boolean(),
});
export type CardPurchasePreviewItem = z.infer<typeof cardPurchasePreviewItemSchema>;

export const createCardPurchaseResponseSchema = z.object({
  transactionIds: z.array(uuidSchema),
  installments: z.array(cardPurchasePreviewItemSchema),
  totalMinor: minorUnitsSchema,
  availableLimitAfterMinor: minorUnitsSchema.nullable(),
});
export type CreateCardPurchaseResponse = z.infer<typeof createCardPurchaseResponseSchema>;

/** Pagamento de fatura (docs/09 §8). NÃO é despesa. */
export const payCardStatementRequestSchema = z.object({
  amountMinor: positiveMinorUnitsSchema,
  /** Conta bancária de onde sai o dinheiro. */
  fromAccountId: uuidSchema,
  paidAt: isoDateSchema,
  memberId: uuidSchema,
  idempotencyKey: idempotencyKeySchema,
  expectedVersion: z.int().nonnegative(),
});
export type PayCardStatementRequest = z.infer<typeof payCardStatementRequestSchema>;

export const reverseCardPaymentRequestSchema = z.object({
  reason: shortTextSchema.max(200),
  idempotencyKey: idempotencyKeySchema,
});
export type ReverseCardPaymentRequest = z.infer<typeof reverseCardPaymentRequestSchema>;

/** Reembolso lançado no cartão (estorno de compra pelo lojista). */
export const createCardRefundRequestSchema = z.object({
  accountId: uuidSchema,
  description: shortTextSchema.max(120),
  amountMinor: positiveMinorUnitsSchema,
  occurredAt: isoDateSchema,
  memberId: uuidSchema,
  categoryId: uuidSchema.optional(),
  idempotencyKey: idempotencyKeySchema,
});
export type CreateCardRefundRequest = z.infer<typeof createCardRefundRequestSchema>;

export const closeCardStatementRequestSchema = z.object({
  expectedVersion: z.int().nonnegative(),
});
export type CloseCardStatementRequest = z.infer<typeof closeCardStatementRequestSchema>;
