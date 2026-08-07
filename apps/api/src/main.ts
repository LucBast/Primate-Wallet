/**
 * Ponto de entrada do backend.
 *
 * Ordem: carregar e VALIDAR configuração → observabilidade → banco → HTTP.
 * Configuração inválida derruba o processo antes de qualquer conexão.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadDotenv } from 'dotenv';
import * as Sentry from '@sentry/node';
import { ConfigError, loadConfig } from './config/env.js';
import { createLogger } from './observability/logger.js';
import { createDatabase } from './db/pool.js';
import { createLogMailer } from './modules/auth/mailer.js';
import { buildServer } from './http/server.js';

// O `.env` de desenvolvimento fica na raiz do monorepo, não em apps/api, e o
// processo pode ser iniciado de qualquer cwd (raiz via workspaces, ou apps/api).
// Resolver a partir do próprio módulo mantém os dois casos iguais — é o mesmo
// caminho usado por scripts/migrate.mjs e tests/setup.ts. Em produção as
// variáveis vêm do ambiente e o dotenv não sobrescreve o que já está definido.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
loadDotenv({ path: path.join(repoRoot, '.env'), quiet: true });

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger(config);

  if (config.sentry.dsn !== '') {
    Sentry.init({
      dsn: config.sentry.dsn,
      environment: config.env,
      tracesSampleRate: config.sentry.tracesSampleRate,
      // Nunca enviar corpo de request: pode conter senha ou valor financeiro.
      sendDefaultPii: false,
    });
  }

  const db = createDatabase(config);
  const { app } = await buildServer({
    config,
    db,
    logger,
    mailer: createLogMailer(logger),
  });

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'Encerrando');
    await app.close();
    await db.close();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  await app.listen({ host: config.http.host, port: config.http.port });
  logger.info({ port: config.http.port, environment: config.env }, 'API no ar');
}

main().catch((error: unknown) => {
  if (error instanceof ConfigError) {
    // Sem logger ainda: a falha é de configuração, precisa aparecer crua.
    console.error(error.message);
    process.exit(78); // EX_CONFIG
  }
  console.error(error);
  process.exit(1);
});
