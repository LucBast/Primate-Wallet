/**
 * Regra de aprovação de lançamentos (docs/05 §4.1, docs/04 §16; telas 3b e 3c).
 *
 * A regra mora no membro: `NEVER`, `ALWAYS` ou `ABOVE_THRESHOLD` com um valor
 * limite. Aqui só existe a decisão pura — quem grava a pendência é o serviço.
 *
 * Duas invariantes que o pacote exige e que ficam visíveis já nesta função:
 *  - o limite é INCLUSIVO: gastar exatamente o valor limite NÃO pede aprovação
 *    ("Valor limite sem aprovação · R$ 50,00", copy da 8b);
 *  - sem limite gravado, `ABOVE_THRESHOLD` se comporta como `ALWAYS` — nunca
 *    como `NEVER`. Regra de supervisão que falha aberta é regra que não existe.
 */

export type ApprovalMode = 'NEVER' | 'ALWAYS' | 'ABOVE_THRESHOLD';

export type ApprovalRule = {
  readonly isSupervised: boolean;
  readonly mode: ApprovalMode;
  readonly thresholdMinor: number | null;
};

export function requiresApproval(rule: ApprovalRule, amountMinor: number): boolean {
  if (!rule.isSupervised) return false;
  switch (rule.mode) {
    case 'NEVER':
      return false;
    case 'ALWAYS':
      return true;
    case 'ABOVE_THRESHOLD':
      return rule.thresholdMinor === null ? true : amountMinor > rule.thresholdMinor;
  }
}
