/**
 * Logs estruturados (docs/14 §3): cada linha carrega request_id e, quando
 * existir, user_id, household_id e idempotency_key.
 *
 * Redação é obrigatória: senha, token e hash NUNCA aparecem em log (docs/10 §1).
 */

import { pino, type Logger, type LoggerOptions } from 'pino';
import type { AppConfig } from '../config/env.js';

/** Caminhos removidos de qualquer objeto logado. */
export const REDACTED_PATHS = [
  'password',
  '*.password',
  'req.body.password',
  'req.headers.authorization',
  'req.headers.cookie',
  'refreshToken',
  '*.refreshToken',
  'accessToken',
  '*.accessToken',
  'token',
  '*.token',
  'passwordHash',
  '*.passwordHash',
  'password_hash',
  '*.password_hash',
];

export function createLogger(config: AppConfig): Logger {
  const options: LoggerOptions = {
    level: config.logLevel,
    redact: { paths: REDACTED_PATHS, censor: '[redigido]' },
    base: { environment: config.env, service: 'ff-api' },
    formatters: {
      level: (label) => ({ level: label }),
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  };

  // Saída legível só em desenvolvimento; em staging/produção, JSON puro.
  if (config.env === 'development' && !config.isTest) {
    return pino({
      ...options,
      transport: {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'HH:MM:ss.l', ignore: 'pid,hostname' },
      },
    });
  }

  return pino(options);
}
