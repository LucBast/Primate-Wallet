/**
 * Aba "Mais" — porta de entrada para família, contas, relatórios e ajustes.
 *
 * Sem screenshot dedicado; usa Card + ListRow, os mesmos da tela 3a. Cada
 * destino leva à sua tela, e não há linha sem implementação: itens de fases
 * futuras só aparecem quando a fase os entrega.
 */

import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Card, ListRow, SectionLabel } from '../../components/Card';
import { ScreenHeader } from '../../components/ScreenHeader';
import { Text } from '../../design-system/Text';
import { useTheme } from '../../design-system/theme';
import { useSessionStore } from '../auth/session-store';
import { useActiveHousehold } from '../household/household-store';

export type MoreScreenProps = {
  readonly onOpenFamily: () => void;
  readonly onOpenAccounts: () => void;
  readonly onOpenCategories: () => void;
  readonly onOpenReports: () => void;
  readonly onOpenSessions: () => void;
  readonly onOpenSettings: () => void;
};

export function MoreScreen(props: MoreScreenProps): React.JSX.Element {
  const { colors, layout, spacing } = useTheme();
  const household = useActiveHousehold();
  const profile = useSessionStore((state) => state.profile);
  const signOut = useSessionStore((state) => state.signOut);

  return (
    <View style={[styles.flex, { backgroundColor: colors.surface }]}>
      <ScreenHeader title="Mais" subtitle={household === null ? undefined : household.name} />

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingHorizontal: layout.screenPaddingH, paddingBottom: spacing.xxxl },
        ]}
      >
        <SectionLabel>FAMÍLIA</SectionLabel>
        <Card padded={false}>
          <ListRow
            first
            title="Membros e permissões"
            onPress={props.onOpenFamily}
            showChevron
            testID="mais-familia"
          />
          <ListRow
            title="Contas e cartões"
            onPress={props.onOpenAccounts}
            showChevron
            testID="mais-contas"
          />
          <ListRow
            title="Categorias"
            onPress={props.onOpenCategories}
            showChevron
            testID="mais-categorias"
          />
          <ListRow
            title="Relatórios"
            onPress={props.onOpenReports}
            showChevron
            testID="mais-relatorios"
          />
        </Card>

        <View style={{ marginTop: spacing.xl }}>
          <SectionLabel>CONTA</SectionLabel>
          <Card padded={false}>
            <ListRow
              first
              title={profile?.displayName ?? 'Meu perfil'}
              meta={profile?.email ?? undefined}
              testID="mais-perfil"
            />
            <ListRow
              title="Dispositivos e sessões"
              onPress={props.onOpenSessions}
              showChevron
              testID="mais-sessoes"
            />
            <ListRow
              title="Aparência, notificações e privacidade"
              onPress={props.onOpenSettings}
              showChevron
              testID="mais-configuracoes"
            />
            <ListRow
              title="Sair"
              onPress={() => void signOut()}
              testID="mais-sair"
              right={
                <Text variant="rowMeta" tone="danger">
                  Encerrar sessão
                </Text>
              }
            />
          </Card>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingTop: 4 },
});
