/**
 * Matriz de estados de tela (design/STATES-AND-MATRICES.md §1, screenshot 5a).
 *
 * Toda tela que carrega dados usa estes componentes — é o que garante que
 * carregando, vazio, erro, offline e sem permissão tenham SEMPRE o mesmo
 * tratamento, com a copy da especificação.
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Banner } from './Banner';
import { Button } from './Button';
import { Card } from './Card';
import { Text } from '../design-system/Text';
import { useTheme } from '../design-system/theme';

/** Skeleton: blocos chipNeutral no layout final. Nunca tela branca. */
export function Skeleton({
  height = 52,
  width = '100%',
  radius: cornerRadius = 10,
}: {
  readonly height?: number;
  readonly width?: number | `${number}%`;
  readonly radius?: number;
}): React.JSX.Element {
  const { colors } = useTheme();
  return (
    <View
      accessibilityElementsHidden
      style={{ backgroundColor: colors.chipNeutral, borderRadius: cornerRadius, height, width }}
    />
  );
}

export function SkeletonList({ rows = 3 }: { readonly rows?: number }): React.JSX.Element {
  const { spacing } = useTheme();
  return (
    <View accessibilityLabel="Carregando" style={{ gap: spacing.sm }}>
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} />
      ))}
    </View>
  );
}

/** Vazio: ícone em container brandSoft + título + subtítulo + CTA primário. */
export function EmptyState({
  icon,
  title,
  subtitle,
  actionLabel,
  onAction,
  testID,
}: {
  readonly icon?: React.ReactNode;
  readonly title: string;
  readonly subtitle: string;
  readonly actionLabel?: string;
  readonly onAction?: () => void;
  readonly testID?: string;
}): React.JSX.Element {
  const { colors, radius, spacing } = useTheme();

  return (
    <View testID={testID} style={[styles.empty, { gap: spacing.sm }]}>
      {icon === undefined ? null : (
        <View
          style={[styles.emptyIcon, { backgroundColor: colors.brandSoft, borderRadius: radius.md }]}
        >
          {icon}
        </View>
      )}
      <Text variant="rowTitle" style={styles.centered}>
        {title}
      </Text>
      <Text variant="rowMeta" tone="secondary" style={styles.centered}>
        {subtitle}
      </Text>
      {actionLabel === undefined || onAction === undefined ? null : (
        <View style={{ marginTop: spacing.md, width: '100%' }}>
          <Button label={actionLabel} onPress={onAction} />
        </View>
      )}
    </View>
  );
}

/** Erro recuperável: o que houve + "Seus dados estão seguros." + retry. */
export function RecoverableError({
  message,
  onRetry,
  testID,
}: {
  readonly message: string;
  readonly onRetry: () => void;
  readonly testID?: string;
}): React.JSX.Element {
  return (
    <Banner
      testID={testID}
      kind="error"
      message={`${message} Seus dados estão seguros.`}
      onRetry={onRetry}
    />
  );
}

/** Sem conexão: banner infoSoft com ◌ e contagem de itens aguardando sync. */
export function OfflineBanner({
  pendingCount = 0,
  testID,
}: {
  readonly pendingCount?: number;
  readonly testID?: string;
}): React.JSX.Element {
  const suffix =
    pendingCount > 0
      ? ` · ${pendingCount} ${pendingCount === 1 ? 'item aguardando' : 'itens aguardando'} sincronização`
      : '';
  return (
    <Banner
      testID={testID}
      kind="offline"
      message={`Sem conexão — mostrando dados salvos${suffix}`}
    />
  );
}

/**
 * Sem permissão: explica quem pode dar acesso. Valores restritos NUNCA chegam
 * ao cliente (RLS) — não se borra nada, simplesmente não se renderiza.
 */
export function NoPermission({
  message = 'Você não tem acesso a esta parte. O proprietário ou um administrador da família pode liberar em Família › Permissões.',
  testID,
}: {
  readonly message?: string;
  readonly testID?: string;
}): React.JSX.Element {
  const { colors, radius } = useTheme();
  return (
    <View
      testID={testID}
      accessibilityRole="alert"
      style={[
        styles.noPermission,
        { backgroundColor: colors.pendingSoft, borderRadius: radius.md },
      ]}
    >
      <Text variant="rowMeta" tone="pending">
        {message}
      </Text>
    </View>
  );
}

/** Conflito de sincronização: servidor vence, nunca mesclar valores. */
export function SyncConflictCard({
  description,
  onReview,
  onDiscard,
}: {
  readonly description: string;
  readonly onReview: () => void;
  readonly onDiscard: () => void;
}): React.JSX.Element {
  const { colors, spacing } = useTheme();
  return (
    <Card style={{ borderColor: colors.warning }}>
      <Text variant="rowTitle">Alguém alterou este registro</Text>
      <Text variant="rowMeta" tone="secondary" style={{ marginTop: 4 }}>
        {description}
      </Text>
      <View style={[styles.conflictActions, { marginTop: spacing.md }]}>
        <View style={styles.conflictButton}>
          <Button label="Descartar" variant="secondary" size="sm" onPress={onDiscard} />
        </View>
        <View style={styles.conflictButton}>
          <Button label="Revisar e continuar" size="sm" onPress={onReview} />
        </View>
      </View>
    </Card>
  );
}

/** Duplicidade bloqueada pela idempotência. */
export function DuplicateBlockedBanner(): React.JSX.Element {
  return (
    <Banner
      kind="info"
      message="Este lançamento já foi salvo. Nada foi duplicado."
      testID="banner-duplicidade"
    />
  );
}

const styles = StyleSheet.create({
  empty: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  emptyIcon: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  centered: { textAlign: 'center' },
  noPermission: {
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  conflictActions: { flexDirection: 'row', gap: 10 },
  conflictButton: { flex: 1 },
});
