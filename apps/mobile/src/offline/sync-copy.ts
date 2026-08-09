/**
 * A copy dos cinco estados de sincronização (docs/11 §4).
 *
 * Fica fora do componente por dois motivos: o texto é o que a pessoa lê e
 * precisa estar sob teste (CLAUDE.md item 5, copy é final e não se parafraseia),
 * e a composição — plural, contagem, o ◌ — é regra, não desenho.
 */

import type { SyncStatus } from './sync-store';

function plural(quantidade: number, singular: string, muitos: string): string {
  return `${quantidade} ${quantidade === 1 ? singular : muitos}`;
}

export type SyncMessage =
  | { readonly kind: 'nenhuma' }
  | { readonly kind: 'atencao'; readonly text: string }
  | { readonly kind: 'pendente' | 'sincronizando' | 'falhou'; readonly text: string };

export function syncMessage(
  status: SyncStatus,
  pendentes: number,
  bloqueados: number,
): SyncMessage {
  // Bloqueado vem antes de tudo: é o único estado que precisa de decisão humana.
  if (bloqueados > 0) {
    return {
      kind: 'atencao',
      text: `${plural(bloqueados, 'lançamento recusado', 'lançamentos recusados')} pelo servidor. Requer atenção.`,
    };
  }
  if (pendentes === 0) return { kind: 'nenhuma' };

  if (status === 'sincronizando') {
    return {
      kind: 'sincronizando',
      text: `Sincronizando ${plural(pendentes, 'lançamento', 'lançamentos')}…`,
    };
  }
  if (status === 'falhou') {
    return {
      kind: 'falhou',
      text: `${plural(pendentes, 'lançamento salvo', 'lançamentos salvos')} no aparelho. Tentaremos de novo quando a conexão voltar.`,
    };
  }
  return {
    kind: 'pendente',
    text: `Aguardando sincronização · ${plural(pendentes, 'lançamento salvo', 'lançamentos salvos')} no aparelho`,
  };
}
