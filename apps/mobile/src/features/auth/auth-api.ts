/**
 * Chamadas de autenticação. Cada resposta é validada com o schema do contrato —
 * o app não confia no formato do servidor sem checar.
 */

import {
  neutralAcceptedSchema,
  profileSchema,
  sessionSchema,
  type DeviceInfo,
  type NeutralAccepted,
  type Profile,
  type Session,
} from '@ff/api-contracts';
import { request } from '../../services/api-client';

export async function login(input: {
  email: string;
  password: string;
  device: DeviceInfo;
}): Promise<Session> {
  return sessionSchema.parse(await request('/auth/login', { method: 'POST', body: input }));
}

export async function register(input: {
  email: string;
  password: string;
  displayName: string;
}): Promise<NeutralAccepted> {
  return neutralAcceptedSchema.parse(
    await request('/auth/register', { method: 'POST', body: input }),
  );
}

export async function requestMagicLink(email: string): Promise<NeutralAccepted> {
  return neutralAcceptedSchema.parse(
    await request('/auth/magic-link', { method: 'POST', body: { email } }),
  );
}

export async function consumeMagicLink(token: string, device: DeviceInfo): Promise<Session> {
  return sessionSchema.parse(
    await request('/auth/magic-link/consume', { method: 'POST', body: { token, device } }),
  );
}

/**
 * Recuperação de acesso (docs/07 §3). Resposta neutra: o app NÃO diz se o
 * e-mail existe, e a tela mostra a mesma mensagem nos dois casos.
 */
export async function requestPasswordReset(email: string): Promise<NeutralAccepted> {
  return neutralAcceptedSchema.parse(
    await request('/auth/password-reset', { method: 'POST', body: { email } }),
  );
}

export async function consumePasswordReset(
  token: string,
  password: string,
  device: DeviceInfo,
): Promise<Session> {
  return sessionSchema.parse(
    await request('/auth/password-reset/consume', {
      method: 'POST',
      body: { token, password, device },
    }),
  );
}

export async function verifyEmail(token: string, device: DeviceInfo): Promise<Session> {
  return sessionSchema.parse(
    await request('/auth/verify-email', { method: 'POST', body: { token, device } }),
  );
}

export async function refresh(refreshToken: string): Promise<Session> {
  return sessionSchema.parse(
    await request('/auth/refresh', { method: 'POST', body: { refreshToken } }),
  );
}

export async function logout(refreshToken: string): Promise<void> {
  await request('/auth/logout', { method: 'POST', body: { refreshToken } });
}

export async function me(accessToken: string): Promise<Profile> {
  return profileSchema.parse(await request('/auth/me', { accessToken }));
}
