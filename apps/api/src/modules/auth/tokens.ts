/**
 * Tokens de sessão (docs/10 §2).
 *
 * Access token: JWT HS256 curto, com `sub` (usuário) e `sid` (sessão/device).
 * Nunca carrega household nem role — isso é resolvido no servidor a cada
 * request, para que uma troca de permissão valha imediatamente.
 *
 * Refresh token: valor aleatório opaco no formato `<deviceId>.<segredo>`.
 * O banco guarda apenas SHA-256 do valor inteiro. Incluir o deviceId permite
 * detectar REUSO de um refresh antigo (indício de roubo) e revogar a sessão.
 */

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { jwtVerify, SignJWT } from 'jose';
import { DomainError } from '@ff/domain';
import type { AccessTokenClaims } from '@ff/api-contracts';
import type { AppConfig } from '../../config/env.js';

export type TokenService = ReturnType<typeof createTokenService>;

export function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

/** Comparação em tempo constante de dois hashes hexadecimais. */
export function hashesMatch(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function createOpaqueSecret(): string {
  return randomBytes(32).toString('base64url');
}

/** Token de uso único para confirmação de e-mail e magic link. */
export function createSingleUseToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, tokenHash: sha256(token) };
}

export function createTokenService(config: AppConfig) {
  const accessKey = new TextEncoder().encode(config.auth.accessSecret);

  return {
    accessTtlSeconds: config.auth.accessTtlSeconds,
    refreshTtlSeconds: config.auth.refreshTtlSeconds,

    async signAccessToken(userId: string, sessionId: string): Promise<string> {
      return (
        new SignJWT({})
          .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
          .setSubject(userId)
          .setJti(sessionId)
          .setIssuer(config.auth.issuer)
          .setAudience('ff-app')
          .setIssuedAt()
          .setExpirationTime(`${config.auth.accessTtlSeconds}s`)
          // `sid` identifica a sessão: revogar o device invalida o access token
          // na primeira revalidação.
          .sign(accessKey)
          .then((token) => token)
      );
    },

    async verifyAccessToken(token: string): Promise<AccessTokenClaims> {
      try {
        const { payload } = await jwtVerify(token, accessKey, {
          issuer: config.auth.issuer,
          audience: 'ff-app',
        });
        if (
          typeof payload.sub !== 'string' ||
          typeof payload.jti !== 'string' ||
          typeof payload.iat !== 'number' ||
          typeof payload.exp !== 'number'
        ) {
          throw new DomainError('TOKEN_INVALID');
        }
        return {
          sub: payload.sub,
          sid: payload.jti,
          iss: config.auth.issuer,
          iat: payload.iat,
          exp: payload.exp,
        };
      } catch (error) {
        if (error instanceof DomainError) throw error;
        const code = (error as { code?: string }).code;
        throw new DomainError(code === 'ERR_JWT_EXPIRED' ? 'TOKEN_EXPIRED' : 'TOKEN_INVALID');
      }
    },

    /** Gera um refresh token novo para uma sessão. */
    createRefreshToken(deviceId: string): { token: string; tokenHash: string; expiresAt: Date } {
      const token = `${deviceId}.${createOpaqueSecret()}`;
      return {
        token,
        tokenHash: sha256(token),
        expiresAt: new Date(Date.now() + config.auth.refreshTtlSeconds * 1000),
      };
    },

    /** Extrai o deviceId de um refresh token, sem confiar no restante. */
    parseRefreshToken(token: string): { deviceId: string; tokenHash: string } {
      const separator = token.indexOf('.');
      if (separator <= 0) throw new DomainError('TOKEN_INVALID');
      const deviceId = token.slice(0, separator);
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(deviceId)) {
        throw new DomainError('TOKEN_INVALID');
      }
      return { deviceId, tokenHash: sha256(token) };
    },
  };
}
