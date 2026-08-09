/**
 * Liga a sincronização ao ciclo de vida do app.
 *
 * Três gatilhos, nenhum laço de fundo:
 *   1. o app entra em primeiro plano (a rede costuma ter voltado nesse meio);
 *   2. a primeira requisição que funciona depois de uma queda de rede;
 *   3. a pessoa toca em "Tentar" na faixa de sincronização.
 *
 * Um temporizador insistindo em segundo plano gastaria bateria para resolver
 * algo que o próximo toque na tela resolve de graça.
 */

import { useEffect } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { setReconnectListener } from '../services/api-client';
import { useSessionStore } from '../features/auth/session-store';
import { useActiveHousehold } from '../features/household/household-store';
import { useSyncStore } from './sync-store';

export function useSync(): void {
  const accessToken = useSessionStore((state) => state.accessToken);
  const household = useActiveHousehold();
  const householdId = household?.id ?? null;

  useEffect(() => {
    if (householdId === null || accessToken === null) return;

    const run = (): void => {
      void useSyncStore.getState().sync(householdId, accessToken);
    };
    run();

    const subscription = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'active') run();
    });
    // Terceiro gatilho: a primeira requisição que volta a funcionar depois de
    // uma queda. É quando a fila tem mais chance de esvaziar de primeira.
    setReconnectListener(run);

    return () => {
      subscription.remove();
      setReconnectListener(null);
    };
  }, [accessToken, householdId]);
}
