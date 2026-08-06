/**
 * Contratos de família, membros e convites (docs/05 §4.1, docs/09).
 *
 * O papel e o household NUNCA chegam do cliente como autoridade: o servidor
 * resolve a associação a partir da sessão (docs/10 §1). Estes contratos só
 * carregam o que o usuário de fato escolhe.
 */

import { z } from 'zod';
import {
  emailSchema,
  nonNegativeMinorUnitsSchema,
  shortTextSchema,
  uuidSchema,
} from '@ff/validation';

/** Papéis (docs/05 §3). Copy pt-BR fica no app; aqui só o valor persistido. */
export const householdRoleSchema = z.enum(['OWNER', 'ADMIN', 'ADULT', 'MEMBER', 'CHILD']);
export type HouseholdRole = z.infer<typeof householdRoleSchema>;

/** Papéis que podem ser convidados: proprietário não se convida. */
export const invitableRoleSchema = z.enum(['ADMIN', 'ADULT', 'MEMBER', 'CHILD']);
export type InvitableRole = z.infer<typeof invitableRoleSchema>;

export const memberStatusSchema = z.enum(['INVITED', 'ACTIVE', 'SUSPENDED', 'REMOVED']);
export type MemberStatus = z.infer<typeof memberStatusSchema>;

export const approvalModeSchema = z.enum(['NEVER', 'ALWAYS', 'ABOVE_THRESHOLD']);
export type ApprovalMode = z.infer<typeof approvalModeSchema>;

export const householdSchema = z.object({
  id: uuidSchema,
  name: z.string(),
  currencyCode: z.string().length(3),
  timezone: z.string(),
  createdAt: z.string(),
  /** Papel de quem está pedindo — a UI usa para desabilitar ações. */
  myRole: householdRoleSchema,
  memberCount: z.int().nonnegative(),
});
export type Household = z.infer<typeof householdSchema>;

export const memberSchema = z.object({
  id: uuidSchema,
  householdId: uuidSchema,
  userId: uuidSchema.nullable(),
  displayName: z.string(),
  email: z.string().nullable(),
  role: householdRoleSchema,
  status: memberStatusSchema,
  isSupervised: z.boolean(),
  approvalMode: approvalModeSchema,
  approvalThresholdMinor: z.int().nullable(),
  color: z.string().nullable(),
  joinedAt: z.string().nullable(),
  version: z.int(),
});
export type Member = z.infer<typeof memberSchema>;

export const invitationSchema = z.object({
  id: uuidSchema,
  householdId: uuidSchema,
  email: z.string(),
  role: invitableRoleSchema,
  expiresAt: z.string(),
  /** Derivado no servidor, para a copy "expira em N dias". */
  expiresInDays: z.int(),
  createdAt: z.string(),
});
export type Invitation = z.infer<typeof invitationSchema>;

// ------------------------------------------------------------------ comandos

export const createHouseholdRequestSchema = z.object({
  name: shortTextSchema.max(80),
  currencyCode: z.string().length(3).default('BRL'),
  timezone: z.string().min(1).max(64).default('America/Sao_Paulo'),
  /** Nome de exibição do proprietário dentro da família. */
  ownerDisplayName: shortTextSchema.max(80),
});
export type CreateHouseholdRequest = z.infer<typeof createHouseholdRequestSchema>;

export const updateHouseholdRequestSchema = z.object({
  name: shortTextSchema.max(80).optional(),
  currencyCode: z.string().length(3).optional(),
  timezone: z.string().min(1).max(64).optional(),
});
export type UpdateHouseholdRequest = z.infer<typeof updateHouseholdRequestSchema>;

export const inviteMemberRequestSchema = z
  .object({
    email: emailSchema,
    displayName: shortTextSchema.max(80),
    role: invitableRoleSchema,
    isSupervised: z.boolean().default(false),
    approvalMode: approvalModeSchema.default('NEVER'),
    approvalThresholdMinor: nonNegativeMinorUnitsSchema.optional(),
  })
  .superRefine((input, ctx) => {
    if (input.approvalMode === 'ABOVE_THRESHOLD' && input.approvalThresholdMinor === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['approvalThresholdMinor'],
        message: 'Informe o valor limite para exigir aprovação acima de um valor.',
      });
    }
    if (input.approvalMode !== 'ABOVE_THRESHOLD' && input.approvalThresholdMinor !== undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['approvalThresholdMinor'],
        message: 'Valor limite só se aplica ao modo "acima de um valor".',
      });
    }
  });
export type InviteMemberRequest = z.infer<typeof inviteMemberRequestSchema>;

export const acceptInvitationRequestSchema = z.object({
  token: z.string().min(20).max(256),
});
export type AcceptInvitationRequest = z.infer<typeof acceptInvitationRequestSchema>;

/** Prévia do convite antes de aceitar — alimenta a tela 6b. */
export const invitationPreviewSchema = z.object({
  householdName: z.string(),
  invitedByName: z.string(),
  role: invitableRoleSchema,
  memberCount: z.int().nonnegative(),
  currencyCode: z.string(),
  expiresInDays: z.int(),
  memberNames: z.array(z.string()),
});
export type InvitationPreview = z.infer<typeof invitationPreviewSchema>;

export const updateMemberRequestSchema = z
  .object({
    displayName: shortTextSchema.max(80).optional(),
    role: invitableRoleSchema.optional(),
    isSupervised: z.boolean().optional(),
    approvalMode: approvalModeSchema.optional(),
    approvalThresholdMinor: nonNegativeMinorUnitsSchema.nullable().optional(),
    status: z.enum(['ACTIVE', 'SUSPENDED']).optional(),
    /** Controle de concorrência otimista (docs/04 §15). */
    expectedVersion: z.int().nonnegative(),
  })
  .refine((input) => Object.keys(input).length > 1, 'Informe ao menos um campo para alterar.');
export type UpdateMemberRequest = z.infer<typeof updateMemberRequestSchema>;

export const transferOwnershipRequestSchema = z.object({
  toMemberId: uuidSchema,
});
export type TransferOwnershipRequest = z.infer<typeof transferOwnershipRequestSchema>;

// ------------------------------------------------------------------ auditoria

export const auditEntrySchema = z.object({
  id: uuidSchema,
  actorName: z.string().nullable(),
  entityType: z.string(),
  entityId: uuidSchema.nullable(),
  action: z.string(),
  beforeData: z.record(z.string(), z.unknown()).nullable(),
  afterData: z.record(z.string(), z.unknown()).nullable(),
  metadata: z.record(z.string(), z.unknown()).nullable(),
  createdAt: z.string(),
});
export type AuditEntry = z.infer<typeof auditEntrySchema>;
