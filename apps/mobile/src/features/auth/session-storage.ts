/**
 * Armazenamento da sessão.
 *
 * Tokens vão para o Keychain/Keystore (react-native-keychain), nunca para
 * AsyncStorage ou arquivo (docs/10 §8). O `installationId` identifica esta
 * instalação e é o que permite listar e revogar sessões por aparelho.
 */

import { Platform } from 'react-native';
import * as Keychain from 'react-native-keychain';
import type { DeviceInfo } from '@ff/api-contracts';
import { appConfig } from '../../services/config';

const SESSION_SERVICE = 'br.app.familyfinance.session';
const INSTALLATION_SERVICE = 'br.app.familyfinance.installation';

export type StoredSession = {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly userId: string;
};

/**
 * `WHEN_UNLOCKED_THIS_DEVICE_ONLY`: o segredo não sai deste aparelho nem via
 * backup do sistema, e só é legível com o aparelho desbloqueado.
 */
const SECURITY = {
  accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
} as const;

export async function saveSession(session: StoredSession): Promise<void> {
  await Keychain.setGenericPassword('session', JSON.stringify(session), {
    ...SECURITY,
    service: SESSION_SERVICE,
  });
}

export async function loadSession(): Promise<StoredSession | null> {
  const stored = await Keychain.getGenericPassword({ service: SESSION_SERVICE });
  if (!stored) return null;
  try {
    return JSON.parse(stored.password) as StoredSession;
  } catch {
    // Conteúdo corrompido: descarta e força novo login em vez de quebrar o app.
    await clearSession();
    return null;
  }
}

export async function clearSession(): Promise<void> {
  await Keychain.resetGenericPassword({ service: SESSION_SERVICE });
}

/** Identificador estável desta instalação; criado uma única vez. */
export async function getInstallationId(): Promise<string> {
  const stored = await Keychain.getGenericPassword({ service: INSTALLATION_SERVICE });
  if (stored) return stored.password;

  const installationId = `${Platform.OS}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 12)}`;
  await Keychain.setGenericPassword('installation', installationId, {
    ...SECURITY,
    service: INSTALLATION_SERVICE,
  });
  return installationId;
}

export async function describeDevice(name: string): Promise<DeviceInfo> {
  return {
    installationId: await getInstallationId(),
    platform: Platform.OS === 'ios' ? 'ios' : 'android',
    name,
    appVersion: appConfig.appVersion,
    osVersion: String(Platform.Version),
  };
}
