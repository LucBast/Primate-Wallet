/**
 * Erros tipados do domínio (docs/09 §2 e §12).
 *
 * O envelope de erro da API é montado a partir daqui — nunca a partir de strings
 * soltas — para que app e backend compartilhem exatamente os mesmos códigos.
 */

export const DOMAIN_ERROR_CODES = [
  'AUTH_REQUIRED',
  'FORBIDDEN',
  'HOUSEHOLD_NOT_FOUND',
  'ACCOUNT_NOT_FOUND',
  'ACCOUNT_ARCHIVED',
  'INVALID_ACCOUNT_TYPE',
  'OUTSTANDING_AMOUNT_EXCEEDED',
  'ALREADY_SETTLED',
  'VERSION_CONFLICT',
  'DUPLICATE_IDEMPOTENCY_KEY',
  'INVALID_ALLOCATION_TOTAL',
  'STATEMENT_ALREADY_PAID',
  'INSUFFICIENT_PERMISSION',
  'APPROVAL_REQUIRED',
  'TRANSACTION_ALREADY_REVERSED',
  'OFFLINE_OPERATION_REJECTED',
  // Códigos complementares aos mínimos do pacote (autenticação e infraestrutura).
  'INVALID_CREDENTIALS',
  'EMAIL_NOT_VERIFIED',
  'SESSION_REVOKED',
  'TOKEN_EXPIRED',
  'TOKEN_INVALID',
  'VALIDATION_ERROR',
  'NOT_FOUND',
  'RATE_LIMITED',
  'INTERNAL_ERROR',
] as const;

export type DomainErrorCode = (typeof DOMAIN_ERROR_CODES)[number];

/** Mensagens pt-BR padrão. A camada de API pode sobrescrever com mais contexto. */
export const DOMAIN_ERROR_MESSAGES: Record<DomainErrorCode, string> = {
  AUTH_REQUIRED: 'É necessário entrar na sua conta.',
  FORBIDDEN: 'Você não tem acesso a este recurso.',
  HOUSEHOLD_NOT_FOUND: 'Família não encontrada.',
  ACCOUNT_NOT_FOUND: 'Conta não encontrada.',
  ACCOUNT_ARCHIVED: 'Esta conta está arquivada e não aceita novos lançamentos.',
  INVALID_ACCOUNT_TYPE: 'Tipo de conta inválido para esta operação.',
  OUTSTANDING_AMOUNT_EXCEEDED: 'O valor informado excede o saldo em aberto.',
  ALREADY_SETTLED: 'Esta conta já está quitada.',
  VERSION_CONFLICT: 'Este registro foi alterado por outra pessoa. Recarregue e tente de novo.',
  DUPLICATE_IDEMPOTENCY_KEY: 'Esta operação já foi registrada.',
  INVALID_ALLOCATION_TOTAL: 'A soma do rateio deve ser igual ao valor total.',
  STATEMENT_ALREADY_PAID: 'Esta fatura já foi paga.',
  INSUFFICIENT_PERMISSION: 'Seu perfil não permite esta ação.',
  APPROVAL_REQUIRED: 'Esta operação precisa de aprovação.',
  TRANSACTION_ALREADY_REVERSED: 'Esta movimentação já foi estornada.',
  OFFLINE_OPERATION_REJECTED: 'Esta operação exige conexão com a internet.',
  // Mensagem propositalmente genérica: não revela se o e-mail existe (docs/10 §2).
  INVALID_CREDENTIALS: 'E-mail ou senha incorretos.',
  EMAIL_NOT_VERIFIED: 'Confirme seu e-mail para continuar.',
  SESSION_REVOKED: 'Esta sessão foi encerrada. Entre novamente.',
  TOKEN_EXPIRED: 'Sua sessão expirou. Entre novamente.',
  TOKEN_INVALID: 'Link inválido ou já utilizado.',
  VALIDATION_ERROR: 'Os dados enviados são inválidos.',
  NOT_FOUND: 'Registro não encontrado.',
  RATE_LIMITED: 'Muitas tentativas. Aguarde um instante e tente de novo.',
  INTERNAL_ERROR: 'Não foi possível concluir agora. Tente de novo.',
};

/** Status HTTP associado a cada código, usado pelo handler de erros da API. */
export const DOMAIN_ERROR_HTTP_STATUS: Record<DomainErrorCode, number> = {
  AUTH_REQUIRED: 401,
  FORBIDDEN: 403,
  HOUSEHOLD_NOT_FOUND: 404,
  ACCOUNT_NOT_FOUND: 404,
  ACCOUNT_ARCHIVED: 409,
  INVALID_ACCOUNT_TYPE: 422,
  OUTSTANDING_AMOUNT_EXCEEDED: 422,
  ALREADY_SETTLED: 409,
  VERSION_CONFLICT: 409,
  DUPLICATE_IDEMPOTENCY_KEY: 409,
  INVALID_ALLOCATION_TOTAL: 422,
  STATEMENT_ALREADY_PAID: 409,
  INSUFFICIENT_PERMISSION: 403,
  APPROVAL_REQUIRED: 409,
  TRANSACTION_ALREADY_REVERSED: 409,
  OFFLINE_OPERATION_REJECTED: 503,
  INVALID_CREDENTIALS: 401,
  EMAIL_NOT_VERIFIED: 403,
  SESSION_REVOKED: 401,
  TOKEN_EXPIRED: 401,
  TOKEN_INVALID: 400,
  VALIDATION_ERROR: 400,
  NOT_FOUND: 404,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
};

export type DomainErrorDetails = Readonly<Record<string, unknown>>;

export class DomainError extends Error {
  readonly code: DomainErrorCode;
  readonly details: DomainErrorDetails | undefined;
  readonly httpStatus: number;

  constructor(code: DomainErrorCode, details?: DomainErrorDetails, message?: string) {
    super(message ?? DOMAIN_ERROR_MESSAGES[code]);
    this.name = 'DomainError';
    this.code = code;
    this.details = details;
    this.httpStatus = DOMAIN_ERROR_HTTP_STATUS[code];
  }
}

export function isDomainError(error: unknown): error is DomainError {
  return error instanceof DomainError;
}
