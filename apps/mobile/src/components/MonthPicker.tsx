/**
 * Seletor de mês "‹ Ago 2026 ›" (SCREEN-SPECS §1b e §1d).
 *
 * As setas são os guilhemets simples ‹ › em texto, não os chevrons do set de
 * ícones: medidos em 1b-inicio.png e 1d-planejamento.png, os glifos têm 3–4dp
 * de largura, contra os ~10 de um `chevron-left` de 17. Este é o único lugar
 * do app que desenha uma seta com texto, e é assim porque o design é assim.
 *
 * Geometria medida em 1d-planejamento.png: 100×34, raio 12 (deduzido do recuo
 * da quina), borda 1 `border` sobre `surfaceElevated`, rótulo `chip`.
 */

import React from 'react';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import { Text } from '../design-system/Text';
import { useTheme } from '../design-system/theme';

export type MonthPickerProps = {
  /** Já formatado por `monthLabel` (services/dates). */
  readonly label: string;
  readonly onPrevious: () => void;
  readonly onNext: () => void;
  readonly style?: ViewStyle | undefined;
};

export function MonthPicker({
  label,
  onPrevious,
  onNext,
  style,
}: MonthPickerProps): React.JSX.Element {
  const { colors, radius } = useTheme();

  return (
    <View
      style={[
        styles.pill,
        {
          backgroundColor: colors.surfaceElevated,
          borderColor: colors.border,
          borderRadius: radius.md,
        },
        style,
      ]}
    >
      <Pressable
        testID="mes-anterior"
        accessibilityRole="button"
        accessibilityLabel="Mês anterior"
        hitSlop={12}
        onPress={onPrevious}
      >
        <Text variant="chip" tone="secondary">
          ‹
        </Text>
      </Pressable>

      <Text variant="chip">{label}</Text>

      <Pressable
        testID="mes-proximo"
        accessibilityRole="button"
        accessibilityLabel="Próximo mês"
        hitSlop={12}
        onPress={onNext}
      >
        <Text variant="chip" tone="secondary">
          ›
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignItems: 'center',
    // Não estica na vertical: ao lado do segmented (1b) a pílula é mais baixa.
    alignSelf: 'center',
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'center',
    // 14×8 fecham os 100×34 do screenshot com o rótulo `chip` (lineHeight 16).
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
});
