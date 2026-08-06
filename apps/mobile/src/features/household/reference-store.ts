/**
 * Dados de referência da família: contas, categorias e membros.
 *
 * São lidos por quase toda tela de lançamento. Carregar uma vez e compartilhar
 * evita três requisições por formulário aberto e mantém as opções coerentes
 * entre telas. Um `reload()` explícito atualiza depois de criar conta/categoria.
 */

import { create } from 'zustand';
import type { Account, Category, Member } from '@ff/api-contracts';
import * as accountApi from '../account/account-api';
import { listMembers } from './household-api';

export type ReferenceState = {
  readonly householdId: string | null;
  readonly accounts: readonly Account[];
  readonly categories: readonly Category[];
  readonly members: readonly Member[];
  readonly loading: boolean;
  readonly error: string | null;
  load: (accessToken: string, householdId: string) => Promise<void>;
  reset: () => void;
};

export const useReferenceStore = create<ReferenceState>((set) => ({
  householdId: null,
  accounts: [],
  categories: [],
  members: [],
  loading: false,
  error: null,

  load: async (accessToken, householdId) => {
    set({ loading: true, error: null });
    try {
      const [accounts, categories, members] = await Promise.all([
        accountApi.listAccounts(accessToken, householdId),
        accountApi.listCategories(accessToken, householdId),
        listMembers(accessToken, householdId),
      ]);
      set({
        householdId,
        accounts,
        categories,
        // Convidados ainda não podem receber lançamentos.
        members: members.filter((member) => member.status === 'ACTIVE'),
        loading: false,
      });
    } catch (error) {
      set({
        loading: false,
        error: error instanceof Error ? error.message : 'Falha ao carregar dados da família',
      });
    }
  },

  reset: () =>
    set({
      householdId: null,
      accounts: [],
      categories: [],
      members: [],
      loading: false,
      error: null,
    }),
}));
