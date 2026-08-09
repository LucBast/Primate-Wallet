/**
 * Configuração do app por ambiente.
 *
 * O app não guarda segredo algum (docs/10 §8): só a URL da API e o esquema de
 * deep link. Valores por ambiente são resolvidos em build; em desenvolvimento,
 * `__DEV__` aponta para o backend local.
 *
 * Atenção ao emulador Android: `localhost` é o próprio emulador, e o host da
 * máquina é 10.0.2.2. Já um APARELHO real na mesma Wi-Fi precisa do IP da
 * máquina na rede — daí o `FF_API_URL`.
 */

import { Platform } from 'react-native';

const DEV_PORT = 3400;

/**
 * Endereço da API embutido no bundle (`FF_API_URL=… npm run build:device`).
 *
 * O Babel troca esta expressão pelo valor literal no momento do bundle; sem a
 * variável definida, ela vira `undefined` e o app segue com os padrões. É o que
 * permite instalar um APK no telefone e falar com o backend desta máquina sem
 * cabo, sem Metro e sem editar código.
 */
// `process` não existe no runtime do Hermes, e nem precisa: o Babel substitui
// a expressão inteira pelo literal antes de o código chegar ao aparelho. A
// declaração abaixo é só para o TypeScript enxergar o que o Babel vai trocar.
declare const process: { readonly env: Readonly<Record<string, string | undefined>> };

const buildTimeApiUrl = process.env['FF_API_URL'];

function devApiBaseUrl(): string {
  const host = Platform.OS === 'android' ? '10.0.2.2' : 'localhost';
  return `http://${host}:${DEV_PORT}`;
}

export const appConfig = {
  apiBaseUrl:
    buildTimeApiUrl !== undefined && buildTimeApiUrl !== ''
      ? buildTimeApiUrl
      : __DEV__
        ? devApiBaseUrl()
        : 'https://api.familyfinance.app',
  deepLinkScheme: 'familyfinance',
  appVersion: '0.1.0',
  /** Timeout de rede; acima disso o app mostra o estado offline. */
  requestTimeoutMs: 15_000,
} as const;
