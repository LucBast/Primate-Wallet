/**
 * Abas do app.
 *
 * A tab bar padrão do React Navigation NÃO é usada (docs/01 §Mobile): o design
 * exige 5 posições com botão central elevado, então a barra é o componente
 * `BottomNav` e a troca de aba é estado local — o mesmo recorte do screenshot 1b.
 */

import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { BottomNav, type NavItemKey } from '../components/BottomNav';
import { useTheme } from '../design-system/theme';
import { HomeScreen } from '../features/home/HomeScreen';
import { PlanningScreen } from '../features/planning/PlanningScreen';
import type { PlannedEntry, PlannedEntryNature } from '@ff/api-contracts';
import { TransactionsScreen } from '../features/transactions/TransactionsScreen';
import { MoreScreen } from '../features/more/MoreScreen';

export type AppTabsProps = {
  readonly onQuickEntry: () => void;
  readonly onNewPlannedEntry: (nature: PlannedEntryNature) => void;
  readonly onSettleEntry: (entry: PlannedEntry) => void;
  readonly onOpenPlannedEntry: (entry: PlannedEntry) => void;
  readonly onNavigate: (
    destination:
      | 'Familia'
      | 'Contas'
      | 'Categorias'
      | 'Relatorios'
      | 'Sessoes'
      | 'Configuracoes'
      | 'Planejamento'
      | 'Movimentacoes',
  ) => void;
};

export function AppTabs({
  onQuickEntry,
  onNavigate,
  onNewPlannedEntry,
  onSettleEntry,
  onOpenPlannedEntry,
}: AppTabsProps): React.JSX.Element {
  const { colors } = useTheme();
  const [active, setActive] = useState<NavItemKey>('inicio');

  const screens: Record<NavItemKey, React.JSX.Element> = {
    inicio: <HomeScreen />,
    planejamento: (
      <PlanningScreen
        onNewEntry={onNewPlannedEntry}
        onSettle={onSettleEntry}
        onOpenEntry={onOpenPlannedEntry}
      />
    ),
    movimentacoes: <TransactionsScreen />,
    mais: (
      <MoreScreen
        onOpenFamily={() => onNavigate('Familia')}
        onOpenAccounts={() => onNavigate('Contas')}
        onOpenCategories={() => onNavigate('Categorias')}
        onOpenReports={() => onNavigate('Relatorios')}
        onOpenSessions={() => onNavigate('Sessoes')}
        onOpenSettings={() => onNavigate('Configuracoes')}
      />
    ),
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.surface }]}>
      <View style={styles.content}>{screens[active]}</View>
      <BottomNav active={active} onSelect={setActive} onAdd={onQuickEntry} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1 },
});
