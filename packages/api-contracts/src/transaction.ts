/**
 * Contratos de movimentações realizadas (docs/09 §5, §6, §9; tela 1g).
 *
 * Invariantes que aparecem já no contrato:
 *  - valor sempre POSITIVO; o sinal vem do tipo da movimentação;
 *  - transferência exige origem ≠ destino e não é receita nem despesa;
 *  - estorno exige motivo;
 *  - todo comando financeiro exige `idempotencyKey` (docs/04 §14);
 *  - rateio precisa somar exatamente o valor total (docs/04 §12).
 */

import { z } from 'zod';
import {
  cursorSchema,
  descriptionSchema,
  idempotencyKeySchema,
  isoDateSchema,
  minorUnitsSchema,
  positiveMinorUnitsSchema,
  shortTextSchema,
  uuidSchema,
} from '@ff/validation';

export const transactionTypeSchema = z.enum([
  'EXPENSE',
  'INCOME',
  'TRANSFER',
  'CARD_PURCHASE',
  'CARD_PAYMENT',
  'ADJUSTMENT',
  'REFUND',
  'REVERSAL',
]);
export type TransactionType = z.infer<typeof transactionTypeSchema>;

export const transactionStatusSchema = z.enum([
  'PENDING_APPROVAL',
  'POSTED',
  'REVERSED',
  'REJECTED',
]);
export type TransactionStatus = z.infer<typeof transactionStatusSchema>;

export const transactionSourceSchema = z.enum([
  'MANUAL',
  'BOTTOM_ACTION',
  'SHORTCUT',
  'NOTIFICATION',
  'RECURRENCE',
  'SETTLEMENT',
  'IMPORT',
  'SYSTEM',
]);
export type TransactionSource = z.infer<typeof transactionSourceSchema>;

export const allocationSchema = z.object({
  categoryId: uuidSchema.nullable(),
  categoryName: z.string().nullable(),
  memberId: uuidSchema,
  memberName: z.string().nullable(),
  amountMinor: minorUnitsSchema,
});
export type Allocation = z.infer<typeof allocationSchema>;

export const transactionSchema = z.object({
  id: uuidSchema,
  householdId: uuidSchema,
  transactionType: transactionTypeSchema,
  description: z.string(),
  amountMinor: minorUnitsSchema,
  occurredAt: z.string(),
  competenceDate: z.string(),
  accountId: uuidSchema,
  accountName: z.string().nullable(),
  destinationAccountId: uuidSchema.nullable(),
  destinationAccountName: z.string().nullable(),
  memberId: uuidSchema,
  memberName: z.string().nullable(),
  categoryId: uuidSchema.nullable(),
  categoryName: z.string().nullable(),
  counterpartyName: z.string().nullable(),
  source: transactionSourceSchema,
  status: transactionStatusSchema,
  notes: z.string().nullable(),
  reason: z.string().nullable(),
  /** Estorno que anulou esta movimentação, quando existe. */
  reversalTransactionId: uuidSchema.nullable(),
  reversedTransactionId: uuidSchema.nullable(),
  plannedEntryId: uuidSchema.nullable(),
  allocations: z.array(allocationSchema),
  createdByName: z.string().nullable(),
  version: z.int(),
});
export type Transaction = z.infer<typeof transactionSchema>;

const allocationInputSchema = z.object({
  categoryId: uuidSchema.optional(),
  memberId: uuidSchema,
  amountMinor: positiveMinorUnitsSchema,
});

const commonEntryFields = {
  description: shortTextSchema.max(120),
  amountMinor: positiveMinorUnitsSchema,
  accountId: uuidSchema,
  memberId: uuidSchema,
  categoryId: uuidSchema.optional(),
  counterpartyName: shortTextSchema.max(80).optional(),
  competenceDate: isoDateSchema.optional(),
  occurredAt: isoDateSchema.optional(),
  notes: descriptionSchema.optional(),
  source: transactionSourceSchema.default('MANUAL'),
  /** Rateio opcional; quando vier, precisa somar exatamente o valor. */
  allocations: z.array(allocationInputSchema).optional(),
  /** Quita uma conta prevista sem passar pela tela de baixa. */
  plannedEntryId: uuidSchema.optional(),
  idempotencyKey: idempotencyKeySchema,
};

function allocationsMustMatchTotal(
  input: { amountMinor: number; allocations?: Array<{ amountMinor: number }> | undefined },
  ctx: z.RefinementCtx,
): void {
  if (input.allocations === undefined || input.allocations.length === 0) return;
  const total = input.allocations.reduce((sum, item) => sum + item.amountMinor, 0);
  if (total !== input.amountMinor) {
    ctx.addIssue({
      code: 'custom',
      path: ['allocations'],
      message: 'A soma do rateio deve ser igual ao valor total.',
    });
  }
}

export const createExpenseRequestSchema = z
  .object(commonEntryFields)
  .superRefine(allocationsMustMatchTotal);
export type CreateExpenseRequest = z.infer<typeof createExpenseRequestSchema>;

export const createIncomeRequestSchema = z
  .object(commonEntryFields)
  .superRefine(allocationsMustMatchTotal);
export type CreateIncomeRequest = z.infer<typeof createIncomeRequestSchema>;

export const createTransferRequestSchema = z
  .object({
    description: shortTextSchema.max(120),
    amountMinor: positiveMinorUnitsSchema,
    fromAccountId: uuidSchema,
    toAccountId: uuidSchema,
    memberId: uuidSchema,
    competenceDate: isoDateSchema.optional(),
    occurredAt: isoDateSchema.optional(),
    notes: descriptionSchema.optional(),
    /** Tarifa bancária, lançada como despesa separada (docs/04 §9). */
    feeMinor: positiveMinorUnitsSchema.optional(),
    feeCategoryId: uuidSchema.optional(),
    idempotencyKey: idempotencyKeySchema,
  })
  .refine(
    (input) => input.fromAccountId !== input.toAccountId,
    'A conta de origem e a de destino precisam ser diferentes.',
  );
export type CreateTransferRequest = z.infer<typeof createTransferRequestSchema>;

export const reverseTransactionRequestSchema = z.object({
  reason: shortTextSchema.max(200),
  idempotencyKey: idempotencyKeySchema,
});
export type ReverseTransactionRequest = z.infer<typeof reverseTransactionRequestSchema>;

export const updateAllocationsRequestSchema = z
  .object({
    allocations: z.array(allocationInputSchema).min(1),
    expectedVersion: z.int().nonnegative(),
  })
  .describe('Rateio da movimentação; a soma é validada contra o valor no servidor.');
export type UpdateAllocationsRequest = z.infer<typeof updateAllocationsRequestSchema>;

/** Filtros da tela 1g (busca e filtros por período, conta, categoria, membro). */
export const transactionFilterSchema = z.object({
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
  accountId: uuidSchema.optional(),
  categoryId: uuidSchema.optional(),
  memberId: uuidSchema.optional(),
  type: transactionTypeSchema.optional(),
  status: transactionStatusSchema.optional(),
  /** Busca por descrição, favorecido ou valor exato em centavos. */
  search: z.string().trim().max(80).optional(),
  cursor: cursorSchema.optional(),
  // Vem da query string, então precisa de coerção: "20" chega como texto.
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});
export type TransactionFilter = z.infer<typeof transactionFilterSchema>;

export const transactionPageSchema = z.object({
  items: z.array(transactionSchema),
  nextCursor: z.string().nullable(),
});
export type TransactionPage = z.infer<typeof transactionPageSchema>;
