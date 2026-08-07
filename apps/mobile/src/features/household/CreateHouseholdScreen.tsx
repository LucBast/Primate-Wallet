/**
 * Tela 8a — Criação de família (screenshots/8a-criacao-familia.png).
 *
 * Blocos, na ordem do screenshot:
 *   1. Ícone de casa em brandSoft
 *   2. "Vamos criar sua família" + subtítulo
 *   3. Fields: Nome da família · Seu nome nesta família (com helper)
 *   4. Moeda | Fuso horário, lado a lado
 *   5. Card "Seu papel" com o chip Proprietário e o que ele pode fazer —
 *      informativo, porque o papel é derivado, não escolhido
 *   6. Banner infoSoft sobre moeda e fuso
 *   7. CTA "Criar família" + link "Tenho um convite para aceitar"
 */

import React, { useCallback, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Badge } from '../../components/Badge';
import { Banner } from '../../components/Banner';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Field } from '../../components/Field';
import { OptionSheet } from '../../components/OptionSheet';
import { SelectField } from '../../components/SelectField';
import { Text } from '../../design-system/Text';
import { useTheme } from '../../design-system/theme';
import { icons, iconSize } from '../../design-system/icons';
import { ApiRequestError } from '../../services/api-client';
import { useSessionStore } from '../auth/session-store';
import * as api from './household-api';
import { useHouseholdStore } from './household-store';
import { ROLE_LABEL } from './roles';

/** Moedas suportadas hoje. O rótulo é o do screenshot: "BRL · R$". */
const CURRENCIES = [{ value: 'BRL', label: 'BRL · R$' }] as const;

/**
 * Fusos do Brasil, com o nome curto que o screenshot mostra ("São Paulo").
 * O valor gravado é o identificador IANA, que é o que o servidor usa para
 * derivar "hoje" da família.
 */
const TIMEZONES = [
  { value: 'America/Sao_Paulo', label: 'São Paulo' },
  { value: 'America/Bahia', label: 'Bahia' },
  { value: 'America/Fortaleza', label: 'Fortaleza' },
  { value: 'America/Manaus', label: 'Manaus' },
  { value: 'America/Cuiaba', label: 'Cuiabá' },
  { value: 'America/Belem', label: 'Belém' },
  { value: 'America/Rio_Branco', label: 'Rio Branco' },
  { value: 'America/Noronha', label: 'Fernando de Noronha' },
] as const;

/** O que o proprietário pode fazer — copy verbatim do screenshot. */
const OWNER_ABILITIES = [
  'convidar, remover e definir papéis',
  'ver todas as contas e relatórios',
  'exportar dados e encerrar a família',
];

export function CreateHouseholdScreen({
  onCreated,
  onAcceptInvite,
}: {
  readonly onCreated: (householdId: string) => void;
  /** Quem chega por convite não pode ficar preso nesta tela (CLARIFICATIONS-02). */
  readonly onAcceptInvite?: (() => void) | undefined;
}): React.JSX.Element {
  const { colors, layout, radius, spacing } = useTheme();
  const insets = useSafeAreaInsets();
  const accessToken = useSessionStore((state) => state.accessToken);
  const profileName = useSessionStore((state) => state.profile?.displayName ?? '');
  const load = useHouseholdStore((state) => state.load);

  const [name, setName] = useState('');
  const [ownerDisplayName, setOwnerDisplayName] = useState(profileName);
  const [currency, setCurrency] = useState<string>('BRL');
  const [timezone, setTimezone] = useState<string>('America/Sao_Paulo');
  const [sheet, setSheet] = useState<'moeda' | 'fuso' | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = useCallback(async () => {
    if (!accessToken) return;
    setError(null);
    setCreating(true);
    try {
      const household = await api.createHousehold(accessToken, {
        name: name.trim(),
        currencyCode: currency,
        timezone,
        ownerDisplayName: ownerDisplayName.trim(),
      });
      await load(accessToken);
      onCreated(household.id);
    } catch (cause) {
      setError(cause instanceof ApiRequestError ? cause.message : 'Não foi possível criar agora.');
    } finally {
      setCreating(false);
    }
  }, [accessToken, currency, load, name, onCreated, ownerDisplayName, timezone]);

  const canSubmit = name.trim() !== '' && ownerDisplayName.trim() !== '' && !creating;
  const Casa = icons.inicio;

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
            paddingTop: insets.top + spacing.xxl,
            paddingBottom: insets.bottom + spacing.lg,
          },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[styles.icon, { backgroundColor: colors.brandSoft, borderRadius: radius.lg }]}
        >
          <Casa size={iconSize.action} color={colors.brand} />
        </View>

        <Text variant="pageTitle" style={styles.title}>
          Vamos criar sua família
        </Text>
        <Text variant="body" tone="secondary" style={styles.subtitle}>
          Contas, categorias e relatórios ficam dentro dela. Você pode convidar as outras pessoas
          depois.
        </Text>

        <View style={{ gap: spacing.md, marginTop: spacing.lg }}>
          <Field
            label="Nome da família"
            testID="campo-nome-familia"
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
            placeholder="Família Souza"
          />
          <View>
            <Field
              label="Seu nome nesta família"
              testID="campo-nome-membro"
              value={ownerDisplayName}
              onChangeText={setOwnerDisplayName}
              autoCapitalize="words"
            />
            <Text variant="rowMeta" tone="secondary" style={styles.helper}>
              é o nome que os outros membros veem
            </Text>
          </View>

          <View style={styles.row}>
            <View style={styles.half}>
              <SelectField
                testID="campo-moeda"
                label="Moeda"
                value={CURRENCIES.find((item) => item.value === currency)?.label ?? currency}
                onPress={() => setSheet('moeda')}
              />
            </View>
            <View style={styles.half}>
              <SelectField
                testID="campo-fuso"
                label="Fuso horário"
                value={TIMEZONES.find((item) => item.value === timezone)?.label ?? timezone}
                onPress={() => setSheet('fuso')}
              />
            </View>
          </View>
        </View>

        {/* Card informativo: o papel é derivado de quem cria, não escolhido. */}
        <View style={{ marginTop: spacing.md }}>
          <Card testID="card-papel">
            <View style={styles.roleHeader}>
              <Text variant="rowTitle">Seu papel</Text>
              {/* Selo de papel, não de estado: pílula sem ponto (Badge). */}
              <Badge label={ROLE_LABEL.OWNER} tone="brand" testID="selo-papel" />
            </View>
            <Text variant="rowMeta" tone="secondary" style={{ marginTop: spacing.sm }}>
              Quem cria a família vira Proprietário:
            </Text>
            {OWNER_ABILITIES.map((ability) => (
              <Text key={ability} variant="rowMeta" tone="secondary">
                {`✓ ${ability}`}
              </Text>
            ))}
          </Card>
        </View>

        <View style={{ marginTop: spacing.md }}>
          <Banner
            kind="info"
            testID="banner-familia"
            message="Moeda e fuso valem para toda a família e definem o fechamento do mês e o horário dos avisos. Dá para mudar depois em Configurações."
          />
        </View>

        {error === null ? null : (
          <View style={{ marginTop: spacing.md }}>
            <Banner kind="error" message={error} testID="erro-familia" />
          </View>
        )}

        <View style={styles.spacer} />

        <Button
          testID="criar-familia"
          label="Criar família"
          loading={creating}
          disabled={!canSubmit}
          onPress={handleCreate}
        />

        {onAcceptInvite === undefined ? null : (
          <Pressable
            testID="tenho-convite"
            accessibilityRole="button"
            accessibilityLabel="Tenho um convite para aceitar"
            hitSlop={10}
            onPress={onAcceptInvite}
            style={{ marginTop: spacing.md }}
          >
            <Text variant="rowTitle" tone="secondary" style={styles.centered}>
              Tenho um convite para aceitar
            </Text>
          </Pressable>
        )}
      </ScrollView>

      <OptionSheet
        visible={sheet === 'moeda'}
        title="Moeda"
        options={CURRENCIES.map((item) => ({ value: item.value, label: item.label }))}
        value={currency}
        onSelect={setCurrency}
        onClose={() => setSheet(null)}
      />
      <OptionSheet
        visible={sheet === 'fuso'}
        title="Fuso horário"
        options={TIMEZONES.map((item) => ({ value: item.value, label: item.label }))}
        value={timezone}
        onSelect={setTimezone}
        onClose={() => setSheet(null)}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { flexGrow: 1 },
  // Quadrado 48 com a casa, medido em 8a-criacao-familia.png.
  icon: { alignItems: 'center', height: 48, justifyContent: 'center', width: 48 },
  title: { marginTop: 16 },
  subtitle: { marginTop: 4 },
  helper: { marginLeft: 14, marginTop: 4 },
  row: { flexDirection: 'row', gap: 10 },
  half: { flex: 1 },
  roleHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  spacer: { flexGrow: 1, minHeight: 24 },
  centered: { textAlign: 'center' },
});
