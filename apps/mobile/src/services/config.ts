/**
 * Configuração do app por ambiente.
 *
 * O app não guarda segredo algum (docs/10 §8): só a URL da API e o esquema de
 * deep link. Valores por ambiente são resolvidos em build; em desenvolvimento,
 * `__DEV__` aponta para o backend local.
 *
 * Atenção ao emulador Android: `localhost` é o próprio emulador, e o host da
 * máquina é 10.0.2.2.
 */

import { Platform } from 'react-native';

const DEV_PORT = 3400;

function devApiBaseUrl(): string {
  const host = Platform.OS === 'android' ? '10.0.2.2' : 'localhost';
  return `http://${host}:${DEV_PORT}`;
}

export const appConfig = {
  apiBaseUrl: __DEV__ ? devApiBaseUrl() : 'https://api.familyfinance.app',
  deepLinkScheme: 'familyfinance',
  appVersion: '0.1.0',
  /** Timeout de rede; acima disso o app mostra o estado offline. */
  requestTimeoutMs: 15_000,
} as const;
