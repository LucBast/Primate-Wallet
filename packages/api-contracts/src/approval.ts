/**
 * Contratos de aprovação de lançamentos (docs/04 §16; tela 3c).
 *
 * A movimentação proposta viaja inteira dentro do pedido: a 3c mostra valor,
 * descrição, conta, categoria e o saldo da conta ANTES de decidir. Nada disso é
 * recalculado no app — tudo chega pronto do servidor.
 */

import { z } from 'zod';
import { shortTextSchema, uuidSchema } from '@ff/validation';
import { approvalModeSchema } from './household.js';
import { transactionSchema } from './transaction.js';

export const approvalStatusSchema = z.enum(['PENDING', 'APPROVED', 'REJECTED']);
export type ApprovalStatus = z.infer<typeof approvalStatusSchema>;

export const approvalRequestSchema = z.object({
  id: uuidSchema,
  householdId: uuidSchema,
  status: approvalStatusSchema,
  /** A movimentação proposta, com status `PENDING_APPROVAL` enquanto aguarda. */
  transaction: transactionSchema,
  requestedByMemberId: uuidSchema,
  requestedByName: z.string(),
  /** Cor do avatar do solicitante — a 3c abre com o avatar de quem pediu. */
  requestedByColor: z.string().nullable(),
  /**
   * Regra que ESTAVA valendo quando o pedido nasceu, não a de agora: a linha
   * "Regra acionada" da 3c precisa explicar por que este lançamento parou.
   */
  ruleMode: approvalModeSchema.exclude(['NEVER']),
  ruleThresholdMinor: z.int().nullable(),
  /** Saldo da conta escolhida, para a linha "Saldo da conta" da 3c. */
  accountBalanceMinor: z.int(),
  decidedByName: z.string().nullable(),
  decidedAt: z.string().nullable(),
  decisionMessage: z.string().nullable(),
  createdAt: z.string(),
  version: z.int(),
});
export type ApprovalRequest = z.infer<typeof approvalRequestSchema>;

/** Decisão do adulto: aprovar ou recusar, com mensagem opcional. */
export const decideApprovalRequestSchema = z.object({
  message: shortTextSchema.max(200).optional(),
  /** Controle de concorrência: dois adultos decidindo ao mesmo tempo (docs/04 §15). */
  expectedVersion: z.int().nonnegative(),
});
export type DecideApprovalRequest = z.infer<typeof decideApprovalRequestSchema>;

export const approvalListSchema = z.object({
  items: z.array(approvalRequestSchema),
  /** Alimenta o selo "● N aguardando" da 3a sem uma segunda chamada. */
  pendingCount: z.int().nonnegative(),
});
export type ApprovalList = z.infer<typeof approvalListSchema>;

export const approvalFilterSchema = z.object({
  status: approvalStatusSchema.optional(),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});
export type ApprovalFilter = z.infer<typeof approvalFilterSchema>;
