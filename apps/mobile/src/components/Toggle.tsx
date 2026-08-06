/**
 * Toggle (design/COMPONENT-SPECS.md §Toggle): 40×24, trilho raio 999
 * (ligado brand, desligado chipNeutral), bolinha branca 20.
 */

import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTheme } from '../design-system/theme';

export type ToggleProps = {
  readonly value: boolean;
  readonly onValueChange: (value: boolean) => void;
  readonly accessibilityLabel: string;
  readonly disabled?: boolean;
  readonly testID?: string;
};

export function Toggle({
  value,
  onValueChange,
  accessibilityLabel,
  disabled = false,
  testID,
}: ToggleProps): React.JSX.Element {
  const { colors, radius, layout } = useTheme();

  return (
    <Pressable
      testID={testID}
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked: value, disabled }}
      disabled={disabled}
      onPress={() => onValueChange(!value)}
      // Toque mínimo de 44 sem alterar o tamanho visual do controle.
      hitSlop={(layout.minTouch - 24) / 2}
      style={[
        styles.track,
        {
          backgroundColor: value ? colors.brand : colors.chipNeutral,
          borderRadius: radius.pill,
          opacity: disabled ? 0.5 : 1,
        },
      ]}
    >
      <View
        style={[
          styles.thumb,
          {
            backgroundColor: colors.surfaceElevated,
            alignSelf: value ? 'flex-end' : 'flex-start',
          },
        ]}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  track: {
    height: 24,
    justifyContent: 'center',
    paddingHorizontal: 2,
    width: 40,
  },
  thumb: {
    borderRadius: 10,
    height: 20,
    width: 20,
  },
});
