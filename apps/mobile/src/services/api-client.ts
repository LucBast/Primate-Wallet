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
  readonly method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  readonly body?: unknown;
  readonly accessToken?: string | undefined;
  /** Comandos financeiros exigem chave de idempotência (docs/04 §14). */
  readonly idempotencyKey?: string;
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

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
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

    const text = await response.text();
    const payload: unknown = text === '' ? null : JSON.parse(text);

    if (!response.ok) {
      throw toApiRequestError(response.status, payload);
    }
    return payload as T;
  } catch (error) {
    if (error instanceof ApiRequestError) throw error;
    // Timeout, DNS, offline: um único código, tratado como "sem conexão".
    throw new ApiRequestError(
      'NETWORK_ERROR',
      'Sem conexão no momento. Verifique sua internet.',
      0,
    );
  } finally {
    clearTimeout(timeout);
  }
}
