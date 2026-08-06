/**
 * Contratos de autenticação (docs/10 §2 e docs/01 §Backend).
 *
 * Decisões refletidas aqui:
 * - Proteção contra enumeração de contas: `POST /auth/register` e
 *   `POST /auth/magic-link` respondem SEMPRE o mesmo corpo neutro, independente
 *   de o e-mail existir. Quem entra é o login.
 * - Sessão = par access/refresh. O refresh é rotacionado a cada uso e vinculado
 *   a um registro em `devices`, o que torna a sessão revogável.
 */

import { z } from 'zod';
import { emailSchema, passwordSchema, shortTextSchema, uuidSchema } from '@ff/validation';

export const devicePlatformSchema = z.enum(['ios', 'android', 'web']);
export type DevicePlatform = z.infer<typeof devicePlatformSchema>;

/** Identificação do aparelho, usada para listar e revogar sessões. */
export const deviceInfoSchema = z.object({
  /** Identificador estável gerado pelo app e guardado no keychain. */
  installationId: z.string().min(8).max(128),
  platform: devicePlatformSchema,
  /** Nome apresentável na lista de sessões: "iPhone de Ana". */
  name: shortTextSchema.max(80),
  appVersion: z.string().max(32),
  osVersion: z.string().max(32).optional(),
});
export type DeviceInfo = z.infer<typeof deviceInfoSchema>;

export const profileSchema = z.object({
  id: uuidSchema,
  email: z.email(),
  displayName: z.string(),
  avatarUrl: z.url().nullable(),
  emailVerified: z.boolean(),
  createdAt: z.string(),
});
export type Profile = z.infer<typeof profileSchema>;

export const sessionSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  /** Segundos até o access token expirar. */
  expiresIn: z.int().positive(),
  tokenType: z.literal('Bearer'),
  profile: profileSchema,
});
export type Session = z.infer<typeof sessionSchema>;

// --------------------------------------------------------------- registro
export const registerRequestSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  displayName: shortTextSchema.max(80),
});
export type RegisterRequest = z.infer<typeof registerRequestSchema>;

/** Resposta neutra: idêntica para e-mail novo e e-mail já cadastrado. */
export const neutralAcceptedSchema = z.object({
  status: z.literal('ACCEPTED'),
  message: z.string(),
});
export type NeutralAccepted = z.infer<typeof neutralAcceptedSchema>;

export const NEUTRAL_REGISTER_MESSAGE =
  'Se este e-mail estiver disponível, enviamos as instruções de confirmação.';
export const NEUTRAL_MAGIC_LINK_MESSAGE =
  'Se este e-mail estiver cadastrado, enviamos um link de acesso.';

// ------------------------------------------------------ confirmação de e-mail
export const verifyEmailRequestSchema = z.object({
  token: z.string().min(20).max(256),
  device: deviceInfoSchema,
});
export type VerifyEmailRequest = z.infer<typeof verifyEmailRequestSchema>;

// ------------------------------------------------------------------- login
export const loginRequestSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(200),
  device: deviceInfoSchema,
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

// -------------------------------------------------------------- magic link
export const magicLinkRequestSchema = z.object({ email: emailSchema });
export type MagicLinkRequest = z.infer<typeof magicLinkRequestSchema>;

export const magicLinkConsumeSchema = z.object({
  token: z.string().min(20).max(256),
  device: deviceInfoSchema,
});
export type MagicLinkConsume = z.infer<typeof magicLinkConsumeSchema>;

// ----------------------------------------------------------------- refresh
export const refreshRequestSchema = z.object({
  refreshToken: z.string().min(20).max(512),
});
export type RefreshRequest = z.infer<typeof refreshRequestSchema>;

export const logoutRequestSchema = z.object({
  refreshToken: z.string().min(20).max(512),
});
export type LogoutRequest = z.infer<typeof logoutRequestSchema>;

export const logoutResponseSchema = z.object({ revoked: z.boolean() });
export type LogoutResponse = z.infer<typeof logoutResponseSchema>;

// ------------------------------------------------------------ sessões ativas
export const sessionListItemSchema = z.object({
  id: uuidSchema,
  platform: devicePlatformSchema,
  name: z.string(),
  appVersion: z.string(),
  lastSeenAt: z.string(),
  createdAt: z.string(),
  current: z.boolean(),
});
export type SessionListItem = z.infer<typeof sessionListItemSchema>;

export const sessionListSchema = z.object({ items: z.array(sessionListItemSchema) });

/** Claims do access token. `household_id` NUNCA vem do cliente (docs/10 §1). */
export const accessTokenClaimsSchema = z.object({
  sub: uuidSchema,
  sid: uuidSchema,
  iss: z.string(),
  iat: z.int(),
  exp: z.int(),
});
export type AccessTokenClaims = z.infer<typeof accessTokenClaimsSchema>;
