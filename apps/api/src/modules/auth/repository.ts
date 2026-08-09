/**
 * Acesso a dados de autenticação. Todo SQL do módulo mora aqui — o serviço
 * fica com as regras, e nenhuma query solta se espalha pelas rotas.
 *
 * Estas funções recebem um `PoolClient` já dentro de transação; quem chama
 * decide o escopo transacional.
 */

import type { PoolClient } from '../../db/pool.js';
import type { DeviceInfo } from '@ff/api-contracts';

export type ProfileRow = {
  id: string;
  email: string;
  password_hash: string | null;
  name: string;
  phone: string | null;
  avatar_url: string | null;
  email_verified_at: Date | null;
  locked_until: Date | null;
  failed_login_count: number;
  last_login_at: Date | null;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
};

export type DeviceRow = {
  id: string;
  user_id: string;
  installation_id: string;
  platform: 'ios' | 'android' | 'web';
  name: string;
  app_version: string;
  os_version: string | null;
  refresh_token_hash: string | null;
  refresh_token_expires_at: Date | null;
  refresh_rotation_count: number;
  last_seen_at: Date;
  revoked_at: Date | null;
  created_at: Date;
};

export type AuthTokenPurpose = 'EMAIL_VERIFICATION' | 'MAGIC_LINK' | 'PASSWORD_RESET';

export type AuthTokenRow = {
  id: string;
  user_id: string;
  purpose: AuthTokenPurpose;
  expires_at: Date;
  consumed_at: Date | null;
};

const PROFILE_COLUMNS = `
  id, email, password_hash, name, phone, avatar_url, email_verified_at,
  locked_until, failed_login_count, last_login_at, created_at, updated_at, deleted_at
`;

export async function findProfileByEmail(
  client: PoolClient,
  email: string,
): Promise<ProfileRow | null> {
  const result = await client.query<ProfileRow>(
    `SELECT ${PROFILE_COLUMNS} FROM profiles WHERE email = $1 AND deleted_at IS NULL`,
    [email],
  );
  return result.rows[0] ?? null;
}

export async function findProfileById(client: PoolClient, id: string): Promise<ProfileRow | null> {
  const result = await client.query<ProfileRow>(
    `SELECT ${PROFILE_COLUMNS} FROM profiles WHERE id = $1 AND deleted_at IS NULL`,
    [id],
  );
  return result.rows[0] ?? null;
}

export async function insertProfile(
  client: PoolClient,
  input: { email: string; passwordHash: string | null; name: string },
): Promise<ProfileRow> {
  const result = await client.query<ProfileRow>(
    `INSERT INTO profiles (email, password_hash, name)
     VALUES ($1, $2, $3)
     RETURNING ${PROFILE_COLUMNS}`,
    [input.email, input.passwordHash, input.name],
  );
  const row = result.rows[0];
  /* c8 ignore next */
  if (!row) throw new Error('INSERT em profiles não retornou linha.');
  return row;
}

export async function markEmailVerified(client: PoolClient, userId: string): Promise<void> {
  await client.query(
    `UPDATE profiles SET email_verified_at = COALESCE(email_verified_at, now())
     WHERE id = $1`,
    [userId],
  );
}

/** Zera o contador de falhas e o bloqueio, e registra o último acesso. */
export async function recordLoginSuccess(client: PoolClient, userId: string): Promise<void> {
  await client.query(
    `UPDATE profiles
     SET failed_login_count = 0, locked_until = NULL, last_login_at = now()
     WHERE id = $1`,
    [userId],
  );
}

/**
 * Conta a falha e bloqueia temporariamente após o limite. O bloqueio é por
 * conta e cresce em degraus, complementando o rate limit por IP.
 */
export async function recordLoginFailure(
  client: PoolClient,
  userId: string,
  maxAttempts: number,
  lockMinutes: number,
): Promise<void> {
  await client.query(
    `UPDATE profiles
     SET failed_login_count = failed_login_count + 1,
         locked_until = CASE
           WHEN failed_login_count + 1 >= $2 THEN now() + make_interval(mins => $3)
           ELSE locked_until
         END
     WHERE id = $1`,
    [userId, maxAttempts, lockMinutes],
  );
}

export async function insertAuthToken(
  client: PoolClient,
  input: {
    userId: string;
    purpose: AuthTokenPurpose;
    tokenHash: string;
    expiresAt: Date;
    requestedIp: string | null;
  },
): Promise<void> {
  await client.query(
    `INSERT INTO auth_tokens (user_id, purpose, token_hash, expires_at, requested_ip)
     VALUES ($1, $2, $3, $4, $5)`,
    [input.userId, input.purpose, input.tokenHash, input.expiresAt, input.requestedIp],
  );
}

/**
 * Consome um token de uso único. O `UPDATE ... WHERE consumed_at IS NULL`
 * garante atomicidade: dois pedidos simultâneos, só um vence.
 */
export async function consumeAuthToken(
  client: PoolClient,
  tokenHash: string,
  purpose: AuthTokenPurpose,
): Promise<AuthTokenRow | null> {
  const result = await client.query<AuthTokenRow>(
    `UPDATE auth_tokens
     SET consumed_at = now()
     WHERE token_hash = $1
       AND purpose = $2
       AND consumed_at IS NULL
       AND expires_at > now()
     RETURNING id, user_id, purpose, expires_at, consumed_at`,
    [tokenHash, purpose],
  );
  return result.rows[0] ?? null;
}

/** Invalida tokens pendentes do mesmo propósito (um link por vez). */
export async function invalidatePendingTokens(
  client: PoolClient,
  userId: string,
  purpose: AuthTokenPurpose,
): Promise<void> {
  await client.query(
    `UPDATE auth_tokens SET consumed_at = now()
     WHERE user_id = $1 AND purpose = $2 AND consumed_at IS NULL`,
    [userId, purpose],
  );
}

export async function upsertDevice(
  client: PoolClient,
  input: {
    userId: string;
    device: DeviceInfo;
    refreshTokenHash: string;
    refreshTokenExpiresAt: Date;
  },
): Promise<DeviceRow> {
  const result = await client.query<DeviceRow>(
    `INSERT INTO devices (
       user_id, installation_id, platform, name, app_version, os_version,
       refresh_token_hash, refresh_token_expires_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (user_id, installation_id) WHERE revoked_at IS NULL
     DO UPDATE SET
       platform = EXCLUDED.platform,
       name = EXCLUDED.name,
       app_version = EXCLUDED.app_version,
       os_version = EXCLUDED.os_version,
       refresh_token_hash = EXCLUDED.refresh_token_hash,
       refresh_token_expires_at = EXCLUDED.refresh_token_expires_at,
       refresh_rotation_count = 0,
       last_seen_at = now()
     RETURNING id, user_id, installation_id, platform, name, app_version, os_version,
               refresh_token_hash, refresh_token_expires_at, refresh_rotation_count,
               last_seen_at, revoked_at, created_at`,
    [
      input.userId,
      input.device.installationId,
      input.device.platform,
      input.device.name,
      input.device.appVersion,
      input.device.osVersion ?? null,
      input.refreshTokenHash,
      input.refreshTokenExpiresAt,
    ],
  );
  const row = result.rows[0];
  /* c8 ignore next */
  if (!row) throw new Error('UPSERT em devices não retornou linha.');
  return row;
}

export async function findDeviceById(
  client: PoolClient,
  deviceId: string,
): Promise<DeviceRow | null> {
  const result = await client.query<DeviceRow>(
    `SELECT id, user_id, installation_id, platform, name, app_version, os_version,
            refresh_token_hash, refresh_token_expires_at, refresh_rotation_count,
            last_seen_at, revoked_at, created_at
     FROM devices WHERE id = $1`,
    [deviceId],
  );
  return result.rows[0] ?? null;
}

/**
 * Rotaciona o refresh token. Com `expectedHash`, a troca só acontece se o hash
 * atual for exatamente o esperado — o que torna a rotação atômica: dois pedidos
 * simultâneos com o mesmo token, só um vence, e o perdedor é tratado como reuso.
 *
 * Devolve `false` quando nada foi atualizado.
 */
export async function rotateRefreshToken(
  client: PoolClient,
  input: { deviceId: string; tokenHash: string; expiresAt: Date; expectedHash?: string },
): Promise<boolean> {
  const result = await client.query(
    `UPDATE devices
     SET refresh_token_hash = $2,
         refresh_token_expires_at = $3,
         refresh_rotation_count = refresh_rotation_count + 1,
         last_seen_at = now()
     WHERE id = $1
       AND revoked_at IS NULL
       AND ($4::text IS NULL OR refresh_token_hash = $4)`,
    [input.deviceId, input.tokenHash, input.expiresAt, input.expectedHash ?? null],
  );
  return (result.rowCount ?? 0) > 0;
}

export async function revokeDevice(
  client: PoolClient,
  deviceId: string,
  reason: string,
): Promise<boolean> {
  const result = await client.query(
    `UPDATE devices
     SET revoked_at = now(), revoked_reason = $2, refresh_token_hash = NULL
     WHERE id = $1 AND revoked_at IS NULL`,
    [deviceId, reason],
  );
  return (result.rowCount ?? 0) > 0;
}

/**
 * Derruba TODAS as sessões da pessoa e devolve quantas caíram.
 *
 * Usado na redefinição de senha: quem redefine costuma estar reagindo a um
 * acesso indevido, e manter as sessões antigas vivas deixaria o invasor dentro
 * da conta com a senha nova.
 */
export async function revokeAllDevices(
  client: PoolClient,
  userId: string,
  reason: string,
): Promise<number> {
  const result = await client.query(
    `UPDATE devices
     SET revoked_at = now(), revoked_reason = $2, refresh_token_hash = NULL
     WHERE user_id = $1 AND revoked_at IS NULL`,
    [userId, reason],
  );
  return result.rowCount ?? 0;
}

/** Troca a senha; o hash já chega pronto do serviço. */
export async function updatePassword(
  client: PoolClient,
  userId: string,
  passwordHash: string,
): Promise<void> {
  await client.query('UPDATE profiles SET password_hash = $2, updated_at = now() WHERE id = $1', [
    userId,
    passwordHash,
  ]);
}

export async function listActiveDevices(
  client: PoolClient,
  userId: string,
): Promise<
  Array<{
    id: string;
    platform: 'ios' | 'android' | 'web';
    name: string;
    app_version: string;
    last_seen_at: Date;
    created_at: Date;
  }>
> {
  const result = await client.query<{
    id: string;
    platform: 'ios' | 'android' | 'web';
    name: string;
    app_version: string;
    last_seen_at: Date;
    created_at: Date;
  }>(
    `SELECT id, platform, name, app_version, last_seen_at, created_at
     FROM devices
     WHERE user_id = $1 AND revoked_at IS NULL
     ORDER BY last_seen_at DESC`,
    [userId],
  );
  return result.rows;
}

/**
 * Entrada da trilha de auditoria (docs/14 §4). `beforeData`/`afterData`
 * alimentam a linha "antes → depois" da tela 3d.
 */
export type AuditEntry = {
  householdId?: string | null;
  actorUserId: string | null;
  entityType: string;
  entityId?: string | null;
  action: string;
  beforeData?: Record<string, unknown> | null;
  afterData?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
  requestId?: string | null;
};

const asJson = (value: Record<string, unknown> | null | undefined): string | null =>
  value ? JSON.stringify(value) : null;

export async function insertAuditLog(client: PoolClient, entry: AuditEntry): Promise<void> {
  await client.query(
    `INSERT INTO audit_logs
       (household_id, actor_user_id, entity_type, entity_id, action,
        before_data, after_data, metadata, request_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      entry.householdId ?? null,
      entry.actorUserId,
      entry.entityType,
      entry.entityId ?? null,
      entry.action,
      asJson(entry.beforeData),
      asJson(entry.afterData),
      asJson(entry.metadata),
      entry.requestId ?? null,
    ],
  );
}
