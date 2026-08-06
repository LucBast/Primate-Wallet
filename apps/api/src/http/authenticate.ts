/**
 * Autenticação de request.
 *
 * O access token é validado criptograficamente E a sessão é revalidada no
 * banco, para que revogar um aparelho tenha efeito imediato — sem esperar o
 * token expirar (docs/10 §2, "sessões revogáveis").
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import { DomainError } from '@ff/domain';
import type { AuthService } from '../modules/auth/service.js';
import type { TokenService } from '../modules/auth/tokens.js';

export type AuthenticatedUser = {
  readonly id: string;
  readonly sessionId: string;
};

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthenticatedUser;
  }
}

function extractBearer(header: string | undefined): string {
  if (!header) throw new DomainError('AUTH_REQUIRED');
  const [scheme, value] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !value) throw new DomainError('AUTH_REQUIRED');
  return value;
}

export function createAuthenticate(tokens: TokenService, auth: AuthService) {
  return async function authenticate(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
    const token = extractBearer(request.headers.authorization);
    const claims = await tokens.verifyAccessToken(token);
    await auth.assertSessionActive(claims.sid);
    request.user = { id: claims.sub, sessionId: claims.sid };
  };
}

/** Usuário autenticado do request, ou erro — evita `!` espalhado nas rotas. */
export function requireUser(request: FastifyRequest): AuthenticatedUser {
  const user = request.user;
  if (!user) throw new DomainError('AUTH_REQUIRED');
  return user;
}
