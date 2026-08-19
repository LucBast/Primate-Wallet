/**
 * Handler único de erros: toda resposta de erro sai no envelope do pacote
 * (docs/09 §2) — `{ code, message, details, requestId }` — e nunca vaza stack
 * trace, SQL ou mensagem de driver para o cliente.
 */

import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import * as Sentry from '@sentry/node';
import { ZodError } from 'zod';
import { DomainError, isDomainError, DOMAIN_ERROR_MESSAGES } from '@ff/domain';
import type { ApiError } from '@ff/api-contracts';

function zodIssueDetails(error: ZodError): Record<string, unknown> {
  return {
    issues: error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    })),
  };
}

export function toApiError(error: unknown, requestId: string): ApiError {
  if (isDomainError(error)) {
    return {
      code: error.code,
      message: error.message,
      ...(error.details ? { details: error.details as Record<string, unknown> } : {}),
      requestId,
    };
  }

  if (error instanceof ZodError) {
    return {
      code: 'VALIDATION_ERROR',
      message: DOMAIN_ERROR_MESSAGES.VALIDATION_ERROR,
      details: zodIssueDetails(error),
      requestId,
    };
  }

  const fastifyError = error as Partial<FastifyError>;
  if (fastifyError?.statusCode === 429) {
    return {
      code: 'RATE_LIMITED',
      message: DOMAIN_ERROR_MESSAGES.RATE_LIMITED,
      requestId,
    };
  }
  if (fastifyError?.statusCode === 404) {
    return { code: 'NOT_FOUND', message: DOMAIN_ERROR_MESSAGES.NOT_FOUND, requestId };
  }
  if (typeof fastifyError?.statusCode === 'number' && fastifyError.statusCode < 500) {
    return {
      code: 'VALIDATION_ERROR',
      message: DOMAIN_ERROR_MESSAGES.VALIDATION_ERROR,
      requestId,
    };
  }

  return { code: 'INTERNAL_ERROR', message: DOMAIN_ERROR_MESSAGES.INTERNAL_ERROR, requestId };
}

export function httpStatusFor(error: unknown): number {
  if (isDomainError(error)) return error.httpStatus;
  if (error instanceof ZodError) return 400;
  const statusCode = (error as Partial<FastifyError>)?.statusCode;
  return typeof statusCode === 'number' ? statusCode : 500;
}

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error: unknown, request: FastifyRequest, reply: FastifyReply) => {
    const status = httpStatusFor(error);
    const body = toApiError(error, request.id);

    // 5xx é falha nossa: log completo. 4xx é fluxo esperado: log enxuto.
    if (status >= 500) {
      request.log.error({ err: error, code: body.code }, 'Erro não tratado');
      // Este handler responde ao cliente e ENCERRA o erro aqui: nada sobe para
      // o processo. Sem a captura explícita, o Sentry só veria a queda do
      // container, nunca um 500 de rota. Sem DSN configurado (desenvolvimento
      // e testes) `captureException` é no-op, então não há caminho especial.
      // Só o padrão da rota vai como tag, nunca `request.url`: a URL concreta
      // carrega identificadores de família e de lançamento.
      Sentry.captureException(error, {
        tags: { code: body.code, method: request.method, route: request.routeOptions.url },
        extra: { requestId: request.id, statusCode: status },
      });
    } else {
      request.log.info({ code: body.code, status }, 'Requisição recusada');
    }

    void reply.status(status).send(body);
  });

  app.setNotFoundHandler((request: FastifyRequest, reply: FastifyReply) => {
    void reply.status(404).send(toApiError(new DomainError('NOT_FOUND'), request.id));
  });
}
