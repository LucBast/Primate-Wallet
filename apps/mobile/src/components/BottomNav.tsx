/**
 * BottomNav (design/COMPONENT-SPECS.md §BottomNav, CLAUDE.md item 7).
 *
 * Valores exatos da especificação:
 * - Fundo surfaceElevated, borda superior 1, padding 8 6 20.
 * - 5 posições: 4 itens (ícone 17 + label 10; ativo brand ExtraBold, inativo
 *   textSecondary Bold) + botão central circular 54, brand, "+" branco 26,
 *   margin-top −26, sombra 0 6 14 rgba(20,110,100,0.35).
 *
 * A sombra colorida do botão central é o único ponto do app com sombra em cor,
 * e vem do token brand com opacidade 0.35 (ver spec-values.ts).
 */

import React from 'react';
import { Platform, Pressable, StyleSheet, Text as RNText, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../design-system/theme';
import { icons, iconSize } from '../design-system/icons';
import {
  navAddGlyphSize,
  navAddOffset,
  navAddShadow,
  navLabel,
} from '../design-system/spec-values';

export type NavItemKey = 'inicio' | 'planejamento' | 'movimentacoes' | 'mais';

export type BottomNavProps = {
  readonly active: NavItemKey;
  readonly onSelect: (key: NavItemKey) => void;
  readonly onAdd: () => void;
};

const ITEMS: ReadonlyArray<{ key: NavItemKey; label: string }> = [
  { key: 'inicio', label: 'Início' },
  { key: 'planejamento', label: 'Planejamento' },
  { key: 'movimentacoes', label: 'Movimentações' },
  { key: 'mais', label: 'Mais' },
];

export function BottomNav({ active, onSelect, onAdd }: BottomNavProps): React.JSX.Element {
  const { colors, layout, radius } = useTheme();
  const insets = useSafeAreaInsets();

  const left = ITEMS.slice(0, 2);
  const right = ITEMS.slice(2);

  const renderItem = (item: { key: NavItemKey; label: string }): React.JSX.Element => {
    const isActive = item.key === active;
    const Icon = icons[item.key];
    return (
      <Pressable
        key={item.key}
        testID={`nav-${item.key}`}
        accessibilityRole="tab"
        accessibilityLabel={item.label}
        accessibilityState={{ selected: isActive }}
        onPress={() => onSelect(item.key)}
        style={styles.item}
      >
        <Icon
          size={iconSize.nav}
          color={isActive ? colors.brand : colors.textSecondary}
          strokeWidth={2}
        />
        <RNText
          numberOfLines={1}
          style={[
            isActive ? navLabel.active : navLabel.inactive,
            { color: isActive ? colors.brand : colors.textSecondary },
          ]}
        >
          {item.label}
        </RNText>
      </Pressable>
    );
  };

  const AddIcon = icons.adicionar;

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.surfaceElevated,
          borderTopColor: colors.border,
          // Padding inferior 20 da especificação, respeitando o safe area.
          paddingBottom: Math.max(20, insets.bottom),
        },
      ]}
    >
      {left.map(renderItem)}

      <View style={styles.centerSlot}>
        <Pressable
          testID="nav-adicionar"
          accessibilityRole="button"
          accessibilityLabel="Novo lançamento"
          accessibilityHint="Abre o lançamento rápido"
          onPress={onAdd}
          style={[
            styles.addButton,
            {
              backgroundColor: colors.brand,
              borderRadius: radius.pill,
              height: layout.navCenterButton,
              width: layout.navCenterButton,
              shadowColor: colors.brand,
            },
            Platform.OS === 'ios'
              ? {
                  shadowOffset: navAddShadow.offset,
                  shadowOpacity: navAddShadow.opacity,
                  shadowRadius: navAddShadow.radius,
                }
              : { elevation: navAddShadow.androidElevation },
          ]}
        >
          <AddIcon size={navAddGlyphSize} color={colors.surfaceElevated} strokeWidth={2.5} />
        </Pressable>
      </View>

      {right.map(renderItem)}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'flex-start',
    borderTopWidth: 1,
    flexDirection: 'row',
    paddingHorizontal: 6,
    paddingTop: 8,
  },
  item: {
    alignItems: 'center',
    flex: 1,
    gap: 3,
    justifyContent: 'center',
    minHeight: 44,
  },
  centerSlot: {
    alignItems: 'center',
    flex: 1,
  },
  addButton: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: navAddOffset,
  },
});
