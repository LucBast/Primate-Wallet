/**
 * Cliente HTTP do app.
 *
 * Responsabilidades:
 * - Falar somente pelos contratos de @ff/api-contracts (nenhum tipo paralelo).
 * - Traduzir o envelope de erro do servidor em `ApiRequestError`, com `code`
 *   tipado — a UI decide o que mostrar a partir do código, nunca do texto.
 * - Renovar o access token automaticamente uma vez por requisição, quando o
 *   servidor responde 401 de token expirado.
 */

import { apiErrorSchema, type ApiError } from '@ff/api-contracts';
import type { DomainErrorCode } from '@ff/domain';
import { appConfig } from './config';

export class ApiRequestError extends Error {
  readonly code: DomainErrorCode | 'NETWORK_ERROR';
  readonly status: number;
  readonly details: Record<string, unknown> | undefined;
  readonly requestId: string | undefined;

  constructor(
    code: DomainErrorCode | 'NETWORK_ERROR',
    message: string,
    status: number,
    details?: Record<string, unknown>,
    requestId?: string,
  ) {
    super(message);
    this.name = 'ApiRequestError';
    this.code = code;
    this.status = status;
    this.details = details;
    this.requestId = requestId;
  }

  /** Sem conexão ou servidor inacessível — dispara o estado offline da UI. */
  get isOffline(): boolean {
    return this.code === 'NETWORK_ERROR';
  }
}

export type RequestOptions = {
  readonly method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  readonly body?: unknown;
  readonly accessToken?: string | undefined;
  /** Comandos financeiros exigem chave de idempotência (docs/04 §14). */
  readonly idempotencyKey?: string;
  /**
   * Operação que docs/11 §1 proíbe offline — baixa, pagamento de fatura,
   * transferência, estorno, aprovação e mudança de permissão.
   *
   * Sem rede, a falha vira `OFFLINE_OPERATION_REJECTED` em vez do genérico
   * "sem conexão": a diferença importa porque estas NÃO vão para o outbox, e a
   * pessoa precisa saber que o comando não ficou guardado esperando a rede.
   */
  readonly requiresConnection?: boolean;
  readonly signal?: AbortSignal;
};

function toApiRequestError(status: number, payload: unknown): ApiRequestError {
  const parsed = apiErrorSchema.safeParse(payload);
  if (parsed.success) {
    const error: ApiError = parsed.data;
    return new ApiRequestError(error.code, error.message, status, error.details, error.requestId);
  }
  return new ApiRequestError(
    'INTERNAL_ERROR',
    'Não foi possível concluir agora. Tente de novo.',
    status,
  );
}

/**
 * Renovação do access token, registrada pelo `session-store`.
 *
 * O cliente HTTP não sabe guardar sessão nem falar com o Keychain; ele só sabe
 * que, diante de um 401 de token expirado, existe alguém capaz de devolver um
 * token novo. Devolver `null` significa "a sessão acabou de verdade".
 */
type TokenRefresher = () => Promise<string | null>;

let refresher: TokenRefresher | null = null;
/** Uma renovação por vez: dez requisições que caem juntas esperam a mesma. */
let inFlight: Promise<string | null> | null = null;

export function setTokenRefresher(next: TokenRefresher | null): void {
  refresher = next;
}

/**
 * Aviso de "a rede voltou".
 *
 * Depois de uma falha de rede, a primeira requisição que dá certo é o sinal
 * mais barato e mais confiável de que dá para esvaziar o outbox — mais do que
 * um temporizador, que insiste sem saber, e sem custar uma dependência nativa
 * de conectividade só para responder a mesma pergunta.
 */
type ReconnectListener = () => void;

let reconnectListener: ReconnectListener | null = null;
let sawNetworkFailure = false;

export function setReconnectListener(next: ReconnectListener | null): void {
  reconnectListener = next;
}

async function renewOnce(): Promise<string | null> {
  if (refresher === null) return null;
  inFlight ??= refresher().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

/** 401 com token expirado — o único caso que vale tentar renovar. */
function isExpiredToken(error: ApiRequestError): boolean {
  return error.status === 401 && error.code !== 'INVALID_CREDENTIALS';
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  try {
    return await sendOnce<T>(path, options);
  } catch (error) {
    if (
      options.requiresConnection === true &&
      error instanceof ApiRequestError &&
      error.isOffline
    ) {
      throw new ApiRequestError(
        'OFFLINE_OPERATION_REJECTED',
        'Esta operação exige conexão com a internet.',
        0,
      );
    }
    // Renova e repete UMA vez. Sem token na requisição não há o que renovar,
    // e a chamada de refresh em si nunca entra neste caminho.
    if (
      !(error instanceof ApiRequestError) ||
      !isExpiredToken(error) ||
      options.accessToken === undefined ||
      path.startsWith('/auth/refresh')
    ) {
      throw error;
    }
    const fresh = await renewOnce();
    if (fresh === null) throw error;
    return sendOnce<T>(path, { ...options, accessToken: fresh });
  }
}

async function sendOnce<T>(path: string, options: RequestOptions): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), appConfig.requestTimeoutMs);

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (options.accessToken) headers['Authorization'] = `Bearer ${options.accessToken}`;
  if (options.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey;

  try {
    const response = await fetch(`${appConfig.apiBaseUrl}${path}`, {
      method: options.method ?? 'GET',
      headers,
      signal: options.signal ?? controller.signal,
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    });

    if (sawNetworkFailure) {
      sawNetworkFailure = false;
      reconnectListener?.();
    }

    const text = await response.text();
    const payload: unknown = text === '' ? null : JSON.parse(text);

    if (!response.ok) {
      throw toApiRequestError(response.status, payload);
    }
    return payload as T;
  } catch (error) {
    if (error instanceof ApiRequestError) throw error;
    // Timeout, DNS, offline: um único código, tratado como "sem conexão".
    sawNetworkFailure = true;
    throw new ApiRequestError(
      'NETWORK_ERROR',
      'Sem conexão no momento. Verifique sua internet.',
      0,
    );
  } finally {
    clearTimeout(timeout);
  }
}
