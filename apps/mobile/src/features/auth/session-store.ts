/**
 * Estado da sessão (Zustand).
 *
 * Mantém apenas o necessário para decidir qual navegador mostrar e para assinar
 * requisições. Nenhum dado financeiro passa por aqui.
 */

import { create } from 'zustand';
import type { Profile, Session } from '@ff/api-contracts';
import * as authApi from './auth-api';
import { setTokenRefresher } from '../../services/api-client';
import { clearSession, loadSession, saveSession } from './session-storage';

export type SessionStatus = 'carregando' | 'autenticado' | 'anonimo';

export type SessionState = {
  readonly status: SessionStatus;
  readonly profile: Profile | null;
  readonly accessToken: string | null;
  readonly refreshToken: string | null;
  /** Lê o Keychain no arranque e revalida a sessão guardada. */
  restore: () => Promise<void>;
  /** Troca o refresh token por um access novo; `null` = sessão encerrada. */
  renewAccessToken: () => Promise<string | null>;
  signIn: (session: Session) => Promise<void>;
  signOut: () => Promise<void>;
};

export const useSessionStore = create<SessionState>((set, get) => ({
  status: 'carregando',
  profile: null,
  accessToken: null,
  refreshToken: null,

  /**
   * Renova o access token quando o servidor recusa o atual.
   *
   * O access token vale 15 minutos; sem isto, quinze minutos de uso derrubavam
   * a pessoa para o login com "Sua sessão expirou" — que é justamente o que o
   * refresh token existe para evitar. Devolver `null` significa sessão de fato
   * encerrada (revogada em outro aparelho, por exemplo), e aí o app volta ao
   * login limpando o Keychain.
   */
  renewAccessToken: async () => {
    const { refreshToken } = get();
    if (refreshToken === null) return null;
    try {
      const session = await authApi.refresh(refreshToken);
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
      return session.accessToken;
    } catch {
      await clearSession();
      set({ status: 'anonimo', profile: null, accessToken: null, refreshToken: null });
      return null;
    }
  },

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

/**
 * Liga o cliente HTTP ao store: qualquer 401 de token expirado passa a renovar
 * e repetir, em vez de derrubar a sessão.
 */
setTokenRefresher(() => useSessionStore.getState().renewAccessToken());
