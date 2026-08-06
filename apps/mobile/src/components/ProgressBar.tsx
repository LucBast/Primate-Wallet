/**
 * ProgressBar (design/COMPONENT-SPECS.md §ProgressBar).
 *
 * Trilho chipNeutral raio 999, altura 7–8; preenchimento na cor do status.
 * Regra inegociável: a barra vem SEMPRE acompanhada do texto numérico
 * ("44% pago · status: ● Parcial") — cor sozinha nunca comunica estado.
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useTheme } from '../design-system/theme';

export type ProgressTone = 'warning' | 'income' | 'expense' | 'danger' | 'brand' | 'info';

export type ProgressBarProps = {
  /** 0–100. */
  readonly percent: number;
  readonly tone?: ProgressTone;
  readonly height?: 5 | 7 | 8;
  readonly trackTone?: 'neutral' | 'onBrand';
  readonly accessibilityLabel: string;
  readonly testID?: string | undefined;
};

export function ProgressBar({
  percent,
  tone = 'warning',
  height = 7,
  trackTone = 'neutral',
  accessibilityLabel,
  testID,
}: ProgressBarProps): React.JSX.Element {
  const { colors, radius } = useTheme();
  const clamped = percent < 0 ? 0 : percent > 100 ? 100 : percent;

  const fill = {
    warning: colors.warning,
    income: colors.income,
    expense: colors.expense,
    danger: colors.danger,
    brand: colors.brand,
    info: colors.info,
  }[tone];

  return (
    <View
      testID={testID}
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max: 100, now: Math.floor(clamped) }}
      style={[
        styles.track,
        {
          backgroundColor: trackTone === 'neutral' ? colors.chipNeutral : colors.toastAction,
          borderRadius: radius.pill,
          height,
        },
      ]}
    >
      <View
        style={{
          backgroundColor: fill,
          borderRadius: radius.pill,
          height: '100%',
          width: `${clamped}%`,
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { overflow: 'hidden', width: '100%' },
});
