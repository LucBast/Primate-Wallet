/**
 * Montagem do servidor HTTP.
 *
 * A função devolve a instância sem escutar porta, o que permite usar
 * `app.inject()` nos testes de integração sem subir rede.
 */

import Fastify, { type FastifyBaseLogger, type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { randomUUID } from 'node:crypto';
import type { Logger } from 'pino';
import { healthResponseSchema } from '@ff/api-contracts';
import type { AppConfig } from '../config/env.js';
import { checkDatabaseHealth, type Database } from '../db/pool.js';
import { registerErrorHandler } from './error-handler.js';
import { createAuthService, type AuthService } from '../modules/auth/service.js';
import { createTokenService } from '../modules/auth/tokens.js';
import { registerAuthRoutes } from '../modules/auth/routes.js';
import type { Mailer } from '../modules/auth/mailer.js';
import { createAuthenticate } from './authenticate.js';
import { createHouseholdService, type HouseholdService } from '../modules/household/service.js';
import { registerHouseholdRoutes } from '../modules/household/routes.js';

export const APP_VERSION = '0.1.0';

/** Esquema de deep link do app (docs/12). Todo link de e-mail usa esta base. */
export const APP_LINK_BASE = 'familyfinance://';

export type ServerDeps = {
  readonly config: AppConfig;
  readonly db: Database;
  readonly logger: Logger;
  readonly mailer: Mailer;
  /**
   * Rate limit fica desligado por padrão em teste (senão qualquer suíte com
   * muitas requisições passa a medir o limitador, não a regra). O teste que
   * verifica o limitador liga explicitamente.
   */
  readonly enableRateLimit?: boolean;
};

export type BuiltServer = {
  readonly app: FastifyInstance;
  readonly auth: AuthService;
  readonly households: HouseholdService;
};

export async function buildServer(deps: ServerDeps): Promise<BuiltServer> {
  const { config, db, logger, mailer } = deps;

  const app: FastifyInstance = Fastify({
    // Pino e FastifyBaseLogger são compatíveis em uso; a diferença é só na
    // opcionalidade de `msgPrefix` sob exactOptionalPropertyTypes.
    loggerInstance: logger as unknown as FastifyBaseLogger,
    // Request ID correlaciona log, auditoria e envelope de erro (docs/14 §3).
    genReqId: (request) => {
      const header = request.headers['x-request-id'];
      return typeof header === 'string' && header.length <= 64 ? header : randomUUID();
    },
    trustProxy: true,
    bodyLimit: 1_048_576,
  });

  await app.register(helmet, { contentSecurityPolicy: false });

  await app.register(cors, {
    origin: config.http.corsOrigins.length > 0 ? [...config.http.corsOrigins] : false,
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id', 'Idempotency-Key'],
  });

  if (deps.enableRateLimit ?? !config.isTest) {
    await app.register(rateLimit, { max: 300, timeWindow: '1 minute' });
  }

  registerErrorHandler(app);

  // Cabeçalho de correlação de volta ao cliente, sempre.
  app.addHook('onSend', async (request, reply) => {
    void reply.header('x-request-id', request.id);
  });

  const tokens = createTokenService(config);
  const auth = createAuthService({ db, tokens, mailer, appLinkBase: APP_LINK_BASE });

  app.get('/health', async (_request, reply) => {
    const databaseOk = await checkDatabaseHealth(db);
    const body = healthResponseSchema.parse({
      status: databaseOk ? 'ok' : 'degraded',
      version: APP_VERSION,
      environment: config.env,
      checks: { database: databaseOk ? 'ok' : 'fail' },
    });
    return reply.status(databaseOk ? 200 : 503).send(body);
  });

  const authenticate = createAuthenticate(tokens, auth);

  await registerAuthRoutes(app, { auth, tokens });

  const households = createHouseholdService({ db, mailer, appLinkBase: APP_LINK_BASE });
  await registerHouseholdRoutes(app, { households, authenticate });

  return { app, auth, households };
}
