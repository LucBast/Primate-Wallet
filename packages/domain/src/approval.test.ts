import { describe, expect, it } from 'vitest';
import { requiresApproval, type ApprovalRule } from './approval.js';

const rule = (over: Partial<ApprovalRule>): ApprovalRule => ({
  isSupervised: true,
  mode: 'NEVER',
  thresholdMinor: null,
  ...over,
});

describe('requiresApproval', () => {
  it('não pede aprovação de quem não é supervisionado, seja qual for o modo', () => {
    expect(requiresApproval(rule({ isSupervised: false, mode: 'ALWAYS' }), 1_000_00)).toBe(false);
  });

  it('pede sempre no modo ALWAYS, mesmo em valor irrisório', () => {
    expect(requiresApproval(rule({ mode: 'ALWAYS' }), 1)).toBe(true);
  });

  it('nunca pede no modo NEVER', () => {
    expect(requiresApproval(rule({ mode: 'NEVER' }), 10_000_00)).toBe(false);
  });

  it('trata o limite como inclusivo: gastar exatamente o limite passa direto', () => {
    const above = rule({ mode: 'ABOVE_THRESHOLD', thresholdMinor: 50_00 });
    expect(requiresApproval(above, 49_99)).toBe(false);
    expect(requiresApproval(above, 50_00)).toBe(false);
    expect(requiresApproval(above, 50_01)).toBe(true);
  });

  it('falha FECHADO quando o limite sumiu: pede aprovação em vez de liberar', () => {
    expect(requiresApproval(rule({ mode: 'ABOVE_THRESHOLD', thresholdMinor: null }), 1)).toBe(true);
  });

  it('limite zero pede aprovação de qualquer gasto', () => {
    const zero = rule({ mode: 'ABOVE_THRESHOLD', thresholdMinor: 0 });
    expect(requiresApproval(zero, 1)).toBe(true);
    expect(requiresApproval(zero, 0)).toBe(false);
  });
});
