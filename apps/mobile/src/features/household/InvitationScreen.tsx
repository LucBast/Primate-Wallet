/**
 * Tela 6b — Aceite de convite (screenshots/6b-convite.png).
 *
 * Blocos, na ordem do screenshot:
 *   1. Avatares sobrepostos da família
 *   2. "{Nome} convidou você para a {Família}"
 *   3. Meta "N membros · BRL · convite expira em N dias"
 *   4. Card "Seu papel" com chip do papel + lista ✓/✕ do que ele permite
 *   5. Banner infoSoft: "O convite vale uma única vez e só para este e-mail.
 *      Você pode participar de mais de uma família e alternar no topo do Início."
 *   6. CTAs "Aceitar e entrar na família" / "Recusar convite"
 */

import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { InvitationPreview } from '@ff/api-contracts';
import { AvatarStack } from '../../components/Avatar';
import { Banner } from '../../components/Banner';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Text } from '../../design-system/Text';
import { useTheme } from '../../design-system/theme';
import { ApiRequestError } from '../../services/api-client';
import { useSessionStore } from '../auth/session-store';
import * as api from './household-api';
import { ROLE_ABILITIES, ROLE_LABEL } from './roles';

export type InvitationScreenProps = {
  readonly token: string;
  readonly onAccepted: (householdId: string) => void;
  readonly onDeclined: () => void;
};

export function InvitationScreen({
  token,
  onAccepted,
  onDeclined,
}: InvitationScreenProps): React.JSX.Element {
  const { colors, layout, radius, spacing } = useTheme();
  const insets = useSafeAreaInsets();
  const accessToken = useSessionStore((state) => state.accessToken);

  const [preview, setPreview] = useState<InvitationPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setError(null);
    try {
      setPreview(await api.previewInvitation(accessToken, token));
    } catch (cause) {
      setError(
        cause instanceof ApiRequestError ? cause.message : 'Não foi possível abrir este convite.',
      );
    }
  }, [accessToken, token]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleAccept = useCallback(async () => {
    if (!accessToken) return;
    setAccepting(true);
    setError(null);
    try {
      const result = await api.acceptInvitation(accessToken, token);
      onAccepted(result.householdId);
    } catch (cause) {
      setError(
        cause instanceof ApiRequestError ? cause.message : 'Não foi possível aceitar agora.',
      );
    } finally {
      setAccepting(false);
    }
  }, [accessToken, onAccepted, token]);

  if (preview === null) {
    return (
      <View style={[styles.center, { backgroundColor: colors.surface }]}>
        {error === null ? (
          <ActivityIndicator color={colors.brand} accessibilityLabel="Carregando" />
        ) : (
          <View style={{ paddingHorizontal: layout.screenPaddingH, width: '100%' }}>
            <Banner
              kind="error"
              message={error}
              onRetry={() => void load()}
              testID="erro-convite"
            />
            <View style={{ marginTop: spacing.lg }}>
              <Button label="Voltar" variant="secondary" onPress={onDeclined} />
            </View>
          </View>
        )}
      </View>
    );
  }

  const abilities = ROLE_ABILITIES[preview.role];

  return (
    <View style={[styles.flex, { backgroundColor: colors.surface }]}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingHorizontal: layout.screenPaddingH,
            paddingTop: insets.top + spacing.xxxl,
          },
        ]}
      >
        <AvatarStack names={preview.memberNames} />

        <Text variant="pageTitle" style={[styles.centered, { marginTop: spacing.lg }]}>
          {`${preview.invitedByName} convidou você para a ${preview.householdName}`}
        </Text>

        <Text
          variant="rowMeta"
          tone="secondary"
          style={[styles.centered, { marginTop: spacing.sm }]}
        >
          {`${preview.memberCount} ${preview.memberCount === 1 ? 'membro' : 'membros'} · ${preview.currencyCode} · convite expira em ${preview.expiresInDays} ${preview.expiresInDays === 1 ? 'dia' : 'dias'}`}
        </Text>

        <View style={{ marginTop: spacing.xl }}>
          <Card testID="card-papel">
            <View style={styles.roleHeader}>
              <Text variant="rowTitle">Seu papel</Text>
              <View
                style={[
                  styles.roleChip,
                  { backgroundColor: colors.infoSoft, borderRadius: radius.pill },
                ]}
              >
                <Text variant="chip" tone="info">
                  {ROLE_LABEL[preview.role]}
                </Text>
              </View>
            </View>

            <Text variant="rowMeta" tone="secondary" style={{ marginTop: spacing.md }}>
              {`Como ${ROLE_LABEL[preview.role]} você pode:`}
            </Text>

            <View style={{ marginTop: spacing.xs }}>
              {abilities.map((ability) => (
                <Text
                  key={ability.text}
                  variant="rowMeta"
                  tone={ability.can ? 'primary' : 'secondary'}
                  style={styles.ability}
                >
                  {`${ability.can ? '✓' : '✕'} ${ability.text}`}
                </Text>
              ))}
            </View>
          </Card>
        </View>

        <View style={{ marginTop: spacing.md }}>
          <Banner
            kind="info"
            testID="banner-convite"
            message="O convite vale uma única vez e só para este e-mail. Você pode participar de mais de uma família e alternar no topo do Início."
          />
        </View>

        {error === null ? null : (
          <View style={{ marginTop: spacing.md }}>
            <Banner kind="error" message={error} testID="erro-aceite" />
          </View>
        )}
      </ScrollView>

      <View
        style={[
          styles.footer,
          {
            paddingBottom: Math.max(spacing.lg, insets.bottom),
            paddingHorizontal: layout.screenPaddingH,
          },
        ]}
      >
        <Button
          testID="aceitar-convite"
          label="Aceitar e entrar na família"
          loading={accepting}
          onPress={handleAccept}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Recusar convite"
          onPress={onDeclined}
          hitSlop={12}
          style={{ marginTop: spacing.md }}
          testID="recusar-convite"
        >
          <Text variant="rowTitle" tone="secondary" style={styles.centered}>
            Recusar convite
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { alignItems: 'center', flex: 1, justifyContent: 'center' },
  content: { flexGrow: 1, paddingBottom: 24 },
  centered: { textAlign: 'center' },
  roleHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  roleChip: { paddingHorizontal: 11, paddingVertical: 4 },
  ability: { lineHeight: 17 },
  footer: { paddingTop: 12 },
});
