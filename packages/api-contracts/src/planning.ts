/**
 * Contratos de planejamento: contas a pagar/receber, recorrências,
 * parcelamentos e anexos (docs/09 §3; telas 1d e 1e).
 */

import { z } from 'zod';
import {
  descriptionSchema,
  idempotencyKeySchema,
  isoDateSchema,
  minorUnitsSchema,
  nonNegativeMinorUnitsSchema,
  positiveMinorUnitsSchema,
  shortTextSchema,
  uuidSchema,
} from '@ff/validation';

export const plannedEntryNatureSchema = z.enum(['PAYABLE', 'RECEIVABLE']);
export type PlannedEntryNature = z.infer<typeof plannedEntryNatureSchema>;

export const plannedEntryStatusSchema = z.enum(['OPEN', 'PARTIAL', 'SETTLED', 'CANCELED']);
export type PlannedEntryStatus = z.infer<typeof plannedEntryStatusSchema>;

export const frequencySchema = z.enum(['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY']);
export type Frequency = z.infer<typeof frequencySchema>;

export const recurrenceInputSchema = z
  .object({
    frequency: frequencySchema,
    interval: z.int().min(1).max(60).default(1),
    endDate: isoDateSchema.optional(),
    maxOccurrences: z.int().min(1).max(240).optional(),
    dayOfMonth: z.int().min(1).max(31).optional(),
    daysOfWeek: z.array(z.int().min(0).max(6)).optional(),
  })
  .refine(
    (input) => input.endDate === undefined || input.maxOccurrences === undefined,
    'Informe data final OU número de ocorrências, não os dois.',
  );
export type RecurrenceInput = z.infer<typeof recurrenceInputSchema>;

export const plannedEntrySchema = z.object({
  id: uuidSchema,
  householdId: uuidSchema,
  nature: plannedEntryNatureSchema,
  description: z.string(),
  originalAmountMinor: minorUnitsSchema,
  /** Derivado: original − principal das baixas válidas (docs/04 §4). */
  outstandingMinor: minorUnitsSchema,
  settledMinor: minorUnitsSchema,
  competenceDate: z.string(),
  dueDate: z.string(),
  expectedAccountId: uuidSchema.nullable(),
  expectedAccountName: z.string().nullable(),
  memberId: uuidSchema,
  memberName: z.string().nullable(),
  categoryId: uuidSchema.nullable(),
  categoryName: z.string().nullable(),
  counterpartyName: z.string().nullable(),
  status: plannedEntryStatusSchema,
  /** Derivado no servidor com o fuso da família; nunca persistido. */
  overdue: z.boolean(),
  overdueDays: z.int(),
  settledPercent: z.int(),
  recurrenceRuleId: uuidSchema.nullable(),
  installmentGroupId: uuidSchema.nullable(),
  installmentNumber: z.int().nullable(),
  installmentTotal: z.int().nullable(),
  notes: z.string().nullable(),
  reminderDaysBefore: z.int().nullable(),
  attachmentCount: z.int(),
  /**
   * Última baixa NÃO estornada — é o "● Paga em 04/08 · Conta Corrente" da 1d.
   * Derivados de `settlements`, nunca persistidos na conta prevista.
   */
  lastSettlementDate: z.string().nullable(),
  lastSettlementAccountName: z.string().nullable(),
  version: z.int(),
});
export type PlannedEntry = z.infer<typeof plannedEntrySchema>;

export const createPlannedEntryRequestSchema = z
  .object({
    nature: plannedEntryNatureSchema,
    description: shortTextSchema.max(120),
    originalAmountMinor: positiveMinorUnitsSchema,
    competenceDate: isoDateSchema,
    dueDate: isoDateSchema,
    expectedAccountId: uuidSchema.optional(),
    memberId: uuidSchema,
    categoryId: uuidSchema.optional(),
    counterpartyName: shortTextSchema.max(80).optional(),
    notes: descriptionSchema.optional(),
    reminderDaysBefore: z.int().min(0).max(60).optional(),
    /** Cria a série inteira de parcelas (centavos na última). */
    installments: z.int().min(2).max(120).optional(),
    recurrence: recurrenceInputSchema.optional(),
    idempotencyKey: idempotencyKeySchema,
  })
  .refine(
    (input) => input.installments === undefined || input.recurrence === undefined,
    'Uma conta prevista é parcelada OU recorrente, não as duas coisas.',
  );
export type CreatePlannedEntryRequest = z.infer<typeof createPlannedEntryRequestSchema>;

export const updatePlannedEntryRequestSchema = z.object({
  description: shortTextSchema.max(120).optional(),
  originalAmountMinor: positiveMinorUnitsSchema.optional(),
  competenceDate: isoDateSchema.optional(),
  dueDate: isoDateSchema.optional(),
  expectedAccountId: uuidSchema.nullable().optional(),
  categoryId: uuidSchema.nullable().optional(),
  memberId: uuidSchema.optional(),
  notes: descriptionSchema.nullable().optional(),
  reminderDaysBefore: z.int().min(0).max(60).nullable().optional(),
  expectedVersion: z.int().nonnegative(),
});
export type UpdatePlannedEntryRequest = z.infer<typeof updatePlannedEntryRequestSchema>;

export const cancelPlannedEntryRequestSchema = z.object({
  reason: shortTextSchema.max(200),
  expectedVersion: z.int().nonnegative(),
});
export type CancelPlannedEntryRequest = z.infer<typeof cancelPlannedEntryRequestSchema>;

/** Resumo do mês para os três mini-cards da tela 1d. */
export const planningSummarySchema = z.object({
  plannedMinor: minorUnitsSchema,
  settledMinor: minorUnitsSchema,
  outstandingMinor: minorUnitsSchema,
  overdueCount: z.int(),
  overdueMinor: minorUnitsSchema,
});
export type PlanningSummary = z.infer<typeof planningSummarySchema>;

export const planningListSchema = z.object({
  items: z.array(plannedEntrySchema),
  summary: planningSummarySchema,
});
export type PlanningList = z.infer<typeof planningListSchema>;

// ------------------------------------------------------------------- baixas

export const settlementSchema = z.object({
  id: uuidSchema,
  plannedEntryId: uuidSchema,
  transactionId: uuidSchema,
  accountId: uuidSchema,
  accountName: z.string().nullable(),
  principalAmountMinor: minorUnitsSchema,
  interestAmountMinor: minorUnitsSchema,
  penaltyAmountMinor: minorUnitsSchema,
  discountAmountMinor: minorUnitsSchema,
  netAmountMinor: minorUnitsSchema,
  settledAt: z.string(),
  createdByName: z.string().nullable(),
  reversedAt: z.string().nullable(),
  reversalReason: z.string().nullable(),
});
export type Settlement = z.infer<typeof settlementSchema>;

export const settlePlannedEntryRequestSchema = z.object({
  /** Principal desta baixa; nunca pode ultrapassar o saldo em aberto. */
  principalAmountMinor: positiveMinorUnitsSchema,
  interestAmountMinor: nonNegativeMinorUnitsSchema.default(0),
  penaltyAmountMinor: nonNegativeMinorUnitsSchema.default(0),
  discountAmountMinor: nonNegativeMinorUnitsSchema.default(0),
  accountId: uuidSchema,
  settledAt: isoDateSchema,
  idempotencyKey: idempotencyKeySchema,
  expectedVersion: z.int().nonnegative(),
});
export type SettlePlannedEntryRequest = z.infer<typeof settlePlannedEntryRequestSchema>;

export const settleResponseSchema = z.object({
  plannedEntry: plannedEntrySchema,
  settlement: settlementSchema,
});
export type SettleResponse = z.infer<typeof settleResponseSchema>;

export const reverseSettlementRequestSchema = z.object({
  reason: shortTextSchema.max(200),
  idempotencyKey: idempotencyKeySchema,
});
export type ReverseSettlementRequest = z.infer<typeof reverseSettlementRequestSchema>;

// ------------------------------------------------------------------ anexos

export const attachmentSchema = z.object({
  id: uuidSchema,
  entityType: z.enum(['planned_entry', 'transaction', 'settlement', 'card_statement']),
  entityId: uuidSchema,
  fileName: z.string(),
  mimeType: z.string(),
  sizeBytes: z.int(),
  createdAt: z.string(),
  /** URL assinada, de vida curta (docs/10 §7). */
  downloadUrl: z.string().nullable(),
});
export type Attachment = z.infer<typeof attachmentSchema>;

export const createAttachmentRequestSchema = z.object({
  entityType: z.enum(['planned_entry', 'transaction', 'settlement', 'card_statement']),
  entityId: uuidSchema,
  fileName: shortTextSchema.max(120),
  mimeType: z.enum(['image/jpeg', 'image/png', 'image/heic', 'image/webp', 'application/pdf']),
  sizeBytes: z.int().min(1).max(26_214_400),
});
export type CreateAttachmentRequest = z.infer<typeof createAttachmentRequestSchema>;

/** Resposta do pedido de upload: para onde enviar o arquivo. */
export const attachmentUploadTicketSchema = z.object({
  attachment: attachmentSchema,
  uploadUrl: z.string(),
  storagePath: z.string(),
  expiresInSeconds: z.int(),
});
export type AttachmentUploadTicket = z.infer<typeof attachmentUploadTicketSchema>;
