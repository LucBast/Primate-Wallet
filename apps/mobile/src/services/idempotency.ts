/**
 * Chaves de idempotência (docs/04 §14).
 *
 * A chave nasce no CLIENTE, no momento em que a intenção é criada — não no
 * momento do envio. Assim, reenviar a mesma intenção (toque duplo, retentativa
 * de rede, item do outbox offline) chega ao servidor com a mesma chave, e o
 * servidor recusa o segundo efeito financeiro.
 */

/** `crypto.randomUUID` existe no Hermes moderno, mas não em toda versão. */
type MaybeCrypto = { randomUUID?: () => string } | undefined;

function randomPart(): string {
  const webCrypto = (globalThis as { crypto?: MaybeCrypto }).crypto;
  if (typeof webCrypto?.randomUUID === 'function') return webCrypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}-${Math.random()
    .toString(36)
    .slice(2, 14)}`;
}

/** Formato aceito pelo contrato: 16–128 caracteres em [A-Za-z0-9._:-]. */
export function newIdempotencyKey(prefix = 'ff'): string {
  return `${prefix}-${randomPart()}`;
}
