/**
 * Cartões e linhas de lista (design/COMPONENT-SPECS.md §ListRow e §Cards).
 *
 * Card: surfaceElevated, borda 1, raio 16, padding 14×16.
 * ListRow: altura mínima 52, divisor 1 entre linhas dentro do mesmo card.
 */

import React from 'react';
import { Pressable, StyleSheet, View, type TextStyle, type ViewStyle } from 'react-native';
import { Text } from '../design-system/Text';
import { useTheme } from '../design-system/theme';
import { icons, iconSize } from '../design-system/icons';

export function SectionLabel({
  children,
  tone = 'secondary',
}: {
  readonly children: string;
  /** "VENCIDAS · 2" da 1d é danger; os demais rótulos são secundários. */
  readonly tone?: React.ComponentProps<typeof Text>['tone'];
}): React.JSX.Element {
  const { spacing } = useTheme();
  return (
    <Text variant="sectionCaps" tone={tone} style={{ marginBottom: spacing.sm }}>
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
  /** Conta paga ou cancelada leva line-through no TÍTULO (1d, 1g). */
  readonly titleStyle?: TextStyle | undefined;
  /** Selo ao lado do título — "parcela 03/10" na 1f. */
  readonly badge?: React.ReactNode | undefined;
  readonly meta?: string | undefined;
  /** Cor semântica do meta quando ele carrega status. */
  readonly metaTone?: React.ComponentProps<typeof Text>['tone'];
  readonly left?: React.ReactNode | undefined;
  readonly right?: React.ReactNode | undefined;
  /**
   * Bloco extra abaixo do meta, dentro da coluna de texto — é a ProgressBar da
   * baixa parcial na 1d, que ocupa a largura do texto e não a da linha inteira
   * (medido em 1d-planejamento.png: 250 de 324).
   */
  readonly below?: React.ReactNode | undefined;
  readonly onPress?: (() => void) | undefined;
  readonly showChevron?: boolean | undefined;
  readonly first?: boolean | undefined;
  readonly testID?: string | undefined;
  readonly accessibilityLabel?: string | undefined;
};

export function ListRow({
  title,
  titleStyle,
  badge,
  meta,
  metaTone = 'secondary',
  left,
  right,
  below,
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
        {badge === undefined ? (
          <Text variant="rowTitle" style={titleStyle}>
            {title}
          </Text>
        ) : (
          <View style={styles.titleLine}>
            <Text variant="rowTitle" style={titleStyle}>
              {title}
            </Text>
            {badge}
          </View>
        )}
        {meta === undefined ? null : (
          <Text variant="rowMeta" tone={metaTone}>
            {meta}
          </Text>
        )}
        {below}
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

export type StatCardProps = {
  readonly label: string;
  readonly value: string;
  /** Na 1d o rótulo tem a mesma cor do valor: PAGO income, FALTA PAGAR warning. */
  readonly tone?: React.ComponentProps<typeof Text>['tone'];
  readonly labelTone?: React.ComponentProps<typeof Text>['tone'];
  readonly testID?: string | undefined;
};

/**
 * Mini-card de indicador — os três "PREVISTO / PAGO / FALTA PAGAR" da 1d.
 *
 * Geometria do Field (COMPONENT-SPECS §Field: raio 14, borda 1, padding 9×14),
 * com rótulo `label` em caixa alta e valor `moneyRow`. Fecha nos 55 de altura
 * medidos em 1d-planejamento.png — o Card comum, de padding 14×16, dava 65.
 */
export function StatCard({
  label,
  value,
  tone = 'primary',
  labelTone = 'secondary',
  testID,
}: StatCardProps): React.JSX.Element {
  const { colors, radius } = useTheme();

  return (
    <View
      testID={testID}
      style={[
        styles.statCard,
        {
          backgroundColor: colors.surfaceElevated,
          borderColor: colors.border,
          borderRadius: radius.lg,
        },
      ]}
    >
      <Text variant="label" tone={labelTone}>
        {label}
      </Text>
      <Text variant="moneyRow" tone={tone}>
        {value}
      </Text>
    </View>
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
  titleLine: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pressed: { opacity: 0.7 },
  statCard: {
    borderWidth: 1,
    flex: 1,
    gap: 2,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  iconBadge: {
    alignItems: 'center',
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
});
