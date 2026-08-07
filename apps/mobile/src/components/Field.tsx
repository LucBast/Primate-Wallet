/**
 * Field (design/COMPONENT-SPECS.md §Field).
 *
 * Card raio 14, borda 1, padding 9×14. Label em caixa alta 10 textSecondary;
 * valor Bold 13. A ação à direita (ex.: "mostrar" na senha) fica na mesma linha
 * do valor, como no screenshot 6a.
 */

import React from 'react';
import { Pressable, StyleSheet, TextInput, View, type TextInputProps } from 'react-native';
import { Text } from '../design-system/Text';
import { useTheme } from '../design-system/theme';
import { font, type as typeTokens } from '../design-system/tokens';
import { fieldValueHeight } from '../design-system/spec-values';

export type FieldProps = Omit<TextInputProps, 'style' | 'placeholderTextColor'> & {
  readonly label: string;
  /** Texto de ação à direita do valor ("mostrar"/"ocultar"). */
  readonly actionLabel?: string | undefined;
  readonly onActionPress?: (() => void) | undefined;
  /** Mensagem de erro exibida abaixo do campo. */
  readonly error?: string | undefined;
  readonly testID?: string | undefined;
};

export function Field({
  label,
  actionLabel,
  onActionPress,
  error,
  testID,
  ...inputProps
}: FieldProps): React.JSX.Element {
  const { colors, radius } = useTheme();

  return (
    <View>
      <View
        style={[
          styles.card,
          {
            borderRadius: radius.lg,
            backgroundColor: colors.surfaceElevated,
            borderColor: error ? colors.danger : colors.border,
          },
        ]}
      >
        <Text variant="label" tone="secondary">
          {label}
        </Text>

        <View style={styles.row}>
          <TextInput
            {...inputProps}
            testID={testID}
            accessibilityLabel={label}
            placeholderTextColor={colors.textSecondary}
            style={[
              styles.input,
              {
                color: colors.textPrimary,
                fontFamily: font.bold,
                fontSize: typeTokens.rowTitle.fontSize,
                height: fieldValueHeight,
              },
            ]}
          />

          {actionLabel !== undefined && onActionPress !== undefined ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={actionLabel}
              onPress={onActionPress}
              hitSlop={12}
              style={styles.action}
            >
              <Text variant="caption" tone="secondary">
                {actionLabel}
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>

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
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  input: {
    flex: 1,
    padding: 0,
  },
  action: {
    paddingLeft: 12,
  },
  error: {
    marginLeft: 14,
    marginTop: 4,
  },
});
