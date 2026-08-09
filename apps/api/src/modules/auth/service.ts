/**
 * Serviço de autenticação (docs/10 §2).
 *
 * Princípios aplicados aqui:
 * - Nenhuma resposta revela se um e-mail está cadastrado (anti-enumeração):
 *   cadastro e magic link respondem sempre o mesmo corpo, e login sempre
 *   `INVALID_CREDENTIALS`, com tempo de resposta equalizado.
 * - Sessão é revogável: o refresh vive em `devices` e rotaciona a cada uso.
 * - Reuso de refresh token revoga a sessão inteira.
 * - Toda ação sensível gera trilha de auditoria.
 */

import { DomainError } from '@ff/domain';
import {
  NEUTRAL_MAGIC_LINK_MESSAGE,
  NEUTRAL_PASSWORD_RESET_MESSAGE,
  NEUTRAL_REGISTER_MESSAGE,
  type DeviceInfo,
  type LoginRequest,
  type NeutralAccepted,
  type Profile,
  type RegisterRequest,
  type Session,
  type SessionListItem,
} from '@ff/api-contracts';
import {
  withAuthTransaction,
  withUserTransaction,
  type Database,
  type PoolClient,
} from '../../db/pool.js';
import type { Mailer } from './mailer.js';
import { equalizeTimingForUnknownUser, hashPassword, verifyPassword } from './password.js';
import { createSingleUseToken, hashesMatch, sha256, type TokenService } from './tokens.js';
import * as repo from './repository.js';
import type { ProfileRow } from './repository.js';

/** Bloqueio por conta, complementar ao rate limit por IP. */
const MAX_FAILED_LOGINS = 8;
const ACCOUNT_LOCK_MINUTES = 15;
const EMAIL_TOKEN_TTL_MINUTES = 60;
const MAGIC_LINK_TTL_MINUTES = 15;
/**
 * Redefinição de senha vale mais que o magic link, e de propósito.
 *
 * O link de acesso é usado na hora; o de senha nova costuma ser aberto depois,
 * às vezes em outro aparelho. Quinze minutos transformariam a recuperação numa
 * corrida contra o relógio, e a pessoa pediria um link atrás do outro.
 */
const PASSWORD_RESET_TTL_MINUTES = 60;

export type RequestContext = {
  readonly requestId: string;
  readonly ip: string | null;
};

export type AuthServiceDeps = {
  readonly db: Database;
  readonly tokens: TokenService;
  readonly mailer: Mailer;
  /** Base para montar os links enviados por e-mail (deep link do app). */
  readonly appLinkBase: string;
};

export type AuthService = ReturnType<typeof createAuthService>;

function toProfile(row: ProfileRow): Profile {
  return {
    id: row.id,
    email: row.email,
    displayName: row.name,
    avatarUrl: row.avatar_url,
    emailVerified: row.email_verified_at !== null,
    createdAt: row.created_at.toISOString(),
  };
}

function minutesFromNow(minutes: number): Date {
  return new Date(Date.now() + minutes * 60_000);
}

export function createAuthService(deps: AuthServiceDeps) {
  const { db, tokens, mailer, appLinkBase } = deps;

  /** Cria (ou renova) a sessão do aparelho e devolve o par de tokens. */
  async function issueSession(
    client: PoolClient,
    profile: ProfileRow,
    device: DeviceInfo,
  ): Promise<Session> {
    // O deviceId faz parte do refresh token, e o refresh token é salvo em hash;
    // por isso o device é criado primeiro com um hash provisório e logo em
    // seguida rotacionado para o valor definitivo.
    const placeholder = await repo.upsertDevice(client, {
      userId: profile.id,
      device,
      refreshTokenHash: 'pending',
      refreshTokenExpiresAt: new Date(Date.now() + tokens.refreshTtlSeconds * 1000),
    });

    const refresh = tokens.createRefreshToken(placeholder.id);
    await repo.rotateRefreshToken(client, {
      deviceId: placeholder.id,
      tokenHash: refresh.tokenHash,
      expiresAt: refresh.expiresAt,
    });

    const accessToken = await tokens.signAccessToken(profile.id, placeholder.id);
    return {
      accessToken,
      refreshToken: refresh.token,
      expiresIn: tokens.accessTtlSeconds,
      tokenType: 'Bearer',
      profile: toProfile(profile),
    };
  }

  return {
    /**
     * Cadastro. Responde SEMPRE o mesmo corpo, exista ou não o e-mail — e o
     * hash da senha é calculado nos dois caminhos, para o tempo não denunciar.
     */
    async register(input: RegisterRequest, ctx: RequestContext): Promise<NeutralAccepted> {
      const passwordHash = await hashPassword(input.password);

      await withAuthTransaction(db, async (client) => {
        const existing = await repo.findProfileByEmail(client, input.email);

        if (existing) {
          await repo.insertAuditLog(client, {
            actorUserId: existing.id,
            entityType: 'profile',
            entityId: existing.id,
            action: 'REGISTER_ATTEMPT_ON_EXISTING_EMAIL',
            requestId: ctx.requestId,
          });
          await mailer.send({
            to: input.email,
            subject: 'Tentativa de cadastro com o seu e-mail',
            body:
              'Alguém tentou criar uma conta com este e-mail. Se foi você, entre normalmente. ' +
              'Se não foi, ignore esta mensagem.',
          });
          return;
        }

        const profile = await repo.insertProfile(client, {
          email: input.email,
          passwordHash,
          name: input.displayName,
        });

        const { token, tokenHash } = createSingleUseToken();
        await repo.insertAuthToken(client, {
          userId: profile.id,
          purpose: 'EMAIL_VERIFICATION',
          tokenHash,
          expiresAt: minutesFromNow(EMAIL_TOKEN_TTL_MINUTES),
          requestedIp: ctx.ip,
        });
        await repo.insertAuditLog(client, {
          actorUserId: profile.id,
          entityType: 'profile',
          entityId: profile.id,
          action: 'PROFILE_REGISTERED',
          requestId: ctx.requestId,
        });

        await mailer.send({
          to: profile.email,
          subject: 'Confirme seu e-mail',
          body: 'Confirme seu e-mail para começar a usar o aplicativo.',
          link: `${appLinkBase}/verificar-email?token=${token}`,
        });
      });

      return { status: 'ACCEPTED', message: NEUTRAL_REGISTER_MESSAGE };
    },

    /** Confirma o e-mail e já devolve a sessão (evita um login extra). */
    async verifyEmail(token: string, device: DeviceInfo, ctx: RequestContext): Promise<Session> {
      return withAuthTransaction(db, async (client) => {
        const consumed = await repo.consumeAuthToken(client, sha256(token), 'EMAIL_VERIFICATION');
        if (!consumed) throw new DomainError('TOKEN_INVALID');

        await repo.markEmailVerified(client, consumed.user_id);
        const profile = await repo.findProfileById(client, consumed.user_id);
        if (!profile) throw new DomainError('TOKEN_INVALID');

        await repo.insertAuditLog(client, {
          actorUserId: profile.id,
          entityType: 'profile',
          entityId: profile.id,
          action: 'EMAIL_VERIFIED',
          requestId: ctx.requestId,
        });

        return issueSession(client, { ...profile, email_verified_at: new Date() }, device);
      });
    },

    /**
     * Atenção ao escopo transacional: contagem de falhas e auditoria precisam
     * ser COMMITADAS mesmo quando o login termina em erro. Por isso cada efeito
     * colateral que precede um `throw` roda em transação própria — se ficassem
     * na mesma transação do fluxo, o rollback apagaria o bloqueio de conta.
     */
    async login(input: LoginRequest, ctx: RequestContext): Promise<Session> {
      const profile = await withAuthTransaction(db, (client) =>
        repo.findProfileByEmail(client, input.email),
      );

      if (!profile || profile.password_hash === null) {
        // Mesmo custo de CPU do caminho feliz: sem isso, a latência denuncia
        // quais e-mails existem.
        await equalizeTimingForUnknownUser();
        throw new DomainError('INVALID_CREDENTIALS');
      }

      // Conta bloqueada responde igual a senha errada — não confirmamos a
      // existência da conta nem para quem está tentando adivinhar.
      if (profile.locked_until && profile.locked_until.getTime() > Date.now()) {
        await withAuthTransaction(db, (client) =>
          repo.insertAuditLog(client, {
            actorUserId: profile.id,
            entityType: 'profile',
            entityId: profile.id,
            action: 'LOGIN_BLOCKED_ACCOUNT_LOCKED',
            requestId: ctx.requestId,
          }),
        );
        throw new DomainError('INVALID_CREDENTIALS');
      }

      const valid = await verifyPassword(input.password, profile.password_hash);
      if (!valid) {
        await withAuthTransaction(db, async (client) => {
          await repo.recordLoginFailure(
            client,
            profile.id,
            MAX_FAILED_LOGINS,
            ACCOUNT_LOCK_MINUTES,
          );
          await repo.insertAuditLog(client, {
            actorUserId: profile.id,
            entityType: 'profile',
            entityId: profile.id,
            action: 'LOGIN_FAILED',
            metadata: { ip: ctx.ip },
            requestId: ctx.requestId,
          });
        });
        throw new DomainError('INVALID_CREDENTIALS');
      }

      if (profile.email_verified_at === null) {
        throw new DomainError('EMAIL_NOT_VERIFIED');
      }

      return withAuthTransaction(db, async (client) => {
        await repo.recordLoginSuccess(client, profile.id);
        await repo.insertAuditLog(client, {
          actorUserId: profile.id,
          entityType: 'profile',
          entityId: profile.id,
          action: 'LOGIN_SUCCEEDED',
          metadata: { platform: input.device.platform },
          requestId: ctx.requestId,
        });

        return issueSession(client, profile, input.device);
      });
    },

    async requestMagicLink(email: string, ctx: RequestContext): Promise<NeutralAccepted> {
      await withAuthTransaction(db, async (client) => {
        const profile = await repo.findProfileByEmail(client, email);
        if (!profile) return;

        await repo.invalidatePendingTokens(client, profile.id, 'MAGIC_LINK');
        const { token, tokenHash } = createSingleUseToken();
        await repo.insertAuthToken(client, {
          userId: profile.id,
          purpose: 'MAGIC_LINK',
          tokenHash,
          expiresAt: minutesFromNow(MAGIC_LINK_TTL_MINUTES),
          requestedIp: ctx.ip,
        });
        await repo.insertAuditLog(client, {
          actorUserId: profile.id,
          entityType: 'profile',
          entityId: profile.id,
          action: 'MAGIC_LINK_REQUESTED',
          requestId: ctx.requestId,
        });
        await mailer.send({
          to: profile.email,
          subject: 'Seu link de acesso',
          body: `Use o link para entrar. Ele vale por ${MAGIC_LINK_TTL_MINUTES} minutos.`,
          link: `${appLinkBase}/entrar?token=${token}`,
        });
      });

      return { status: 'ACCEPTED', message: NEUTRAL_MAGIC_LINK_MESSAGE };
    },

    /**
     * Recuperação de acesso (docs/07 §3), passo 1.
     *
     * Resposta neutra: e-mail cadastrado e não cadastrado devolvem exatamente a
     * mesma coisa, senão a tela vira um verificador de quem tem conta aqui.
     */
    async requestPasswordReset(email: string, ctx: RequestContext): Promise<NeutralAccepted> {
      await withAuthTransaction(db, async (client) => {
        const profile = await repo.findProfileByEmail(client, email);
        if (!profile) return;

        // Pedir de novo invalida o anterior: um link por vez.
        await repo.invalidatePendingTokens(client, profile.id, 'PASSWORD_RESET');
        const { token, tokenHash } = createSingleUseToken();
        await repo.insertAuthToken(client, {
          userId: profile.id,
          purpose: 'PASSWORD_RESET',
          tokenHash,
          expiresAt: minutesFromNow(PASSWORD_RESET_TTL_MINUTES),
          requestedIp: ctx.ip,
        });
        await repo.insertAuditLog(client, {
          actorUserId: profile.id,
          entityType: 'profile',
          entityId: profile.id,
          action: 'PASSWORD_RESET_REQUESTED',
          metadata: { ip: ctx.ip },
          requestId: ctx.requestId,
        });
        await mailer.send({
          to: profile.email,
          subject: 'Criar uma senha nova',
          body: `Use o link para criar uma senha nova. Ele vale por ${PASSWORD_RESET_TTL_MINUTES} minutos.`,
          link: `${appLinkBase}/senha-nova?token=${token}`,
        });
      });

      return { status: 'ACCEPTED', message: NEUTRAL_PASSWORD_RESET_MESSAGE };
    },

    /**
     * Passo 2: troca a senha e DERRUBA todas as outras sessões.
     *
     * Quem redefine a senha costuma estar reagindo a um acesso indevido. Manter
     * as sessões antigas vivas deixaria o invasor dentro da conta com a senha
     * nova recém-criada. É a mesma razão de o e-mail ser marcado como
     * verificado: abrir o link do e-mail prova a posse dele.
     */
    async consumePasswordReset(
      token: string,
      password: string,
      device: DeviceInfo,
      ctx: RequestContext,
    ): Promise<Session> {
      return withAuthTransaction(db, async (client) => {
        const consumed = await repo.consumeAuthToken(client, sha256(token), 'PASSWORD_RESET');
        if (!consumed) throw new DomainError('TOKEN_INVALID');

        const profile = await repo.findProfileById(client, consumed.user_id);
        if (!profile) throw new DomainError('TOKEN_INVALID');

        await repo.updatePassword(client, profile.id, await hashPassword(password));
        await repo.markEmailVerified(client, profile.id);
        const revogadas = await repo.revokeAllDevices(client, profile.id, 'PASSWORD_RESET');

        await repo.insertAuditLog(client, {
          actorUserId: profile.id,
          entityType: 'profile',
          entityId: profile.id,
          action: 'PASSWORD_RESET_COMPLETED',
          metadata: { revokedSessions: revogadas, ip: ctx.ip },
          requestId: ctx.requestId,
        });

        await repo.recordLoginSuccess(client, profile.id);
        return issueSession(client, { ...profile, email_verified_at: new Date() }, device);
      });
    },

    async consumeMagicLink(
      token: string,
      device: DeviceInfo,
      ctx: RequestContext,
    ): Promise<Session> {
      return withAuthTransaction(db, async (client) => {
        const consumed = await repo.consumeAuthToken(client, sha256(token), 'MAGIC_LINK');
        if (!consumed) throw new DomainError('TOKEN_INVALID');

        // Entrar por magic link comprova a posse do e-mail.
        await repo.markEmailVerified(client, consumed.user_id);
        const profile = await repo.findProfileById(client, consumed.user_id);
        if (!profile) throw new DomainError('TOKEN_INVALID');

        await repo.recordLoginSuccess(client, profile.id);
        await repo.insertAuditLog(client, {
          actorUserId: profile.id,
          entityType: 'profile',
          entityId: profile.id,
          action: 'LOGIN_SUCCEEDED_MAGIC_LINK',
          requestId: ctx.requestId,
        });

        return issueSession(client, { ...profile, email_verified_at: new Date() }, device);
      });
    },

    /**
     * Rotaciona o refresh. Se chegar um refresh antigo (já rotacionado), é
     * indício de roubo: a sessão inteira é revogada.
     */
    async refresh(refreshToken: string, ctx: RequestContext): Promise<Session> {
      const { deviceId, tokenHash } = tokens.parseRefreshToken(refreshToken);

      const device = await withAuthTransaction(db, (client) =>
        repo.findDeviceById(client, deviceId),
      );
      if (!device || device.revoked_at !== null) {
        throw new DomainError('SESSION_REVOKED');
      }

      /** Revoga a sessão e propaga o erro — em transação própria, para comitar. */
      const revokeForReuse = async (): Promise<never> => {
        await withAuthTransaction(db, async (client) => {
          await repo.revokeDevice(client, device.id, 'REFRESH_TOKEN_REUSE');
          await repo.insertAuditLog(client, {
            actorUserId: device.user_id,
            entityType: 'device',
            entityId: device.id,
            action: 'SESSION_REVOKED_TOKEN_REUSE',
            metadata: { ip: ctx.ip },
            requestId: ctx.requestId,
          });
        });
        throw new DomainError('SESSION_REVOKED');
      };

      if (
        device.refresh_token_hash === null ||
        !hashesMatch(device.refresh_token_hash, tokenHash)
      ) {
        return revokeForReuse();
      }

      if (
        device.refresh_token_expires_at === null ||
        device.refresh_token_expires_at.getTime() <= Date.now()
      ) {
        throw new DomainError('TOKEN_EXPIRED');
      }

      const rotated = await withAuthTransaction(db, async (client) => {
        const profile = await repo.findProfileById(client, device.user_id);
        if (!profile) return null;

        const next = tokens.createRefreshToken(device.id);
        // Condicionado ao hash atual: se outro pedido rotacionou primeiro, esta
        // atualização não afeta linha alguma e o token em mãos vira "antigo".
        const applied = await repo.rotateRefreshToken(client, {
          deviceId: device.id,
          tokenHash: next.tokenHash,
          expiresAt: next.expiresAt,
          expectedHash: tokenHash,
        });
        return applied ? { profile, next } : null;
      });

      if (!rotated) return revokeForReuse();

      const accessToken = await tokens.signAccessToken(rotated.profile.id, device.id);
      return {
        accessToken,
        refreshToken: rotated.next.token,
        expiresIn: tokens.accessTtlSeconds,
        tokenType: 'Bearer',
        profile: toProfile(rotated.profile),
      };
    },

    async logout(refreshToken: string, ctx: RequestContext): Promise<{ revoked: boolean }> {
      const { deviceId, tokenHash } = tokens.parseRefreshToken(refreshToken);

      return withAuthTransaction(db, async (client) => {
        const device = await repo.findDeviceById(client, deviceId);
        if (!device || device.revoked_at !== null || device.refresh_token_hash === null) {
          return { revoked: false };
        }
        if (!hashesMatch(device.refresh_token_hash, tokenHash)) {
          return { revoked: false };
        }
        const revoked = await repo.revokeDevice(client, device.id, 'USER_LOGOUT');
        await repo.insertAuditLog(client, {
          actorUserId: device.user_id,
          entityType: 'device',
          entityId: device.id,
          action: 'SESSION_REVOKED_LOGOUT',
          requestId: ctx.requestId,
        });
        return { revoked };
      });
    },

    /** Perfil do usuário autenticado — já pela conexão sujeita a RLS. */
    async me(userId: string): Promise<Profile> {
      return withUserTransaction(
        db,
        userId,
        async (client) => {
          const result = await client.query<{
            id: string;
            email: string;
            name: string;
            avatar_url: string | null;
            email_verified_at: Date | null;
            created_at: Date;
          }>(
            `SELECT id, email, name, avatar_url, email_verified_at, created_at
             FROM profiles WHERE id = $1`,
            [userId],
          );
          const row = result.rows[0];
          if (!row) throw new DomainError('NOT_FOUND');
          return {
            id: row.id,
            email: row.email,
            displayName: row.name,
            avatarUrl: row.avatar_url,
            emailVerified: row.email_verified_at !== null,
            createdAt: row.created_at.toISOString(),
          };
        },
        { readOnly: true },
      );
    },

    async listSessions(userId: string, currentSessionId: string): Promise<SessionListItem[]> {
      return withUserTransaction(
        db,
        userId,
        async (client) => {
          const rows = await repo.listActiveDevices(client, userId);
          return rows.map((row) => ({
            id: row.id,
            platform: row.platform,
            name: row.name,
            appVersion: row.app_version,
            lastSeenAt: row.last_seen_at.toISOString(),
            createdAt: row.created_at.toISOString(),
            current: row.id === currentSessionId,
          }));
        },
        { readOnly: true },
      );
    },

    /** Revoga outra sessão do próprio usuário. A RLS garante a propriedade. */
    async revokeSession(
      userId: string,
      sessionId: string,
      ctx: RequestContext,
    ): Promise<{ revoked: boolean }> {
      return withUserTransaction(db, userId, async (client) => {
        const result = await client.query(
          `UPDATE devices
           SET revoked_at = now(), revoked_reason = 'USER_REVOKED'
           WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL`,
          [sessionId, userId],
        );
        const revoked = (result.rowCount ?? 0) > 0;
        if (revoked) {
          await repo.insertAuditLog(client, {
            actorUserId: userId,
            entityType: 'device',
            entityId: sessionId,
            action: 'SESSION_REVOKED_BY_USER',
            requestId: ctx.requestId,
          });
        }
        return { revoked };
      });
    },

    /** Valida que a sessão do access token continua ativa (revogação imediata). */
    async assertSessionActive(sessionId: string): Promise<void> {
      const result = await db.auth.query<{ revoked_at: Date | null }>(
        'SELECT revoked_at FROM devices WHERE id = $1',
        [sessionId],
      );
      const row = result.rows[0];
      if (!row || row.revoked_at !== null) {
        throw new DomainError('SESSION_REVOKED');
      }
    },
  };
}
