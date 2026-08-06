/**
 * Família ativa.
 *
 * Uma pessoa pode participar de mais de uma família (docs/05 §4.1); a família
 * ativa é o contexto de todas as telas financeiras e aparece no seletor do topo
 * do Início ("Família Souza ▾").
 */

import { create } from 'zustand';
import type { Household } from '@ff/api-contracts';
import * as api from './household-api';

export type HouseholdState = {
  readonly households: readonly Household[];
  readonly activeId: string | null;
  readonly loading: boolean;
  readonly error: string | null;
  load: (accessToken: string) => Promise<void>;
  setActive: (householdId: string) => void;
  reset: () => void;
};

export const useHouseholdStore = create<HouseholdState>((set, get) => ({
  households: [],
  activeId: null,
  loading: false,
  error: null,

  load: async (accessToken) => {
    set({ loading: true, error: null });
    try {
      const households = await api.listHouseholds(accessToken);
      const current = get().activeId;
      set({
        households,
        loading: false,
        // Mantém a família ativa se ela continua existindo; senão, a primeira.
        activeId:
          current !== null && households.some((item) => item.id === current)
            ? current
            : (households[0]?.id ?? null),
      });
    } catch (error) {
      set({ loading: false, error: error instanceof Error ? error.message : 'Falha ao carregar' });
    }
  },

  setActive: (householdId) => set({ activeId: householdId }),

  reset: () => set({ households: [], activeId: null, loading: false, error: null }),
}));

/** Família ativa completa, ou null. */
export function useActiveHousehold(): Household | null {
  return useHouseholdStore(
    (state) => state.households.find((item) => item.id === state.activeId) ?? null,
  );
}
