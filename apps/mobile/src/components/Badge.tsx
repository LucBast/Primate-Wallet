/**
 * Selo pequeno ao lado de um título — o "parcela 03/10" da 1f e da 2e.
 *
 * Mesma pílula do StatusChip (raio 999, texto Bold), normalmente sem o ponto:
 * não é estado, é uma qualificação da linha. Cores medidas em 1f-fatura.png:
 * fundo brandSoft, texto brand.
 *
 * `dot` liga o ● da regra 6 do CLAUDE.md para o caso do selo CONTADO — o
 * "● 1 aguardando" da 3a. Ali o texto varia com a contagem, então não cabe no
 * vocabulário fixo do StatusChip, mas continua comunicando estado e por isso
 * não pode ser só cor.
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '../design-system/Text';
import { useTheme } from '../design-system/theme';

export type BadgeTone = 'brand' | 'income' | 'warning' | 'neutral' | 'pending';

export type BadgeProps = {
  readonly label: string;
  readonly tone?: BadgeTone | undefined;
  /** Prefixa o ● quando o selo comunica estado (3a). */
  readonly dot?: boolean | undefined;
  readonly testID?: string | undefined;
};

export function Badge({
  label,
  tone = 'brand',
  dot = false,
  testID,
}: BadgeProps): React.JSX.Element {
  const { colors, radius } = useTheme();

  const palette = {
    brand: { background: colors.brandSoft, foreground: colors.brand },
    income: { background: colors.incomeSoft, foreground: colors.income },
    warning: { background: colors.warningSoft, foreground: colors.warning },
    neutral: { background: colors.chipNeutral, foreground: colors.textTertiary },
    pending: { background: colors.pendingSoft, foreground: colors.pending },
  }[tone];

  return (
    <View
      testID={testID}
      style={[styles.badge, { backgroundColor: palette.background, borderRadius: radius.pill }]}
    >
      <Text variant="rowMeta" style={{ color: palette.foreground }}>
        {dot ? `● ${label}` : label}
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
