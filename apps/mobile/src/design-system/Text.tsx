/**
 * Texto tipado pelos tokens.
 *
 * Só existe um jeito de escrever texto no app: escolher uma `variant` de
 * `type` (tokens.ts). Isso impede tamanho de fonte "na mão" e garante Manrope
 * em todo lugar — nunca a fonte do sistema.
 *
 * Valores monetários usam as variantes money*, que já trazem
 * `fontVariant: ['tabular-nums']`.
 */

import React from 'react';
import { Text as RNText, type StyleProp, type TextProps, type TextStyle } from 'react-native';
import { useTheme } from './theme';
import { type as typeTokens } from './tokens';

export type TextVariant = keyof typeof typeTokens;

/** Cores de texto permitidas — sempre um token, nunca um hex. */
export type TextTone =
  | 'primary'
  | 'secondary'
  | 'tertiary'
  | 'brand'
  | 'income'
  | 'expense'
  | 'danger'
  | 'warning'
  | 'info'
  | 'pending'
  | 'onBrand';

export type TypographyProps = TextProps & {
  readonly variant?: TextVariant;
  readonly tone?: TextTone;
  readonly style?: StyleProp<TextStyle>;
  readonly children?: React.ReactNode;
};

export function Text({
  variant = 'body',
  tone = 'primary',
  style,
  children,
  ...rest
}: TypographyProps): React.JSX.Element {
  const { colors } = useTheme();

  const toneColor: Record<TextTone, string> = {
    primary: colors.textPrimary,
    secondary: colors.textSecondary,
    tertiary: colors.textTertiary,
    brand: colors.brand,
    income: colors.income,
    expense: colors.expense,
    danger: colors.danger,
    warning: colors.warning,
    info: colors.info,
    pending: colors.pending,
    onBrand: colors.surfaceElevated,
  };

  return (
    <RNText
      {...rest}
      // `as TextStyle` porque os tokens declaram textTransform/fontVariant como
      // string genérica; os valores são exatamente os aceitos pelo RN.
      style={[typeTokens[variant] as TextStyle, { color: toneColor[tone] }, style]}
    >
      {children}
    </RNText>
  );
}
