/**
 * Campo de seleção (design/COMPONENT-SPECS.md §Field: "selects com ▾").
 *
 * Mesma caixa do `Field` — raio 14, borda 1, padding 9×14, rótulo caixa alta 10
 * e valor Bold 13 —, só que o valor não é digitável: abre um seletor. É o
 * "CONTA USADA · Conta Corrente · Bruno ▾" e o "DATA · Hoje, 06/08 ▾" da 1e, e
 * o mesmo desenho se repete em 2b, 8b e nos formulários.
 */

import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../design-system/Text';
import { useTheme } from '../design-system/theme';

export type SelectFieldProps = {
  readonly label: string;
  readonly value: string;
  readonly onPress: () => void;
  /** Sem escolha feita: o valor fica em textSecondary, como um placeholder. */
  readonly placeholder?: boolean | undefined;
  readonly error?: string | undefined;
  readonly testID?: string | undefined;
};

export function SelectField({
  label,
  value,
  onPress,
  placeholder = false,
  error,
  testID,
}: SelectFieldProps): React.JSX.Element {
  const { colors, radius } = useTheme();

  return (
    <View>
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value}`}
        onPress={onPress}
        style={({ pressed }) => [
          styles.card,
          {
            backgroundColor: colors.surfaceElevated,
            borderColor: error === undefined ? colors.borderStrong : colors.danger,
            borderRadius: radius.lg,
            opacity: pressed ? 0.7 : 1,
          },
        ]}
      >
        <Text variant="label" tone="secondary">
          {label}
        </Text>
        <Text variant="rowTitle" tone={placeholder ? 'secondary' : 'primary'} numberOfLines={1}>
          {`${value} ▾`}
        </Text>
      </Pressable>

      {error === undefined ? null : (
        <Text variant="rowMeta" tone="danger" style={styles.error}>
          {error}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    gap: 2,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  error: {
    marginLeft: 14,
    marginTop: 4,
  },
});
