/**
 * Folha de escolha de um valor entre poucos — o que abre ao tocar num
 * `SelectField`.
 *
 * Não é um componente do design: é o BottomSheet do COMPONENT-SPECS com uma
 * lista de `ListRow`, marcando a opção atual com ✓ como fazem os chips de
 * seleção (§ChoiceChip). Nenhuma medida nova.
 */

import React from 'react';
import { View } from 'react-native';
import { BottomSheet } from './BottomSheet';
import { Card, ListRow } from './Card';
import { Text } from '../design-system/Text';
import { useTheme } from '../design-system/theme';

export type OptionSheetItem = {
  readonly value: string;
  readonly label: string;
  readonly meta?: string | undefined;
};

export type OptionSheetProps = {
  readonly visible: boolean;
  readonly title: string;
  readonly options: readonly OptionSheetItem[];
  readonly value: string | null;
  readonly onSelect: (value: string) => void;
  readonly onClose: () => void;
  readonly testID?: string | undefined;
};

export function OptionSheet({
  visible,
  title,
  options,
  value,
  onSelect,
  onClose,
  testID,
}: OptionSheetProps): React.JSX.Element {
  const { spacing } = useTheme();

  return (
    <BottomSheet visible={visible} onClose={onClose} title={title} testID={testID}>
      <Card padded={false}>
        {options.map((option, index) => (
          <ListRow
            key={option.value}
            first={index === 0}
            testID={`opcao-${option.value}`}
            title={option.label}
            meta={option.meta}
            onPress={() => {
              onSelect(option.value);
              onClose();
            }}
            right={
              option.value === value ? (
                <Text variant="rowTitle" tone="brand">
                  ✓
                </Text>
              ) : undefined
            }
          />
        ))}
      </Card>
      <View style={{ height: spacing.md }} />
    </BottomSheet>
  );
}
