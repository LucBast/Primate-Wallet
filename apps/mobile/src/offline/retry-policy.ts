/**
 * O que vale reenviar e o que não vale (docs/11 §3).
 *
 * A distinção é entre "o servidor não respondeu" e "o servidor respondeu que
 * não". No primeiro caso o comando continua na fila e vai de novo quando a rede
 * voltar; no segundo, insistir só esconde da pessoa um problema que ela precisa
 * resolver — conta arquivada, permissão retirada, dado inválido.
 *
 * `VERSION_CONFLICT` fica de fora da lista permanente de propósito: o pacote
 * manda "solicitar atualização e reaplicar intenção", não descartar.
 * `DUPLICATE_IDEMPOTENCY_KEY` também não entra: a mesma chave chegando duas
 * vezes significa que o PRIMEIRO envio funcionou, então o item se resolve
 * sozinho na próxima passada.
 */

import type { DomainErrorCode } from '@ff/domain';

const PERMANENTES: ReadonlySet<string> = new Set<DomainErrorCode>([
  'VALIDATION_ERROR',
  'INSUFFICIENT_PERMISSION',
  'FORBIDDEN',
  'ACCOUNT_ARCHIVED',
  'ACCOUNT_NOT_FOUND',
  'INVALID_ACCOUNT_TYPE',
  'OFFLINE_OPERATION_REJECTED',
]);

export function isPermanentFailure(code: string | null | undefined): boolean {
  return code !== null && code !== undefined && PERMANENTES.has(code);
}
