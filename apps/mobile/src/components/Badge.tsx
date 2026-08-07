/**
 * Selo pequeno ao lado de um título — o "parcela 03/10" da 1f e da 2e.
 *
 * Mesma pílula do StatusChip (raio 999, texto Bold), mas sem o ponto: não é
 * estado, é uma qualificação da linha. Cores medidas em 1f-fatura.png:
 * fundo brandSoft, texto brand.
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '../design-system/Text';
import { useTheme } from '../design-system/theme';

export type BadgeTone = 'brand' | 'income' | 'warning' | 'neutral';

export type BadgeProps = {
  readonly label: string;
  readonly tone?: BadgeTone | undefined;
  readonly testID?: string | undefined;
};

export function Badge({ label, tone = 'brand', testID }: BadgeProps): React.JSX.Element {
  const { colors, radius } = useTheme();

  const palette = {
    brand: { background: colors.brandSoft, foreground: colors.brand },
    income: { background: colors.incomeSoft, foreground: colors.income },
    warning: { background: colors.warningSoft, foreground: colors.warning },
    neutral: { background: colors.chipNeutral, foreground: colors.textTertiary },
  }[tone];

  return (
    <View
      testID={testID}
      style={[styles.badge, { backgroundColor: palette.background, borderRadius: radius.pill }]}
    >
      <Text variant="rowMeta" style={{ color: palette.foreground }}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
});
