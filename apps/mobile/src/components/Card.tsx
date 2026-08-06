/**
 * Cartões e linhas de lista (design/COMPONENT-SPECS.md §ListRow e §Cards).
 *
 * Card: surfaceElevated, borda 1, raio 16, padding 14×16.
 * ListRow: altura mínima 52, divisor 1 entre linhas dentro do mesmo card.
 */

import React from 'react';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import { Text } from '../design-system/Text';
import { useTheme } from '../design-system/theme';
import { icons, iconSize } from '../design-system/icons';

export function SectionLabel({ children }: { readonly children: string }): React.JSX.Element {
  const { spacing } = useTheme();
  return (
    <Text variant="sectionCaps" tone="secondary" style={{ marginBottom: spacing.sm }}>
      {children}
    </Text>
  );
}

export type CardProps = {
  readonly children: React.ReactNode;
  /** Cards de lista não têm padding vertical: cada linha traz o seu. */
  readonly padded?: boolean | undefined;
  readonly tone?: 'default' | 'danger' | 'dashed';
  readonly style?: ViewStyle | undefined;
  readonly testID?: string | undefined;
};

export function Card({
  children,
  padded = true,
  tone = 'default',
  style,
  testID,
}: CardProps): React.JSX.Element {
  const { colors, radius, layout } = useTheme();

  return (
    <View
      testID={testID}
      style={[
        {
          backgroundColor: tone === 'dashed' ? 'transparent' : colors.surfaceElevated,
          borderColor: tone === 'danger' ? colors.danger : colors.border,
          borderRadius: radius.xl,
          borderStyle: tone === 'dashed' ? 'dashed' : 'solid',
          borderWidth: 1,
          paddingHorizontal: padded ? layout.cardPaddingH : 14,
          paddingVertical: padded ? layout.cardPaddingV : 0,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export type ListRowProps = {
  readonly title: string;
  readonly meta?: string | undefined;
  /** Cor semântica do meta quando ele carrega status. */
  readonly metaTone?: React.ComponentProps<typeof Text>['tone'];
  readonly left?: React.ReactNode | undefined;
  readonly right?: React.ReactNode | undefined;
  readonly onPress?: (() => void) | undefined;
  readonly showChevron?: boolean | undefined;
  readonly first?: boolean | undefined;
  readonly testID?: string | undefined;
  readonly accessibilityLabel?: string | undefined;
};

export function ListRow({
  title,
  meta,
  metaTone = 'secondary',
  left,
  right,
  onPress,
  showChevron = false,
  first = false,
  testID,
  accessibilityLabel,
}: ListRowProps): React.JSX.Element {
  const { colors } = useTheme();
  const Chevron = icons.proximo;

  const content = (
    <View style={[styles.row, !first && { borderTopColor: colors.divider, borderTopWidth: 1 }]}>
      {left === undefined ? null : <View style={styles.left}>{left}</View>}

      <View style={styles.texts}>
        <Text variant="rowTitle">{title}</Text>
        {meta === undefined ? null : (
          <Text variant="rowMeta" tone={metaTone}>
            {meta}
          </Text>
        )}
      </View>

      {right}
      {showChevron ? (
        <Chevron size={iconSize.row} color={colors.textSecondary} strokeWidth={2} />
      ) : null}
    </View>
  );

  if (onPress === undefined) return content;

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      onPress={onPress}
      style={({ pressed }) => (pressed ? styles.pressed : null)}
    >
      {content}
    </Pressable>
  );
}

/** Container de ícone: quadrado arredondado com fundo *Soft (UI-FIDELITY §Ícones). */
export function IconBadge({
  children,
  background,
}: {
  readonly children: React.ReactNode;
  readonly background: string;
}): React.JSX.Element {
  const { radius } = useTheme();
  return (
    <View style={[styles.iconBadge, { backgroundColor: background, borderRadius: radius.md }]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    minHeight: 52,
    paddingVertical: 10,
  },
  left: { justifyContent: 'center' },
  texts: { flex: 1, gap: 2 },
  pressed: { opacity: 0.7 },
  iconBadge: {
    alignItems: 'center',
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
});
