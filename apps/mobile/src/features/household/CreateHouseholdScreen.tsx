/**
 * Criação de família — primeira tela de quem entra sem convite.
 *
 * Sem screenshot dedicado (SCREEN-SPECS §"Telas sem screenshot"): usa os mesmos
 * componentes e espaçamentos das demais telas de formulário, sem introduzir
 * nenhum padrão visual novo.
 */

import React, { useCallback, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Banner } from '../../components/Banner';
import { Button } from '../../components/Button';
import { Field } from '../../components/Field';
import { Text } from '../../design-system/Text';
import { useTheme } from '../../design-system/theme';
import { ApiRequestError } from '../../services/api-client';
import { useSessionStore } from '../auth/session-store';
import * as api from './household-api';
import { useHouseholdStore } from './household-store';

export function CreateHouseholdScreen({
  onCreated,
}: {
  readonly onCreated: (householdId: string) => void;
}): React.JSX.Element {
  const { colors, layout, spacing } = useTheme();
  const insets = useSafeAreaInsets();
  const accessToken = useSessionStore((state) => state.accessToken);
  const profileName = useSessionStore((state) => state.profile?.displayName ?? '');
  const load = useHouseholdStore((state) => state.load);

  const [name, setName] = useState('');
  const [ownerDisplayName, setOwnerDisplayName] = useState(profileName);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = useCallback(async () => {
    if (!accessToken) return;
    setError(null);
    setCreating(true);
    try {
      const household = await api.createHousehold(accessToken, {
        name: name.trim(),
        currencyCode: 'BRL',
        timezone: 'America/Sao_Paulo',
        ownerDisplayName: ownerDisplayName.trim(),
      });
      await load(accessToken);
      onCreated(household.id);
    } catch (cause) {
      setError(cause instanceof ApiRequestError ? cause.message : 'Não foi possível criar agora.');
    } finally {
      setCreating(false);
    }
  }, [accessToken, load, name, onCreated, ownerDisplayName]);

  const canSubmit = name.trim() !== '' && ownerDisplayName.trim() !== '' && !creating;

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: colors.surface }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingHorizontal: layout.screenPaddingH,
            paddingTop: insets.top + spacing.xxxl,
            paddingBottom: insets.bottom + spacing.lg,
          },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <Text variant="pageTitle">Criar sua família</Text>
        <Text variant="body" tone="secondary" style={styles.subtitle}>
          A família é onde ficam as contas, os lançamentos e os relatórios compartilhados.
        </Text>

        <View style={{ gap: spacing.md, marginTop: spacing.xl }}>
          <Field
            label="Nome da família"
            testID="campo-nome-familia"
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
            placeholder="Família Souza"
          />
          <Field
            label="Como você aparece na família"
            testID="campo-nome-membro"
            value={ownerDisplayName}
            onChangeText={setOwnerDisplayName}
            autoCapitalize="words"
          />
        </View>

        <View style={{ marginTop: spacing.md }}>
          <Banner
            kind="info"
            testID="banner-familia"
            message="Você entra como proprietário e pode convidar quem quiser depois. Moeda BRL e fuso America/Sao_Paulo podem ser alterados nas configurações da família."
          />
        </View>

        {error === null ? null : (
          <View style={{ marginTop: spacing.md }}>
            <Banner kind="error" message={error} testID="erro-familia" />
          </View>
        )}

        <View style={{ marginTop: spacing.lg }}>
          <Button
            testID="criar-familia"
            label="Criar família"
            loading={creating}
            disabled={!canSubmit}
            onPress={handleCreate}
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { flexGrow: 1 },
  subtitle: { marginTop: 4 },
});
