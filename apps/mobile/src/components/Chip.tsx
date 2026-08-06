/**
 * Chips (design/COMPONENT-SPECS.md §SelectorChip e §SegmentedControl).
 *
 * - SelectorChip: pill raio 12, padding 9×13, brandSoft, Bold 12 brand, sufixo ▾.
 *   Vazio: borda tracejada 1.5 e texto textSecondary.
 * - ChoiceChip: seleção de papel/tipo/parcelas (3b, 2b, 2e). Selecionado usa a
 *   cor semântica do item; não selecionado é contorno neutro.
 * - SegmentedControl: trilho chipNeutral raio 12 padding 3; ativo branco raio 10.
 */

import React from 'react';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import { Text } from '../design-system/Text';
import { useTheme } from '../design-system/theme';

export type SelectorChipProps = {
  readonly label: string;
  readonly onPress: () => void;
  /** Sem valor escolhido: borda tracejada e texto secundário. */
  readonly empty?: boolean | undefined;
  readonly testID?: string | undefined;
};

export function SelectorChip({
  label,
  onPress,
  empty = false,
  testID,
}: SelectorChipProps): React.JSX.Element {
  const { colors, radius } = useTheme();

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={8}
      style={[
        styles.selector,
        {
          backgroundColor: empty ? 'transparent' : colors.brandSoft,
          borderColor: empty ? colors.border : 'transparent',
          borderRadius: radius.md,
          borderStyle: empty ? 'dashed' : 'solid',
          borderWidth: empty ? 1.5 : 0,
        },
      ]}
    >
      <Text variant="chip" tone={empty ? 'secondary' : 'brand'}>
        {`${label} ▾`}
      </Text>
    </Pressable>
  );
}

export type ChoiceChipTone = 'brand' | 'pending' | 'info' | 'neutral';

export type ChoiceChipProps = {
  readonly label: string;
  readonly selected: boolean;
  readonly onPress: () => void;
  readonly tone?: ChoiceChipTone | undefined;
  readonly testID?: string | undefined;
};

export function ChoiceChip({
  label,
  selected,
  onPress,
  tone = 'brand',
  testID,
}: ChoiceChipProps): React.JSX.Element {
  const { colors, radius } = useTheme();

  const selectedColor = {
    brand: colors.brand,
    pending: colors.pending,
    info: colors.info,
    neutral: colors.textTertiary,
  }[tone];

  return (
    <Pressable
      testID={testID}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      onPress={onPress}
      style={[
        styles.choice,
        {
          backgroundColor: selected ? selectedColor : 'transparent',
          borderColor: selected ? selectedColor : colors.border,
          borderRadius: radius.md,
        },
      ]}
    >
      <Text
        variant="chip"
        style={{ color: selected ? colors.surfaceElevated : colors.textPrimary }}
      >
        {selected ? `✓ ${label}` : label}
      </Text>
    </Pressable>
  );
}

export type SegmentedControlProps<T extends string> = {
  readonly options: ReadonlyArray<{ value: T; label: string }>;
  readonly value: T;
  readonly onChange: (value: T) => void;
  readonly style?: ViewStyle | undefined;
  readonly testID?: string | undefined;
};

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  style,
  testID,
}: SegmentedControlProps<T>): React.JSX.Element {
  const { colors, radius } = useTheme();

  return (
    <View
      testID={testID}
      accessibilityRole="tablist"
      style={[
        styles.segmentTrack,
        { backgroundColor: colors.chipNeutral, borderRadius: radius.md },
        style,
      ]}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            testID={testID === undefined ? undefined : `${testID}-${option.value}`}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={option.label}
            onPress={() => onChange(option.value)}
            style={[
              styles.segment,
              active && {
                backgroundColor: colors.surfaceElevated,
                borderRadius: radius.sm,
              },
            ]}
          >
            <Text
              variant={active ? 'section' : 'rowTitle'}
              tone={active ? 'primary' : 'secondary'}
              style={styles.segmentLabel}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  selector: {
    paddingHorizontal: 13,
    paddingVertical: 9,
  },
  choice: {
    borderWidth: 1,
    paddingHorizontal: 13,
    paddingVertical: 9,
  },
  segmentTrack: {
    flexDirection: 'row',
    padding: 3,
  },
  segment: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    minHeight: 38,
  },
  segmentLabel: { fontSize: 12.5 },
});
