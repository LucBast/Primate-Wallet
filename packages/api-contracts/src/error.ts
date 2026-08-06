/**
 * Envelope de erro da API (docs/09 §2). Formato fixo:
 *
 * { "code": "...", "message": "...", "details": { ... }, "requestId": "uuid" }
 *
 * O app trata SEMPRE por `code`; `message` é texto pt-BR apresentável.
 */

import { z } from 'zod';
import { DOMAIN_ERROR_CODES, type DomainErrorCode } from '@ff/domain';

export const errorCodeSchema = z.enum(DOMAIN_ERROR_CODES);

export const apiErrorSchema = z.object({
  code: errorCodeSchema,
  message: z.string(),
  details: z.record(z.string(), z.unknown()).optional(),
  requestId: z.string(),
});

export type ApiError = z.infer<typeof apiErrorSchema>;

export function isApiError(value: unknown): value is ApiError {
  return apiErrorSchema.safeParse(value).success;
}

export function apiErrorHasCode(value: unknown, code: DomainErrorCode): boolean {
  return isApiError(value) && value.code === code;
}
