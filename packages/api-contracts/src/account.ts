/**
 * Contratos de contas, cartões e categorias (docs/09, telas 2a–2d).
 *
 * Contas bancárias e cartões compartilham a MESMA entidade: o que muda é o
 * `accountType` e os campos de cartão. Isso reflete a invariante nº 2 do
 * projeto e evita dois formulários divergentes.
 */

import { z } from 'zod';
import {
  descriptionSchema,
  isoDateSchema,
  minorUnitsSchema,
  nonNegativeMinorUnitsSchema,
  shortTextSchema,
  uuidSchema,
} from '@ff/validation';

export const accountTypeSchema = z.enum([
  'CHECKING',
  'SAVINGS',
  'CASH',
  'DIGITAL_WALLET',
  'INVESTMENT',
  'CREDIT_CARD',
]);
export type AccountType = z.infer<typeof accountTypeSchema>;

export const visibilityScopeSchema = z.enum([
  'HOUSEHOLD',
  'ADULTS_ONLY',
  'SELECTED_MEMBERS',
  'OWNER_ONLY',
]);
export type VisibilityScope = z.infer<typeof visibilityScopeSchema>;

export const accountSchema = z.object({
  id: uuidSchema,
  householdId: uuidSchema,
  name: z.string(),
  accountType: accountTypeSchema,
  institutionName: z.string().nullable(),
  currencyCode: z.string(),
  openingBalanceMinor: minorUnitsSchema,
  openingBalanceDate: z.string(),
  primaryMemberId: uuidSchema.nullable(),
  primaryMemberName: z.string().nullable(),
  visibilityScope: visibilityScopeSchema,
  color: z.string().nullable(),
  icon: z.string().nullable(),

  cardBrand: z.string().nullable(),
  cardLastFour: z.string().nullable(),
  creditLimitMinor: minorUnitsSchema.nullable(),
  closingDay: z.int().nullable(),
  dueDay: z.int().nullable(),
  defaultPaymentAccountId: uuidSchema.nullable(),

  /** Derivado no servidor (docs/04 §13): saldo, ou dívida no caso do cartão. */
  balanceMinor: minorUnitsSchema,
  /** Só para cartão: limite − dívida. */
  availableLimitMinor: minorUnitsSchema.nullable(),
  /**
   * Só para cartão: estado da fatura do ciclo corrente, derivado — é o
   * "● Fatura parcial" da linha do cartão na 2a.
   */
  currentStatementStatus: z.enum(['OPEN', 'CLOSED', 'PARTIAL', 'PAID']).nullable(),

  archivedAt: z.string().nullable(),
  version: z.int(),
});
export type Account = z.infer<typeof accountSchema>;

const cardFields = {
  cardBrand: shortTextSchema.max(40).optional(),
  cardLastFour: z
    .string()
    .regex(/^[0-9]{4}$/, 'Informe os 4 últimos dígitos.')
    .optional(),
  creditLimitMinor: nonNegativeMinorUnitsSchema.optional(),
  closingDay: z.int().min(1).max(31).optional(),
  dueDay: z.int().min(1).max(31).optional(),
  defaultPaymentAccountId: uuidSchema.optional(),
};

export const createAccountRequestSchema = z
  .object({
    name: shortTextSchema.max(60),
    accountType: accountTypeSchema,
    institutionName: shortTextSchema.max(60).optional(),
    currencyCode: z.string().length(3).default('BRL'),
    openingBalanceMinor: minorUnitsSchema.default(0),
    openingBalanceDate: isoDateSchema.optional(),
    primaryMemberId: uuidSchema.optional(),
    visibilityScope: visibilityScopeSchema.default('HOUSEHOLD'),
    color: z.string().max(20).optional(),
    icon: z.string().max(40).optional(),
    /** Membros com acesso quando a visibilidade é SELECTED_MEMBERS. */
    selectedMemberIds: z.array(uuidSchema).optional(),
    ...cardFields,
  })
  .superRefine((input, ctx) => {
    const isCard = input.accountType === 'CREDIT_CARD';
    if (isCard) {
      for (const field of ['creditLimitMinor', 'closingDay', 'dueDay'] as const) {
        if (input[field] === undefined) {
          ctx.addIssue({
            code: 'custom',
            path: [field],
            message: 'Cartão de crédito exige limite, dia de fechamento e dia de vencimento.',
          });
        }
      }
    } else {
      for (const field of [
        'cardBrand',
        'cardLastFour',
        'creditLimitMinor',
        'closingDay',
        'dueDay',
        'defaultPaymentAccountId',
      ] as const) {
        if (input[field] !== undefined) {
          ctx.addIssue({
            code: 'custom',
            path: [field],
            message: 'Este campo só existe em cartão de crédito.',
          });
        }
      }
    }
    if (
      input.visibilityScope === 'SELECTED_MEMBERS' &&
      (input.selectedMemberIds ?? []).length === 0
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['selectedMemberIds'],
        message: 'Escolha ao menos um membro para a visibilidade restrita.',
      });
    }
  });
export type CreateAccountRequest = z.infer<typeof createAccountRequestSchema>;

export const updateAccountRequestSchema = z.object({
  name: shortTextSchema.max(60).optional(),
  institutionName: shortTextSchema.max(60).nullable().optional(),
  primaryMemberId: uuidSchema.nullable().optional(),
  visibilityScope: visibilityScopeSchema.optional(),
  color: z.string().max(20).nullable().optional(),
  icon: z.string().max(40).nullable().optional(),
  selectedMemberIds: z.array(uuidSchema).optional(),
  cardBrand: shortTextSchema.max(40).nullable().optional(),
  creditLimitMinor: nonNegativeMinorUnitsSchema.optional(),
  closingDay: z.int().min(1).max(31).optional(),
  dueDay: z.int().min(1).max(31).optional(),
  defaultPaymentAccountId: uuidSchema.nullable().optional(),
  expectedVersion: z.int().nonnegative(),
});
export type UpdateAccountRequest = z.infer<typeof updateAccountRequestSchema>;

/** Ajuste de saldo (tela 2d): motivo obrigatório, vira movimentação própria. */
export const adjustBalanceRequestSchema = z.object({
  /** Saldo real informado pelo usuário; o servidor calcula a diferença. */
  newBalanceMinor: minorUnitsSchema,
  reason: shortTextSchema.max(200),
  idempotencyKey: z.string().min(16).max(128),
  expectedVersion: z.int().nonnegative(),
});
export type AdjustBalanceRequest = z.infer<typeof adjustBalanceRequestSchema>;

export const adjustBalanceResponseSchema = z.object({
  account: accountSchema,
  /** Diferença aplicada: positiva credita, negativa debita. */
  adjustmentMinor: minorUnitsSchema,
  transactionId: uuidSchema,
});
export type AdjustBalanceResponse = z.infer<typeof adjustBalanceResponseSchema>;

export const accountPermissionSchema = z.object({
  accountId: uuidSchema,
  accountName: z.string(),
  memberId: uuidSchema,
  canView: z.boolean(),
  canTransact: z.boolean(),
  canEdit: z.boolean(),
});
export type AccountPermission = z.infer<typeof accountPermissionSchema>;

export const setAccountPermissionsRequestSchema = z.object({
  permissions: z.array(
    z.object({
      accountId: uuidSchema,
      canView: z.boolean(),
      canTransact: z.boolean(),
      canEdit: z.boolean(),
    }),
  ),
});
export type SetAccountPermissionsRequest = z.infer<typeof setAccountPermissionsRequestSchema>;

// ---------------------------------------------------------------- categorias

export const categoryNatureSchema = z.enum(['EXPENSE', 'INCOME']);
export type CategoryNature = z.infer<typeof categoryNatureSchema>;

export const categorySchema = z.object({
  id: uuidSchema,
  householdId: uuidSchema,
  parentId: uuidSchema.nullable(),
  name: z.string(),
  nature: categoryNatureSchema,
  icon: z.string().nullable(),
  color: z.string().nullable(),
  sortOrder: z.int(),
  isSystem: z.boolean(),
  archivedAt: z.string().nullable(),
});
export type Category = z.infer<typeof categorySchema>;

export const createCategoryRequestSchema = z.object({
  name: shortTextSchema.max(40),
  nature: categoryNatureSchema,
  parentId: uuidSchema.optional(),
  icon: z.string().max(40).optional(),
  color: z.string().max(20).optional(),
  sortOrder: z.int().min(0).max(999).default(0),
});
export type CreateCategoryRequest = z.infer<typeof createCategoryRequestSchema>;

export const updateCategoryRequestSchema = z.object({
  name: shortTextSchema.max(40).optional(),
  icon: z.string().max(40).nullable().optional(),
  color: z.string().max(20).nullable().optional(),
  sortOrder: z.int().min(0).max(999).optional(),
  archived: z.boolean().optional(),
});
export type UpdateCategoryRequest = z.infer<typeof updateCategoryRequestSchema>;

export const counterpartySchema = z.object({
  id: uuidSchema,
  name: z.string(),
  type: z.string().nullable(),
});
export type Counterparty = z.infer<typeof counterpartySchema>;

/** Linha do extrato da conta (tela 2c). */
export const accountStatementRowSchema = z.object({
  id: uuidSchema,
  transactionType: z.string(),
  description: z.string(),
  amountMinor: minorUnitsSchema,
  /** Efeito no saldo desta conta: já com sinal. */
  signedAmountMinor: minorUnitsSchema,
  occurredAt: z.string(),
  competenceDate: z.string(),
  status: z.string(),
  memberName: z.string().nullable(),
  categoryName: z.string().nullable(),
  counterpartyName: z.string().nullable(),
  reason: z.string().nullable(),
  notes: descriptionSchema.nullable(),
});
export type AccountStatementRow = z.infer<typeof accountStatementRowSchema>;
