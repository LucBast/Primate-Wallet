/**
 * Tela 3a — Membros da família (screenshots/3a-familia.png).
 *
 * Ordem dos blocos, conferida contra o screenshot:
 *   1. Header ‹ + nome da família + "BRL · America/Sao_Paulo · criada em AAAA"
 *      + ação de editar à direita
 *   2. "MEMBROS · N" + card com uma linha por membro
 *      (avatar · nome [· você] · selo do papel colorido · chevron)
 *   3. "CONVITES PENDENTES · N" + card tracejado com e-mail,
 *      "● Aguardando aceite · Papel · expira em N dias" e ação "Revogar"
 *   4. Card de navegação: Aprovações pendentes (chip) / Atividade da família /
 *      Dispositivos e sessões
 *   5. CTA "+ Convidar membro" fixo no rodapé
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Invitation, Member } from '@ff/api-contracts';
import { Avatar } from '../../components/Avatar';
import { Button } from '../../components/Button';
import { Card, ListRow, SectionLabel } from '../../components/Card';
import { ScreenHeader } from '../../components/ScreenHeader';
import { EmptyState, RecoverableError, SkeletonList } from '../../components/states';
import { Text } from '../../design-system/Text';
import { useTheme } from '../../design-system/theme';
import { icons, iconSize } from '../../design-system/icons';
import { formatMoney, minor } from '@ff/domain';
import { ApiRequestError } from '../../services/api-client';
import { useSessionStore } from '../auth/session-store';
import * as api from './household-api';
import { useActiveHousehold } from './household-store';
import { ROLE_LABEL, ROLE_TONE } from './roles';

export type FamilyScreenProps = {
  readonly onOpenMember: (member: Member) => void;
  readonly onInvite: () => void;
  readonly onOpenActivity: () => void;
  readonly onOpenApprovals: () => void;
  readonly onOpenSessions: () => void;
  readonly onEditHousehold: () => void;
  readonly onBack?: () => void;
};

/** "Filho supervisionado · aprovação acima de R$ 50,00" (screenshot 3a). */
function roleLine(member: Member): string {
  const base = ROLE_LABEL[member.role];
  if (member.approvalMode === 'ALWAYS') return `${base} · toda despesa precisa de aprovação`;
  if (member.approvalMode === 'ABOVE_THRESHOLD' && member.approvalThresholdMinor !== null) {
    return `${base} · aprovação acima de ${formatMoney(minor(member.approvalThresholdMinor))}`;
  }
  return base;
}

export function FamilyScreen(props: FamilyScreenProps): React.JSX.Element {
  const { colors, layout, spacing } = useTheme();
  const insets = useSafeAreaInsets();
  const accessToken = useSessionStore((state) => state.accessToken);
  const profileId = useSessionStore((state) => state.profile?.id ?? null);
  const household = useActiveHousehold();

  const [members, setMembers] = useState<Member[] | null>(null);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const canManage = household?.myRole === 'OWNER' || household?.myRole === 'ADMIN';

  const load = useCallback(async () => {
    if (!accessToken || !household) return;
    setError(null);
    try {
      const list = await api.listMembers(accessToken, household.id);
      setMembers(list);
      // Convites são visíveis só para quem administra: o servidor recusa os
      // demais, e a tela não pede o que não pode ver.
      if (canManage) {
        setInvitations(await api.listInvitations(accessToken, household.id));
      }
    } catch (cause) {
      setError(
        cause instanceof ApiRequestError
          ? cause.message
          : 'Não foi possível carregar os membros agora.',
      );
    }
  }, [accessToken, canManage, household]);

  useEffect(() => {
    void load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const People = icons.inicio;
  const Editar = icons.editar;

  return (
    <View style={[styles.flex, { backgroundColor: colors.surface }]}>
      <ScreenHeader
        title={household?.name ?? 'Família'}
        subtitle={
          household
            ? `${household.currencyCode} · ${household.timezone} · criada em ${household.createdAt.slice(0, 4)}`
            : undefined
        }
        {...(props.onBack === undefined ? {} : { onBack: props.onBack })}
        // No screenshot a ação de editar é um lápis, não um botão com rótulo.
        right={
          canManage ? (
            <Pressable
              testID="editar-familia"
              accessibilityRole="button"
              accessibilityLabel="Editar família"
              hitSlop={10}
              onPress={props.onEditHousehold}
            >
              <Editar size={iconSize.action} color={colors.textPrimary} />
            </Pressable>
          ) : undefined
        }
      />

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingHorizontal: layout.screenPaddingH, paddingBottom: spacing.xxxl },
        ]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} />
        }
      >
        {error === null ? null : (
          <View style={{ marginBottom: spacing.md }}>
            <RecoverableError message={error} onRetry={() => void load()} testID="erro-membros" />
          </View>
        )}

        {members === null ? (
          <SkeletonList rows={4} />
        ) : members.length === 0 ? (
          <EmptyState
            icon={<People size={iconSize.action} color={colors.brand} />}
            title="Nenhum membro ainda"
            subtitle="Convide quem cuida das finanças com você."
            actionLabel="+ Convidar membro"
            onAction={props.onInvite}
          />
        ) : (
          <>
            <SectionLabel>{`MEMBROS · ${members.length}`}</SectionLabel>
            <Card padded={false} testID="card-membros">
              {members.map((member, index) => (
                <ListRow
                  key={member.id}
                  first={index === 0}
                  testID={`membro-${member.id}`}
                  title={member.displayName}
                  // "Bruno Souza · você": o "· você" é discreto, em rowMeta.
                  badge={
                    member.userId !== null && member.userId === profileId ? (
                      <Text variant="rowMeta" tone="secondary">
                        · você
                      </Text>
                    ) : undefined
                  }
                  meta={roleLine(member)}
                  metaTone={ROLE_TONE[member.role]}
                  left={<Avatar name={member.displayName} seed={member.id} />}
                  showChevron={canManage}
                  {...(canManage ? { onPress: () => props.onOpenMember(member) } : {})}
                />
              ))}
            </Card>
          </>
        )}

        {invitations.length === 0 ? null : (
          <View style={{ marginTop: spacing.xl }}>
            <SectionLabel>{`CONVITES PENDENTES · ${invitations.length}`}</SectionLabel>
            <Card padded={false} tone="dashed" testID="card-convites">
              {invitations.map((invitation, index) => (
                <ListRow
                  key={invitation.id}
                  first={index === 0}
                  title={invitation.email}
                  meta={`● Aguardando aceite · ${ROLE_LABEL[invitation.role]} · expira em ${invitation.expiresInDays} ${invitation.expiresInDays === 1 ? 'dia' : 'dias'}`}
                  metaTone="warning"
                  left={<Avatar name={invitation.email} muted />}
                  right={
                    <Pressable
                      testID={`revogar-${invitation.id}`}
                      accessibilityRole="button"
                      accessibilityLabel="Revogar convite"
                      hitSlop={8}
                      onPress={async () => {
                        if (!accessToken || !household) return;
                        await api.revokeInvitation(accessToken, household.id, invitation.id);
                        await load();
                      }}
                    >
                      <Text variant="rowMeta" tone="danger">
                        Revogar
                      </Text>
                    </Pressable>
                  }
                />
              ))}
            </Card>
          </View>
        )}

        <View style={{ marginTop: spacing.xl }}>
          <Card padded={false} testID="card-navegacao">
            <ListRow
              first
              title="Aprovações pendentes"
              onPress={props.onOpenApprovals}
              showChevron
              testID="link-aprovacoes"
            />
            <ListRow
              title="Atividade da família"
              onPress={props.onOpenActivity}
              showChevron
              testID="link-atividade"
            />
            <ListRow
              title="Dispositivos e sessões"
              onPress={props.onOpenSessions}
              showChevron
              testID="link-sessoes"
            />
          </Card>
        </View>
      </ScrollView>

      {canManage ? (
        <View
          style={[
            styles.footer,
            {
              backgroundColor: colors.surface,
              paddingBottom: Math.max(spacing.lg, insets.bottom),
              paddingHorizontal: layout.screenPaddingH,
            },
          ]}
        >
          <Button testID="convidar-membro" label="+ Convidar membro" onPress={props.onInvite} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingTop: 4 },
  footer: { paddingTop: 12 },
});
