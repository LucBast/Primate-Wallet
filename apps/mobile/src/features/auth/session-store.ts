/**
 * Estado da sessão (Zustand).
 *
 * Mantém apenas o necessário para decidir qual navegador mostrar e para assinar
 * requisições. Nenhum dado financeiro passa por aqui.
 */

import { create } from 'zustand';
import type { Profile, Session } from '@ff/api-contracts';
import * as authApi from './auth-api';
import { clearSession, loadSession, saveSession } from './session-storage';

export type SessionStatus = 'carregando' | 'autenticado' | 'anonimo';

export type SessionState = {
  readonly status: SessionStatus;
  readonly profile: Profile | null;
  readonly accessToken: string | null;
  readonly refreshToken: string | null;
  /** Lê o Keychain no arranque e revalida a sessão guardada. */
  restore: () => Promise<void>;
  signIn: (session: Session) => Promise<void>;
  signOut: () => Promise<void>;
};

export const useSessionStore = create<SessionState>((set, get) => ({
  status: 'carregando',
  profile: null,
  accessToken: null,
  refreshToken: null,

  restore: async () => {
    const stored = await loadSession();
    if (!stored) {
      set({ status: 'anonimo', profile: null, accessToken: null, refreshToken: null });
      return;
    }

    try {
      // Renova já no arranque: o access token guardado quase sempre expirou, e
      // o refresh confirma que a sessão não foi revogada em outro aparelho.
      const session = await authApi.refresh(stored.refreshToken);
      await saveSession({
        accessToken: session.accessToken,
        refreshToken: session.refreshToken,
        userId: session.profile.id,
      });
      set({
        status: 'autenticado',
        profile: session.profile,
        accessToken: session.accessToken,
        refreshToken: session.refreshToken,
      });
    } catch {
      // Sessão revogada, expirada ou aparelho offline: volta para o login.
      await clearSession();
      set({ status: 'anonimo', profile: null, accessToken: null, refreshToken: null });
    }
  },

  signIn: async (session) => {
    await saveSession({
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      userId: session.profile.id,
    });
    set({
      status: 'autenticado',
      profile: session.profile,
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
    });
  },

  signOut: async () => {
    const { refreshToken } = get();
    if (refreshToken) {
      // Falha ao avisar o servidor não pode impedir a saída local.
      await authApi.logout(refreshToken).catch(() => undefined);
    }
    await clearSession();
    set({ status: 'anonimo', profile: null, accessToken: null, refreshToken: null });
  },
}));
