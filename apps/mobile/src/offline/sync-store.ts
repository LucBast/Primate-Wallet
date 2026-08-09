/**
 * Estado da sincronização (docs/11 §4 "Feedback").
 *
 * Os cinco estados que o pacote exige aparecem aqui e, por consequência, na UI:
 * salvo localmente (`pendentes > 0`), aguardando sincronização (`ocioso` com
 * pendentes), sincronizando, falhou (`falhou`) e requer atenção (`bloqueados`,
 * itens que o servidor recusou e que não adianta reenviar).
 *
 * Quem dispara a sincronização é o app: ao voltar do segundo plano, depois de
 * cada lançamento e quando uma requisição volta a funcionar. Não há laço de
 * retentativa em segundo plano — bateria não se gasta insistindo numa rede que
 * a pessoa sabe que caiu, e o próximo toque na tela já resolve.
 */

import { create } from 'zustand';
import { request } from '../services/api-client';
import type { OutboxSnapshot } from './outbox';

/**
 * O outbox é carregado sob demanda, e não no topo do arquivo.
 *
 * Importá-lo eagermente arrastaria o adaptador SQLite — e, com ele, o módulo
 * nativo do WatermelonDB — para dentro do grafo de qualquer tela que só quisesse
 * DESENHAR o estado da sincronização. Aqui só as ações tocam o banco.
 */
const outbox = async () => import('./outbox');

export type SyncStatus = 'ocioso' | 'sincronizando' | 'falhou';

export type SyncState = {
  readonly status: SyncStatus;
  /** Itens que ainda não chegaram ao servidor. */
  readonly pendentes: number;
  /** Itens recusados de forma definitiva — precisam de decisão da pessoa. */
  readonly bloqueados: OutboxSnapshot[];
  /** Última sincronização bem-sucedida. */
  readonly ultimaEm: Date | null;
  refresh: (householdId: string) => Promise<void>;
  sync: (householdId: string, accessToken: string) => Promise<void>;
  reset: () => void;
};

export const useSyncStore = create<SyncState>((set, get) => ({
  status: 'ocioso',
  pendentes: 0,
  bloqueados: [],
  ultimaEm: null,

  refresh: async (householdId) => {
    const items = await (await outbox()).pending(householdId);
    set({
      pendentes: items.length,
      bloqueados: items.filter((item) => item.status === 'failed'),
    });
  },

  sync: async (householdId, accessToken) => {
    if (get().status === 'sincronizando') return;
    set({ status: 'sincronizando' });
    try {
      const { flush, purgeDone } = await outbox();
      const result = await flush(householdId, (path, body) =>
        request(path, { method: 'POST', body, accessToken }),
      );
      await purgeDone(householdId);
      await get().refresh(householdId);
      set({
        status: result.stillPending > 0 ? 'falhou' : 'ocioso',
        ...(result.sent > 0 ? { ultimaEm: new Date() } : {}),
      });
    } catch {
      // `flush` já trata erro por item; chegar aqui é falha do banco local.
      set({ status: 'falhou' });
    }
  },

  reset: () => set({ status: 'ocioso', pendentes: 0, bloqueados: [], ultimaEm: null }),
}));
