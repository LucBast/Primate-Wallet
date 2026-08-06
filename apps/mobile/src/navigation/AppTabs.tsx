/**
 * Abas do app.
 *
 * A tab bar padrão do React Navigation NÃO é usada (docs/01 §Mobile): o design
 * exige 5 posições com botão central elevado, então a barra é o componente
 * `BottomNav` e a troca de aba é estado local — o mesmo recorte visual do
 * screenshot 1b.
 */

import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { BottomNav, type NavItemKey } from '../components/BottomNav';
import { useTheme } from '../design-system/theme';
import { HomeScreen } from '../features/home/HomeScreen';
import { PlanningScreen } from '../features/planning/PlanningScreen';
import { TransactionsScreen } from '../features/transactions/TransactionsScreen';
import { MoreScreen } from '../features/more/MoreScreen';

const SCREENS: Record<NavItemKey, () => React.JSX.Element> = {
  inicio: HomeScreen,
  planejamento: PlanningScreen,
  movimentacoes: TransactionsScreen,
  mais: MoreScreen,
};

export type AppTabsProps = {
  readonly onQuickEntry: () => void;
};

export function AppTabs({ onQuickEntry }: AppTabsProps): React.JSX.Element {
  const { colors } = useTheme();
  const [active, setActive] = useState<NavItemKey>('inicio');
  const Screen = SCREENS[active];

  return (
    <View style={[styles.container, { backgroundColor: colors.surface }]}>
      <View style={styles.content}>
        <Screen />
      </View>
      <BottomNav active={active} onSelect={setActive} onAdd={onQuickEntry} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1 },
});
