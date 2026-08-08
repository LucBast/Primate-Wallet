/**
 * Botões (design/COMPONENT-SPECS.md §Botões).
 *
 * - Primário: altura 54 (48 em pares lado a lado), raio 16 (14 quando 48),
 *   fundo brand, texto branco ExtraBold 15 (13–14 quando 48).
 * - Secundário: mesmo tamanho, fundo surfaceElevated, borda 1.5, texto Bold.
 * - Destrutivo secundário: borda 1.5 danger 40%, texto danger.
 * - Desabilita no primeiro toque (idempotência) e respeita toque mínimo 44.
 */

import React, { useCallback, useRef } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import { Text } from '../design-system/Text';
import { useTheme } from '../design-system/theme';
import { fixedColors } from '../design-system/spec-values';
import { secondaryBorderWidth } from '../design-system/spec-values';

export type ButtonVariant = 'primary' | 'secondary' | 'destructive';
export type ButtonSize = 'lg' | 'sm';

export type ButtonProps = {
  readonly label: string;
  readonly onPress: () => void | Promise<void>;
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
  readonly disabled?: boolean | undefined;
  readonly loading?: boolean | undefined;
  readonly accessibilityHint?: string | undefined;
  readonly style?: ViewStyle | undefined;
  readonly testID?: string | undefined;
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'lg',
  disabled = false,
  loading = false,
  accessibilityHint,
  style,
  testID,
}: ButtonProps): React.JSX.Element {
  const { colors, radius, layout } = useTheme();
  // Guarda de toque duplo: um comando financeiro não pode sair duas vezes por
  // dois toques rápidos (docs/04 §14).
  const busy = useRef(false);

  const handlePress = useCallback(() => {
    if (busy.current || disabled || loading) return;
    busy.current = true;
    void Promise.resolve(onPress()).finally(() => {
      busy.current = false;
    });
  }, [disabled, loading, onPress]);

  const height = size === 'lg' ? layout.buttonHeight : layout.buttonHeightSm;
  const cornerRadius = size === 'lg' ? radius.xl : radius.lg;

  const background = variant === 'primary' ? colors.brand : colors.surfaceElevated;
  const borderColor =
    variant === 'primary'
      ? colors.brand
      : variant === 'destructive'
        ? colors.danger
        : colors.border;

  const inactive = disabled || loading;

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: inactive, busy: loading }}
      {...(accessibilityHint === undefined ? {} : { accessibilityHint })}
      disabled={inactive}
      onPress={handlePress}
      hitSlop={height >= layout.minTouch ? 0 : (layout.minTouch - height) / 2}
      style={({ pressed }) => [
        styles.base,
        {
          height,
          borderRadius: cornerRadius,
          backgroundColor: background,
          borderColor,
          borderWidth: variant === 'primary' ? 0 : secondaryBorderWidth,
          opacity: inactive ? 0.5 : pressed ? 0.85 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator
          color={variant === 'primary' ? fixedColors.onBrand : colors.brand}
          accessibilityLabel="Carregando"
        />
      ) : (
        <View style={styles.content}>
          <Text
            variant={size === 'lg' ? 'button' : 'rowTitle'}
            tone={
              variant === 'primary' ? 'onBrand' : variant === 'destructive' ? 'danger' : 'primary'
            }
          >
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  content: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
