/**
 * Família, membros e convites (docs/05 §4.1, docs/10 §4).
 *
 * Autorização em duas camadas, como exige o CLAUDE.md: as policies de RLS
 * negam no banco, e o serviço revalida antes de agir — para devolver o erro
 * certo (`INSUFFICIENT_PERMISSION`) em vez de um resultado vazio ambíguo.
 */

import { randomUUID } from 'node:crypto';
import { DomainError } from '@ff/domain';
import type {
  AcceptInvitationRequest,
  AuditEntry,
  CreateHouseholdRequest,
  Household,
  HouseholdRole,
  Invitation,
  InvitationPreview,
  InviteMemberRequest,
  Member,
  UpdateHouseholdRequest,
  UpdateMemberRequest,
} from '@ff/api-contracts';
import {
  withAuthTransaction,
  withUserTransaction,
  type Database,
  type PoolClient,
} from '../../db/pool.js';
import type { Mailer } from '../auth/mailer.js';
import { createSingleUseToken, sha256 } from '../auth/tokens.js';
import type { RequestContext } from '../auth/service.js';
import { insertAuditLog } from '../auth/repository.js';
import { seedDefaultCategories } from '../account/service.js';

const INVITATION_TTL_DAYS = 7;

/** Papéis que podem gerenciar membros e permissões (STATES-AND-MATRICES §2). */
const ADMIN_ROLES: readonly HouseholdRole[] = ['OWNER', 'ADMIN'];

export type HouseholdServiceDeps = {
  readonly db: Database;
  readonly mailer: Mailer;
  readonly appLinkBase: string;
};

type MemberRow = {
  id: string;
  household_id: string;
  user_id: string | null;
  display_name: string;
  email: string | null;
  role: HouseholdRole;
  status: Member['status'];
  is_supervised: boolean;
  approval_mode: Member['approvalMode'];
  approval_threshold_minor: number | null;
  color: string | null;
  joined_at: Date | null;
  version: number;
};

function toMember(row: MemberRow): Member {
  return {
    id: row.id,
    householdId: row.household_id,
    userId: row.user_id,
    displayName: row.display_name,
    email: row.email,
    role: row.role,
    status: row.status,
    isSupervised: row.is_supervised,
    approvalMode: row.approval_mode,
    approvalThresholdMinor: row.approval_threshold_minor,
    color: row.color,
    joinedAt: row.joined_at?.toISOString() ?? null,
    version: row.version,
  };
}

function daysUntil(date: Date): number {
  return Math.max(0, Math.ceil((date.getTime() - Date.now()) / 86_400_000));
}

/**
 * Papel do usuário na família, ou erro. É a checagem de serviço que acompanha
 * a policy de RLS — nunca confia em papel vindo do cliente.
 */
async function requireRole(
  client: PoolClient,
  householdId: string,
  userId: string,
  allowed: readonly HouseholdRole[],
): Promise<HouseholdRole> {
  const result = await client.query<{ role: HouseholdRole }>(
    `SELECT role FROM household_members
      WHERE household_id = $1 AND user_id = $2 AND status = 'ACTIVE'`,
    [householdId, userId],
  );
  const role = result.rows[0]?.role;
  if (!role) throw new DomainError('HOUSEHOLD_NOT_FOUND');
  if (!allowed.includes(role)) throw new DomainError('INSUFFICIENT_PERMISSION');
  return role;
}

export type HouseholdService = ReturnType<typeof createHouseholdService>;

export function createHouseholdService(deps: HouseholdServiceDeps) {
  const { db, mailer, appLinkBase } = deps;

  return {
    /** Famílias das quais o usuário participa (multi-família é suportado). */
    async listMine(userId: string): Promise<Household[]> {
      return withUserTransaction(
        db,
        userId,
        async (client) => {
          const result = await client.query<{
            id: string;
            name: string;
            currency_code: string;
            timezone: string;
            created_at: Date;
            my_role: HouseholdRole;
            member_count: string | number;
          }>(
            `SELECT h.id, h.name, h.currency_code, h.timezone, h.created_at,
                    me.role AS my_role,
                    (SELECT count(*) FROM household_members c
                      WHERE c.household_id = h.id AND c.status = 'ACTIVE') AS member_count
               FROM households h
               JOIN household_members me
                 ON me.household_id = h.id AND me.user_id = $1 AND me.status = 'ACTIVE'
              WHERE h.deleted_at IS NULL
              ORDER BY h.created_at`,
            [userId],
          );
          return result.rows.map((row) => ({
            id: row.id,
            name: row.name,
            currencyCode: row.currency_code,
            timezone: row.timezone,
            createdAt: row.created_at.toISOString(),
            myRole: row.my_role,
            memberCount: Number(row.member_count),
          }));
        },
        { readOnly: true },
      );
    },

    /** Cria a família e o vínculo de proprietário na MESMA transação. */
    async create(
      userId: string,
      input: CreateHouseholdRequest,
      ctx: RequestContext,
    ): Promise<Household> {
      return withUserTransaction(db, userId, async (client) => {
        // O id é gerado aqui, e não com RETURNING, de propósito: `INSERT ...
        // RETURNING` aplica a policy de SELECT à linha nova, e nesse instante
        // ainda não existe o vínculo que tornaria a família visível. Gerar o id
        // no serviço evita afrouxar a policy só para permitir a leitura.
        const householdId = randomUUID();

        await client.query(
          `INSERT INTO households (id, name, currency_code, timezone, created_by)
           VALUES ($1, $2, upper($3), $4, $5)`,
          [householdId, input.name, input.currencyCode, input.timezone, userId],
        );

        await client.query(
          `INSERT INTO household_members
             (household_id, user_id, display_name, role, status, joined_at)
           VALUES ($1, $2, $3, 'OWNER', 'ACTIVE', now())`,
          [householdId, userId, input.ownerDisplayName],
        );

        const household = await client.query<{
          id: string;
          name: string;
          currency_code: string;
          timezone: string;
          created_at: Date;
        }>('SELECT id, name, currency_code, timezone, created_at FROM households WHERE id = $1', [
          householdId,
        ]);
        const row = household.rows[0];
        /* c8 ignore next */
        if (!row) throw new DomainError('INTERNAL_ERROR');

        // Família nova já nasce com as categorias padrão em pt-BR: sem elas,
        // o primeiro lançamento não teria onde ser classificado.
        await seedDefaultCategories(client, householdId);

        await insertAuditLog(client, {
          householdId: row.id,
          actorUserId: userId,
          entityType: 'household',
          entityId: row.id,
          action: 'HOUSEHOLD_CREATED',
          afterData: { name: row.name, currencyCode: row.currency_code },
          requestId: ctx.requestId,
        });

        return {
          id: row.id,
          name: row.name,
          currencyCode: row.currency_code,
          timezone: row.timezone,
          createdAt: row.created_at.toISOString(),
          myRole: 'OWNER',
          memberCount: 1,
        };
      });
    },

    async update(
      userId: string,
      householdId: string,
      input: UpdateHouseholdRequest,
      ctx: RequestContext,
    ): Promise<Household> {
      return withUserTransaction(db, userId, async (client) => {
        const role = await requireRole(client, householdId, userId, ADMIN_ROLES);

        const before = await client.query<{
          name: string;
          currency_code: string;
          timezone: string;
        }>('SELECT name, currency_code, timezone FROM households WHERE id = $1', [householdId]);

        const result = await client.query<{
          id: string;
          name: string;
          currency_code: string;
          timezone: string;
          created_at: Date;
        }>(
          `UPDATE households
              SET name = COALESCE($2::text, name),
                  currency_code = COALESCE(upper($3::text), currency_code),
                  timezone = COALESCE($4::text, timezone)
            WHERE id = $1 AND deleted_at IS NULL
            RETURNING id, name, currency_code, timezone, created_at`,
          [householdId, input.name ?? null, input.currencyCode ?? null, input.timezone ?? null],
        );
        const row = result.rows[0];
        if (!row) throw new DomainError('HOUSEHOLD_NOT_FOUND');

        await insertAuditLog(client, {
          householdId,
          actorUserId: userId,
          entityType: 'household',
          entityId: householdId,
          action: 'HOUSEHOLD_UPDATED',
          beforeData: before.rows[0] ?? null,
          afterData: { name: row.name, currencyCode: row.currency_code, timezone: row.timezone },
          requestId: ctx.requestId,
        });

        const count = await client.query<{ count: string }>(
          `SELECT count(*) FROM household_members WHERE household_id = $1 AND status = 'ACTIVE'`,
          [householdId],
        );

        return {
          id: row.id,
          name: row.name,
          currencyCode: row.currency_code,
          timezone: row.timezone,
          createdAt: row.created_at.toISOString(),
          myRole: role,
          memberCount: Number(count.rows[0]?.count ?? 0),
        };
      });
    },

    async listMembers(userId: string, householdId: string): Promise<Member[]> {
      return withUserTransaction(
        db,
        userId,
        async (client) => {
          await requireRole(client, householdId, userId, [
            'OWNER',
            'ADMIN',
            'ADULT',
            'MEMBER',
            'CHILD',
          ]);
          const result = await client.query<MemberRow>(
            `SELECT m.id, m.household_id, m.user_id, m.display_name, p.email, m.role, m.status,
                    m.is_supervised, m.approval_mode, m.approval_threshold_minor, m.color,
                    m.joined_at, m.version
               FROM household_members m
               LEFT JOIN profiles p ON p.id = m.user_id
              WHERE m.household_id = $1 AND m.status <> 'REMOVED'
              ORDER BY
                CASE m.role WHEN 'OWNER' THEN 0 WHEN 'ADMIN' THEN 1 WHEN 'ADULT' THEN 2
                            WHEN 'MEMBER' THEN 3 ELSE 4 END,
                m.display_name`,
            [householdId],
          );
          return result.rows.map(toMember);
        },
        { readOnly: true },
      );
    },

    async listInvitations(userId: string, householdId: string): Promise<Invitation[]> {
      return withUserTransaction(
        db,
        userId,
        async (client) => {
          await requireRole(client, householdId, userId, ADMIN_ROLES);
          const result = await client.query<{
            id: string;
            household_id: string;
            email: string;
            role: Invitation['role'];
            expires_at: Date;
            created_at: Date;
          }>(
            `SELECT id, household_id, email, role, expires_at, created_at
               FROM invitations
              WHERE household_id = $1 AND accepted_at IS NULL AND revoked_at IS NULL
                AND expires_at > now()
              ORDER BY created_at DESC`,
            [householdId],
          );
          return result.rows.map((row) => ({
            id: row.id,
            householdId: row.household_id,
            email: row.email,
            role: row.role,
            expiresAt: row.expires_at.toISOString(),
            expiresInDays: daysUntil(row.expires_at),
            createdAt: row.created_at.toISOString(),
          }));
        },
        { readOnly: true },
      );
    },

    /**
     * Convida por e-mail. Cria o membro com status INVITED — assim a família já
     * enxerga a pendência na tela 3a — e envia o token por e-mail.
     */
    async invite(
      userId: string,
      householdId: string,
      input: InviteMemberRequest,
      ctx: RequestContext,
    ): Promise<Invitation> {
      const { token, tokenHash } = createSingleUseToken();

      return withUserTransaction(db, userId, async (client) => {
        await requireRole(client, householdId, userId, ADMIN_ROLES);

        const already = await client.query(
          `SELECT 1 FROM household_members m
             JOIN profiles p ON p.id = m.user_id
            WHERE m.household_id = $1 AND p.email = $2 AND m.status = 'ACTIVE'`,
          [householdId, input.email],
        );
        if (already.rows.length > 0) {
          throw new DomainError(
            'VALIDATION_ERROR',
            { email: input.email },
            'Esta pessoa já faz parte da família.',
          );
        }

        const member = await client.query<{ id: string }>(
          `INSERT INTO household_members
             (household_id, display_name, role, status, is_supervised, approval_mode,
              approval_threshold_minor)
           VALUES ($1, $2, $3, 'INVITED', $4, $5, $6)
           RETURNING id`,
          [
            householdId,
            input.displayName,
            input.role,
            input.isSupervised,
            input.approvalMode,
            input.approvalThresholdMinor ?? null,
          ],
        );
        const memberId = member.rows[0]?.id;
        /* c8 ignore next */
        if (!memberId) throw new DomainError('INTERNAL_ERROR');

        const expiresAt = new Date(Date.now() + INVITATION_TTL_DAYS * 86_400_000);
        const invitation = await client.query<{
          id: string;
          household_id: string;
          email: string;
          role: Invitation['role'];
          expires_at: Date;
          created_at: Date;
        }>(
          `INSERT INTO invitations
             (household_id, member_id, email, token_hash, role, expires_at, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING id, household_id, email, role, expires_at, created_at`,
          [householdId, memberId, input.email, tokenHash, input.role, expiresAt, userId],
        );
        const row = invitation.rows[0];
        /* c8 ignore next */
        if (!row) throw new DomainError('INTERNAL_ERROR');

        await insertAuditLog(client, {
          householdId,
          actorUserId: userId,
          entityType: 'invitation',
          entityId: row.id,
          action: 'MEMBER_INVITED',
          afterData: { email: input.email, role: input.role },
          requestId: ctx.requestId,
        });

        const household = await client.query<{ name: string }>(
          'SELECT name FROM households WHERE id = $1',
          [householdId],
        );

        await mailer.send({
          to: input.email,
          subject: `Convite para a ${household.rows[0]?.name ?? 'família'}`,
          body: `Você foi convidado para participar da ${household.rows[0]?.name ?? 'família'}.`,
          link: `${appLinkBase}/convite?token=${token}`,
        });

        return {
          id: row.id,
          householdId: row.household_id,
          email: row.email,
          role: row.role,
          expiresAt: row.expires_at.toISOString(),
          expiresInDays: daysUntil(row.expires_at),
          createdAt: row.created_at.toISOString(),
        };
      });
    },

    async revokeInvitation(
      userId: string,
      householdId: string,
      invitationId: string,
      ctx: RequestContext,
    ): Promise<{ revoked: boolean }> {
      return withUserTransaction(db, userId, async (client) => {
        await requireRole(client, householdId, userId, ADMIN_ROLES);

        const result = await client.query<{ member_id: string | null }>(
          `UPDATE invitations SET revoked_at = now()
            WHERE id = $1 AND household_id = $2 AND accepted_at IS NULL AND revoked_at IS NULL
            RETURNING member_id`,
          [invitationId, householdId],
        );
        const row = result.rows[0];
        if (!row) return { revoked: false };

        // O membro provisório some junto: convite revogado não deixa fantasma.
        if (row.member_id) {
          await client.query(
            `UPDATE household_members SET status = 'REMOVED'
              WHERE id = $1 AND status = 'INVITED'`,
            [row.member_id],
          );
        }

        await insertAuditLog(client, {
          householdId,
          actorUserId: userId,
          entityType: 'invitation',
          entityId: invitationId,
          action: 'INVITATION_REVOKED',
          requestId: ctx.requestId,
        });

        return { revoked: true };
      });
    },

    /** Prévia do convite (tela 6b), antes de decidir aceitar. */
    async previewInvitation(token: string): Promise<InvitationPreview> {
      return withAuthTransaction(db, async (client) => {
        const result = await client.query<{
          household_id: string;
          role: InvitationPreview['role'];
          expires_at: Date;
          household_name: string;
          currency_code: string;
          invited_by_name: string | null;
        }>(
          `SELECT i.household_id, i.role, i.expires_at, h.name AS household_name,
                  h.currency_code, p.name AS invited_by_name
             FROM invitations i
             JOIN households h ON h.id = i.household_id
             LEFT JOIN profiles p ON p.id = i.created_by
            WHERE i.token_hash = $1 AND i.accepted_at IS NULL AND i.revoked_at IS NULL
              AND i.expires_at > now()`,
          [sha256(token)],
        );
        const row = result.rows[0];
        if (!row) throw new DomainError('TOKEN_INVALID');

        const members = await client.query<{ display_name: string }>(
          `SELECT display_name FROM household_members
            WHERE household_id = $1 AND status = 'ACTIVE'
            ORDER BY display_name LIMIT 8`,
          [row.household_id],
        );

        return {
          householdName: row.household_name,
          invitedByName: row.invited_by_name ?? 'Alguém',
          role: row.role,
          memberCount: members.rowCount ?? 0,
          currencyCode: row.currency_code,
          expiresInDays: daysUntil(row.expires_at),
          memberNames: members.rows.map((member) => member.display_name),
        };
      });
    },

    /**
     * Aceita o convite. Roda pela conexão de autenticação porque quem aceita
     * ainda não é membro — nenhuma policy baseada em vínculo o autorizaria.
     * O e-mail do convite precisa bater com o e-mail da conta.
     */
    async acceptInvitation(
      userId: string,
      input: AcceptInvitationRequest,
      ctx: RequestContext,
    ): Promise<{ householdId: string; role: HouseholdRole }> {
      return withAuthTransaction(db, async (client) => {
        const profile = await client.query<{ email: string; name: string }>(
          'SELECT email, name FROM profiles WHERE id = $1 AND deleted_at IS NULL',
          [userId],
        );
        const email = profile.rows[0]?.email;
        if (!email) throw new DomainError('AUTH_REQUIRED');

        const invitation = await client.query<{
          id: string;
          household_id: string;
          member_id: string | null;
          role: HouseholdRole;
          email: string;
        }>(
          `UPDATE invitations SET accepted_at = now()
            WHERE token_hash = $1 AND accepted_at IS NULL AND revoked_at IS NULL
              AND expires_at > now()
            RETURNING id, household_id, member_id, role, email`,
          [sha256(input.token)],
        );
        const row = invitation.rows[0];
        if (!row) throw new DomainError('TOKEN_INVALID');

        // Convite é nominal: não vale para outra conta que consiga o link.
        if (row.email.toLowerCase() !== email.toLowerCase()) {
          throw new DomainError(
            'FORBIDDEN',
            undefined,
            'Este convite foi enviado para outro e-mail.',
          );
        }

        if (row.member_id) {
          await client.query(
            `UPDATE household_members
                SET user_id = $2, status = 'ACTIVE', joined_at = now(), version = version + 1
              WHERE id = $1`,
            [row.member_id, userId],
          );
        } else {
          await client.query(
            `INSERT INTO household_members
               (household_id, user_id, display_name, role, status, joined_at)
             VALUES ($1, $2, $3, $4, 'ACTIVE', now())`,
            [row.household_id, userId, profile.rows[0]?.name ?? 'Membro', row.role],
          );
        }

        await insertAuditLog(client, {
          householdId: row.household_id,
          actorUserId: userId,
          entityType: 'invitation',
          entityId: row.id,
          action: 'INVITATION_ACCEPTED',
          requestId: ctx.requestId,
        });

        return { householdId: row.household_id, role: row.role };
      });
    },

    /** Altera papel, supervisão, regra de aprovação ou status de um membro. */
    async updateMember(
      userId: string,
      householdId: string,
      memberId: string,
      input: UpdateMemberRequest,
      ctx: RequestContext,
    ): Promise<Member> {
      return withUserTransaction(db, userId, async (client) => {
        const actorRole = await requireRole(client, householdId, userId, ADMIN_ROLES);

        const current = await client.query<MemberRow>(
          `SELECT m.id, m.household_id, m.user_id, m.display_name, NULL::text AS email, m.role,
                  m.status, m.is_supervised, m.approval_mode, m.approval_threshold_minor,
                  m.color, m.joined_at, m.version
             FROM household_members m
            WHERE m.id = $1 AND m.household_id = $2 FOR UPDATE`,
          [memberId, householdId],
        );
        const target = current.rows[0];
        if (!target) throw new DomainError('NOT_FOUND');

        if (target.version !== input.expectedVersion) {
          throw new DomainError('VERSION_CONFLICT', { currentVersion: target.version });
        }

        // Administrador não mexe no Proprietário (STATES-AND-MATRICES §2, nota 1).
        if (target.role === 'OWNER' && actorRole !== 'OWNER') {
          throw new DomainError('INSUFFICIENT_PERMISSION');
        }
        if (target.role === 'OWNER' && input.role !== undefined) {
          throw new DomainError(
            'INSUFFICIENT_PERMISSION',
            undefined,
            'Para trocar o proprietário, use a transferência de propriedade.',
          );
        }

        const approvalMode = input.approvalMode ?? target.approval_mode;
        const threshold =
          input.approvalThresholdMinor === undefined
            ? target.approval_threshold_minor
            : input.approvalThresholdMinor;
        if (approvalMode === 'ABOVE_THRESHOLD' && threshold === null) {
          throw new DomainError('VALIDATION_ERROR', { field: 'approvalThresholdMinor' });
        }

        const result = await client.query<MemberRow>(
          // Casts explícitos: sem eles o Postgres não consegue inferir o tipo de
          // um parâmetro que só aparece dentro de COALESCE/CASE com NULL.
          `UPDATE household_members
              SET display_name = COALESCE($3::text, display_name),
                  role = COALESCE($4::text, role),
                  is_supervised = COALESCE($5::boolean, is_supervised),
                  approval_mode = $6::text,
                  approval_threshold_minor =
                    CASE WHEN $6::text = 'ABOVE_THRESHOLD' THEN $7::bigint ELSE NULL END,
                  status = COALESCE($8::text, status),
                  version = version + 1
            WHERE id = $1 AND household_id = $2
            RETURNING id, household_id, user_id, display_name, NULL::text AS email, role, status,
                      is_supervised, approval_mode, approval_threshold_minor, color, joined_at,
                      version`,
          [
            memberId,
            householdId,
            input.displayName ?? null,
            input.role ?? null,
            input.isSupervised ?? null,
            approvalMode,
            threshold,
            input.status ?? null,
          ],
        );
        const updated = result.rows[0];
        /* c8 ignore next */
        if (!updated) throw new DomainError('NOT_FOUND');

        await insertAuditLog(client, {
          householdId,
          actorUserId: userId,
          entityType: 'household_member',
          entityId: memberId,
          action: 'MEMBER_UPDATED',
          beforeData: {
            role: target.role,
            status: target.status,
            approvalMode: target.approval_mode,
            approvalThresholdMinor: target.approval_threshold_minor,
          },
          afterData: {
            role: updated.role,
            status: updated.status,
            approvalMode: updated.approval_mode,
            approvalThresholdMinor: updated.approval_threshold_minor,
          },
          requestId: ctx.requestId,
        });

        return toMember(updated);
      });
    },

    /** Só o Proprietário transfere a propriedade (STATES-AND-MATRICES §2). */
    async transferOwnership(
      userId: string,
      householdId: string,
      toMemberId: string,
      ctx: RequestContext,
    ): Promise<{ transferred: boolean }> {
      return withUserTransaction(db, userId, async (client) => {
        await requireRole(client, householdId, userId, ['OWNER']);

        const target = await client.query<{ id: string; user_id: string | null }>(
          `SELECT id, user_id FROM household_members
            WHERE id = $1 AND household_id = $2 AND status = 'ACTIVE'`,
          [toMemberId, householdId],
        );
        if (!target.rows[0]?.user_id) throw new DomainError('NOT_FOUND');

        // Rebaixa o atual antes de promover: o índice único de proprietário
        // ativo por família garante que nunca existam dois.
        await client.query(
          `UPDATE household_members SET role = 'ADMIN', version = version + 1
            WHERE household_id = $1 AND role = 'OWNER' AND status = 'ACTIVE'`,
          [householdId],
        );
        await client.query(
          `UPDATE household_members SET role = 'OWNER', version = version + 1 WHERE id = $1`,
          [toMemberId],
        );

        await insertAuditLog(client, {
          householdId,
          actorUserId: userId,
          entityType: 'household',
          entityId: householdId,
          action: 'OWNERSHIP_TRANSFERRED',
          afterData: { toMemberId },
          requestId: ctx.requestId,
        });

        return { transferred: true };
      });
    },

    /** Trilha de auditoria da família (tela 3d). Proprietário e Admins. */
    async listAudit(userId: string, householdId: string, limit: number): Promise<AuditEntry[]> {
      return withUserTransaction(
        db,
        userId,
        async (client) => {
          await requireRole(client, householdId, userId, ADMIN_ROLES);
          const result = await client.query<{
            id: string;
            actor_name: string | null;
            entity_type: string;
            entity_id: string | null;
            action: string;
            before_data: Record<string, unknown> | null;
            after_data: Record<string, unknown> | null;
            metadata: Record<string, unknown> | null;
            created_at: Date;
          }>(
            // O nome vem de `household_members`, não de `profiles`.
            //
            // A RLS de `profiles` só deixa a pessoa ler o próprio perfil — e
            // corretamente, porque nome e e-mail de quem quer que seja não são
            // dados de família. O efeito colateral era que a 3d mostrava "Ana"
            // (você) e "Alguém" para todos os outros, o que esvazia uma tela
            // cujo texto é "{Autor} {ação} {objeto}". `display_name` é o nome
            // DENTRO da família, que é justamente o que a tela quer dizer.
            `SELECT a.id, m.display_name AS actor_name, a.entity_type, a.entity_id, a.action,
                    a.before_data, a.after_data, a.metadata, a.created_at
               FROM audit_logs a
               LEFT JOIN household_members m
                 ON m.user_id = a.actor_user_id AND m.household_id = a.household_id
              WHERE a.household_id = $1
              ORDER BY a.created_at DESC
              LIMIT $2`,
            [householdId, limit],
          );
          return result.rows.map((row) => ({
            id: row.id,
            actorName: row.actor_name,
            entityType: row.entity_type,
            entityId: row.entity_id,
            action: row.action,
            beforeData: row.before_data,
            afterData: row.after_data,
            metadata: row.metadata,
            createdAt: row.created_at.toISOString(),
          }));
        },
        { readOnly: true },
      );
    },
  };
}
