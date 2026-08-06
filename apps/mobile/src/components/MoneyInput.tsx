/**
 * MoneyInput (design/COMPONENT-SPECS.md §MoneyInput).
 *
 * Card com borda 1.5 brand, raio 16, padding 10×16. Label em caixa alta 10
 * brand. Valor ExtraBold 24–44 conforme a tela (44 no lançamento rápido, 28 na
 * baixa, 30 na compra). Helper 10.5 quando existe máximo.
 *
 * O estado é sempre CENTAVOS INTEIROS: a digitação empurra dígitos pela direita,
 * como uma calculadora de caixa, então nunca existe um número fracionário
 * intermediário — a invariante nº 1 vale até no input.
 */

import React, { useCallback } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { formatMoney, minor } from '@ff/domain';
import { Text } from '../design-system/Text';
import { useTheme } from '../design-system/theme';
import { font } from '../design-system/tokens';

export type MoneyInputProps = {
  readonly label: string;
  /** Valor em centavos inteiros. */
  readonly valueMinor: number;
  readonly onChangeMinor: (valueMinor: number) => void;
  /** Máximo permitido; mostra o helper "máximo permitido: R$ X". */
  readonly maxMinor?: number | undefined;
  readonly maxHelperSuffix?: string | undefined;
  readonly size?: 24 | 28 | 30 | 44;
  readonly autoFocus?: boolean | undefined;
  readonly testID?: string | undefined;
};

export function MoneyInput({
  label,
  valueMinor,
  onChangeMinor,
  maxMinor,
  maxHelperSuffix,
  size = 30,
  autoFocus = false,
  testID,
}: MoneyInputProps): React.JSX.Element {
  const { colors, radius } = useTheme();

  /**
   * Recebe o texto bruto do teclado, mantém só os dígitos e reinterpreta como
   * centavos. Digitar "5" vira R$ 0,05; digitar "53450" vira R$ 534,50.
   */
  const handleChange = useCallback(
    (raw: string) => {
      const digits = raw.replace(/\D/g, '').slice(0, 15);
      const next = digits === '' ? 0 : Number.parseInt(digits, 10);
      onChangeMinor(maxMinor !== undefined && next > maxMinor ? maxMinor : next);
    },
    [maxMinor, onChangeMinor],
  );

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.surfaceElevated,
          borderColor: colors.brand,
          borderRadius: radius.xl,
        },
      ]}
    >
      <Text variant="label" tone="brand">
        {label}
      </Text>

      <Pressable accessibilityRole="none" style={styles.valueRow}>
        <TextInput
          testID={testID}
          accessibilityLabel={label}
          value={formatMoney(minor(valueMinor))}
          onChangeText={handleChange}
          keyboardType="number-pad"
          autoFocus={autoFocus}
          selectTextOnFocus={false}
          // Cursor fino na cor brand, como na especificação.
          cursorColor={colors.brand}
          selectionColor={colors.brand}
          style={[
            styles.input,
            {
              color: colors.textPrimary,
              fontFamily: font.extrabold,
              fontSize: size,
            },
          ]}
        />
      </Pressable>

      {maxMinor === undefined ? null : (
        <Text variant="rowMeta" tone="secondary">
          {`máximo permitido: ${formatMoney(minor(maxMinor))}${maxHelperSuffix ?? ''}`}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1.5,
    gap: 2,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  valueRow: { flexDirection: 'row' },
  input: {
    flex: 1,
    padding: 0,
    // `tabular-nums` mantém os dígitos alinhados enquanto o valor muda.
    fontVariant: ['tabular-nums'],
  },
});
