/**
 * Transferência entre contas (SCREEN-SPECS §"Telas sem screenshot").
 *
 * A tela deixa explícito o que a regra manda: transferência NÃO é receita nem
 * despesa. A tarifa, quando existe, é lançada como despesa separada.
 */

import React, { useCallback, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatMoney, minor } from '@ff/domain';
import { Banner } from '../../components/Banner';
import { Button } from '../../components/Button';
import { Card, SectionLabel } from '../../components/Card';
import { ChoiceChip } from '../../components/Chip';
import { Field } from '../../components/Field';
import { MoneyInput } from '../../components/MoneyInput';
import { ScreenHeader } from '../../components/ScreenHeader';
import { Text } from '../../design-system/Text';
import { useTheme } from '../../design-system/theme';
import { ApiRequestError } from '../../services/api-client';
import { newIdempotencyKey } from '../../services/idempotency';
import { useSessionStore } from '../auth/session-store';
import { useActiveHousehold } from '../household/household-store';
import { useReferenceStore } from '../household/reference-store';
import * as api from './transaction-api';

export function TransferScreen({
  onBack,
  onSaved,
}: {
  readonly onBack: () => void;
  readonly onSaved: () => void;
}): React.JSX.Element {
  const { colors, layout, spacing } = useTheme();
  const insets = useSafeAreaInsets();
  const accessToken = useSessionStore((state) => state.accessToken);
  const household = useActiveHousehold();
  const { accounts, members } = useReferenceStore();

  // Cartão não é origem nem destino de transferência: fatura tem tela própria.
  const transferable = useMemo(
    () => accounts.filter((account) => account.accountType !== 'CREDIT_CARD'),
    [accounts],
  );

  const [amountMinor, setAmountMinor] = useState(0);
  const [description, setDescription] = useState('');
  const [fromId, setFromId] = useState<string | null>(transferable[0]?.id ?? null);
  const [toId, setToId] = useState<string | null>(transferable[1]?.id ?? null);
  const [memberId, setMemberId] = useState<string | null>(members[0]?.id ?? null);
  const [feeText, setFeeText] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [idempotencyKey] = useState(() => newIdempotencyKey('transferencia'));

  const handleSave = useCallback(async () => {
    if (!accessToken || !household || fromId === null || toId === null || memberId === null) return;
    setError(null);
    setSaving(true);
    try {
      const feeDigits = feeText.replace(/\D/g, '');
      await api.createTransfer(accessToken, household.id, {
        description: description.trim() === '' ? 'Transferência' : description.trim(),
        amountMinor,
        fromAccountId: fromId,
        toAccountId: toId,
        memberId,
        idempotencyKey,
        ...(feeDigits === '' || Number(feeDigits) === 0
          ? {}
          : { feeMinor: Number.parseInt(feeDigits, 10) }),
      });
      onSaved();
    } catch (cause) {
      setError(
        cause instanceof ApiRequestError ? cause.message : 'Não foi possível transferir agora.',
      );
    } finally {
      setSaving(false);
    }
  }, [
    accessToken,
    amountMinor,
    description,
    feeText,
    fromId,
    household,
    idempotencyKey,
    memberId,
    onSaved,
    toId,
  ]);

  const canSubmit =
    amountMinor > 0 && fromId !== null && toId !== null && fromId !== toId && !saving;

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: colors.surface }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScreenHeader title="Transferir" onBack={onBack} size="screen" />

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingHorizontal: layout.screenPaddingH, paddingBottom: spacing.xxxl },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <MoneyInput
          label="VALOR"
          testID="campo-valor"
          valueMinor={amountMinor}
          onChangeMinor={setAmountMinor}
          size={44}
          autoFocus
        />

        <View style={{ marginTop: spacing.xl }}>
          <SectionLabel>DE</SectionLabel>
          <View style={styles.chips}>
            {transferable.map((account) => (
              <ChoiceChip
                key={account.id}
                testID={`origem-${account.id}`}
                label={`${account.name} · ${formatMoney(minor(account.balanceMinor))}`}
                selected={fromId === account.id}
                onPress={() => setFromId(account.id)}
              />
            ))}
          </View>
        </View>

        <View style={{ marginTop: spacing.xl }}>
          <SectionLabel>PARA</SectionLabel>
          <View style={styles.chips}>
            {transferable
              .filter((account) => account.id !== fromId)
              .map((account) => (
                <ChoiceChip
                  key={account.id}
                  testID={`destino-${account.id}`}
                  label={account.name}
                  selected={toId === account.id}
                  onPress={() => setToId(account.id)}
                />
              ))}
          </View>
        </View>

        {members.length === 0 ? null : (
          <View style={{ marginTop: spacing.xl }}>
            <SectionLabel>MEMBRO</SectionLabel>
            <View style={styles.chips}>
              {members.map((member) => (
                <ChoiceChip
                  key={member.id}
                  testID={`membro-${member.id}`}
                  label={member.displayName}
                  selected={memberId === member.id}
                  onPress={() => setMemberId(member.id)}
                />
              ))}
            </View>
          </View>
        )}

        <View style={{ gap: spacing.md, marginTop: spacing.xl }}>
          <Field
            label="Descrição"
            testID="campo-descricao"
            value={description}
            onChangeText={setDescription}
            placeholder="Reserva do mês"
          />
          <Field
            label="Tarifa (opcional)"
            testID="campo-tarifa"
            value={feeText}
            onChangeText={setFeeText}
            keyboardType="decimal-pad"
            placeholder="10,50"
          />
        </View>

        <View style={{ marginTop: spacing.md }}>
          <Banner
            kind="info"
            testID="banner-transferencia"
            message="Transferência move saldo entre contas: não é receita nem despesa e não entra nos relatórios por categoria. A tarifa, se houver, é lançada como despesa separada."
          />
        </View>

        {fromId !== null && toId !== null ? (
          <View style={{ marginTop: spacing.md }}>
            <Card testID="card-previa">
              <Text variant="rowMeta" tone="secondary">
                Depois da transferência
              </Text>
              {transferable
                .filter((account) => account.id === fromId || account.id === toId)
                .map((account) => {
                  const delta = account.id === fromId ? -amountMinor : amountMinor;
                  return (
                    <View key={account.id} style={styles.previewRow}>
                      <Text variant="rowTitle">{account.name}</Text>
                      <Text variant="moneyRow" tone={delta < 0 ? 'expense' : 'income'}>
                        {formatMoney(minor(account.balanceMinor + delta))}
                      </Text>
                    </View>
                  );
                })}
            </Card>
          </View>
        ) : null}

        {error === null ? null : (
          <View style={{ marginTop: spacing.md }}>
            <Banner kind="error" message={error} testID="erro-transferencia" />
          </View>
        )}
      </ScrollView>

      <View
        style={[
          styles.footer,
          {
            backgroundColor: colors.surface,
            borderTopColor: colors.border,
            paddingBottom: Math.max(spacing.lg, insets.bottom),
            paddingHorizontal: layout.screenPaddingH,
          },
        ]}
      >
        <Button
          testID="confirmar-transferencia"
          label={`Transferir ${formatMoney(minor(amountMinor))}`}
          loading={saving}
          disabled={!canSubmit}
          onPress={handleSave}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingTop: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  previewRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  footer: { borderTopWidth: 1, paddingTop: 12 },
});
