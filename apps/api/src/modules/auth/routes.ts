/**
 * Rotas de autenticação. A validação de entrada usa os schemas de
 * @ff/api-contracts — os mesmos que o app usa — então não existe contrato
 * paralelo entre cliente e servidor.
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import {
  loginRequestSchema,
  logoutRequestSchema,
  magicLinkConsumeSchema,
  magicLinkRequestSchema,
  passwordResetConsumeSchema,
  passwordResetRequestSchema,
  refreshRequestSchema,
  registerRequestSchema,
  verifyEmailRequestSchema,
} from '@ff/api-contracts';
import { uuidSchema } from '@ff/validation';
import { createAuthenticate, requireUser } from '../../http/authenticate.js';
import type { AuthService, RequestContext } from './service.js';
import type { TokenService } from './tokens.js';

function contextOf(request: FastifyRequest): RequestContext {
  return { requestId: request.id, ip: request.ip ?? null };
}

export type AuthRoutesDeps = {
  readonly auth: AuthService;
  readonly tokens: TokenService;
};

export async function registerAuthRoutes(
  app: FastifyInstance,
  deps: AuthRoutesDeps,
): Promise<void> {
  const authenticate = createAuthenticate(deps.tokens, deps.auth);

  // Limite estrito nos endpoints que aceitam credenciais ou disparam e-mail.
  const strictRateLimit = {
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
  };

  app.post('/auth/register', strictRateLimit, async (request, reply) => {
    const input = registerRequestSchema.parse(request.body);
    const result = await deps.auth.register(input, contextOf(request));
    return reply.status(202).send(result);
  });

  app.post('/auth/verify-email', strictRateLimit, async (request, reply) => {
    const input = verifyEmailRequestSchema.parse(request.body);
    const session = await deps.auth.verifyEmail(input.token, input.device, contextOf(request));
    return reply.status(200).send(session);
  });

  app.post('/auth/login', strictRateLimit, async (request, reply) => {
    const input = loginRequestSchema.parse(request.body);
    const session = await deps.auth.login(input, contextOf(request));
    return reply.status(200).send(session);
  });

  app.post('/auth/magic-link', strictRateLimit, async (request, reply) => {
    const input = magicLinkRequestSchema.parse(request.body);
    const result = await deps.auth.requestMagicLink(input.email, contextOf(request));
    return reply.status(202).send(result);
  });

  app.post('/auth/magic-link/consume', strictRateLimit, async (request, reply) => {
    const input = magicLinkConsumeSchema.parse(request.body);
    const session = await deps.auth.consumeMagicLink(input.token, input.device, contextOf(request));
    return reply.status(200).send(session);
  });

  app.post('/auth/password-reset', strictRateLimit, async (request, reply) => {
    const { email } = passwordResetRequestSchema.parse(request.body);
    return reply.status(202).send(await deps.auth.requestPasswordReset(email, contextOf(request)));
  });

  app.post('/auth/password-reset/consume', strictRateLimit, async (request, reply) => {
    const input = passwordResetConsumeSchema.parse(request.body);
    return reply.send(
      await deps.auth.consumePasswordReset(
        input.token,
        input.password,
        input.device,
        contextOf(request),
      ),
    );
  });

  app.post('/auth/refresh', async (request, reply) => {
    const input = refreshRequestSchema.parse(request.body);
    const session = await deps.auth.refresh(input.refreshToken, contextOf(request));
    return reply.status(200).send(session);
  });

  app.post('/auth/logout', async (request, reply) => {
    const input = logoutRequestSchema.parse(request.body);
    const result = await deps.auth.logout(input.refreshToken, contextOf(request));
    return reply.status(200).send(result);
  });

  app.get('/auth/me', { preHandler: authenticate }, async (request, reply) => {
    const user = requireUser(request);
    return reply.status(200).send(await deps.auth.me(user.id));
  });

  app.get('/auth/sessions', { preHandler: authenticate }, async (request, reply) => {
    const user = requireUser(request);
    const items = await deps.auth.listSessions(user.id, user.sessionId);
    return reply.status(200).send({ items });
  });

  app.delete('/auth/sessions/:id', { preHandler: authenticate }, async (request, reply) => {
    const user = requireUser(request);
    const sessionId = uuidSchema.parse((request.params as { id: string }).id);
    const result = await deps.auth.revokeSession(user.id, sessionId, contextOf(request));
    return reply.status(result.revoked ? 200 : 404).send(result);
  });
}
