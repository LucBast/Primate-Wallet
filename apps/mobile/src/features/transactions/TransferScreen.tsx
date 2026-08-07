/**
 * Tela 8e — Transferência entre contas (screenshots/8e-transferencia.png).
 *
 * Blocos, na ordem do screenshot:
 *   1. "VALOR" centralizado, NEUTRO — transferência não é receita nem despesa,
 *      então o valor nunca aparece em income nem em expense
 *   2. Card único De/Para, com o saldo atual de cada conta
 *   3. Membro | Data, lado a lado
 *   4. Observação · opcional
 *   5. Card de tarifa: toggle + valor (expense) e categoria
 *   6. Banner infoSoft nomeando a regra
 *   7. Prévia dos saldos depois
 *   8. CTA "Transferir R$ X"
 *
 * A tarifa é uma despesa SEPARADA: no extrato aparecem dois registros, não um
 * (design/CLARIFICATIONS-02 item 1).
 */

import React, { useCallback, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { familyToday, formatMoney, minor, parseMoney } from '@ff/domain';
import { Banner } from '../../components/Banner';
import { Button } from '../../components/Button';
import { Card, IconBadge } from '../../components/Card';
import { DateField } from '../../components/DateField';
import { Field } from '../../components/Field';
import { OptionSheet } from '../../components/OptionSheet';
import { ScreenHeader } from '../../components/ScreenHeader';
import { SelectField } from '../../components/SelectField';
import { Toggle } from '../../components/Toggle';
import { Text } from '../../design-system/Text';
import { useTheme } from '../../design-system/theme';
import { font } from '../../design-system/tokens';
import { icons, iconSize } from '../../design-system/icons';
import { ApiRequestError } from '../../services/api-client';
import { newIdempotencyKey } from '../../services/idempotency';
import { useSessionStore } from '../auth/session-store';
import { useActiveHousehold } from '../household/household-store';
import { useReferenceStore } from '../household/reference-store';
import * as api from './transaction-api';

type Sheet = 'origem' | 'destino' | 'membro' | 'categoria' | null;

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
  const { accounts, categories, members } = useReferenceStore();

  // Cartão não é origem nem destino de transferência: fatura tem tela própria.
  const transferable = useMemo(
    () => accounts.filter((account) => account.accountType !== 'CREDIT_CARD'),
    [accounts],
  );
  const expenseCategories = useMemo(
    () => categories.filter((category) => category.nature === 'EXPENSE'),
    [categories],
  );

  const today =
    household === null
      ? new Date().toISOString().slice(0, 10)
      : (familyToday(household.timezone) as string);

  const [amountMinor, setAmountMinor] = useState(0);
  const [notes, setNotes] = useState('');
  const [fromId, setFromId] = useState<string | null>(transferable[0]?.id ?? null);
  const [toId, setToId] = useState<string | null>(transferable[1]?.id ?? null);
  const [memberId, setMemberId] = useState<string | null>(members[0]?.id ?? null);
  const [occurredAt, setOccurredAt] = useState<string>(today);
  const [hasFee, setHasFee] = useState(false);
  const [feeText, setFeeText] = useState('');
  const [feeCategoryId, setFeeCategoryId] = useState<string | null>(null);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [idempotencyKey] = useState(() => newIdempotencyKey('transferencia'));

  const from = transferable.find((account) => account.id === fromId) ?? null;
  const to = transferable.find((account) => account.id === toId) ?? null;
  const feeMinor = hasFee && feeText !== '' ? parseMoney(feeText) : 0;

  const handleSave = useCallback(async () => {
    if (!accessToken || !household || fromId === null || toId === null || memberId === null) return;
    setError(null);
    setSaving(true);
    try {
      await api.createTransfer(accessToken, household.id, {
        description: 'Transferência',
        amountMinor,
        fromAccountId: fromId,
        toAccountId: toId,
        memberId,
        occurredAt,
        competenceDate: occurredAt,
        ...(notes.trim() === '' ? {} : { notes: notes.trim() }),
        ...(feeMinor > 0 ? { feeMinor } : {}),
        ...(feeMinor > 0 && feeCategoryId !== null ? { feeCategoryId } : {}),
        idempotencyKey,
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
    feeCategoryId,
    feeMinor,
    fromId,
    household,
    idempotencyKey,
    memberId,
    notes,
    occurredAt,
    onSaved,
    toId,
  ]);

  const canSubmit =
    amountMinor > 0 && fromId !== null && toId !== null && fromId !== toId && !saving;

  const Sobe = icons.receita;
  const Desce = icons.despesa;

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: colors.surface }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScreenHeader title="Transferência" onBack={onBack} size="screen" />

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingHorizontal: layout.screenPaddingH, paddingBottom: spacing.xxxl },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        {/* O valor é NEUTRO: nunca income, nunca expense. */}
        <View style={styles.amount}>
          <Text variant="label" tone="secondary">
            Valor
          </Text>
          {/* O número grande É o campo, como no screenshot — sem card e sem
              borda brand: transferência não é receita nem despesa. */}
          <TextInput
            testID="campo-valor"
            accessibilityLabel="Valor da transferência"
            value={formatMoney(minor(amountMinor))}
            onChangeText={(text) => {
              const digits = text.replace(/\D/g, '').slice(0, 15);
              setAmountMinor(digits === '' ? 0 : Number.parseInt(digits, 10));
            }}
            keyboardType="number-pad"
            cursorColor={colors.brand}
            selectionColor={colors.brand}
            style={[styles.amountText, { color: colors.textPrimary }]}
          />
        </View>

        {/* Par De/Para num card único, com os saldos atuais. */}
        <View style={{ marginTop: spacing.md }}>
          <Card padded={false} testID="card-contas">
            <View style={styles.accountRow}>
              <IconBadge background={colors.infoSoft}>
                <Sobe size={iconSize.row} color={colors.info} />
              </IconBadge>
              <View style={styles.accountTexts}>
                <Text variant="label" tone="secondary">
                  De
                </Text>
                <Text
                  testID="campo-origem"
                  variant="rowTitle"
                  onPress={() => setSheet('origem')}
                  suppressHighlighting
                >
                  {from === null
                    ? 'Escolher ▾'
                    : `${[from.name, from.primaryMemberName].filter(Boolean).join(' · ')} ▾`}
                </Text>
              </View>
              <Text variant="rowMeta" tone="secondary">
                {from === null ? '' : formatMoney(minor(from.balanceMinor))}
              </Text>
            </View>

            <View
              style={[styles.accountRow, { borderTopColor: colors.divider, borderTopWidth: 1 }]}
            >
              <IconBadge background={colors.incomeSoft}>
                <Desce size={iconSize.row} color={colors.income} />
              </IconBadge>
              <View style={styles.accountTexts}>
                <Text variant="label" tone="secondary">
                  Para
                </Text>
                <Text
                  testID="campo-destino"
                  variant="rowTitle"
                  onPress={() => setSheet('destino')}
                  suppressHighlighting
                >
                  {to === null
                    ? 'Escolher ▾'
                    : `${[to.name, to.primaryMemberName].filter(Boolean).join(' · ')} ▾`}
                </Text>
              </View>
              <Text variant="rowMeta" tone="secondary">
                {to === null ? '' : formatMoney(minor(to.balanceMinor))}
              </Text>
            </View>
          </Card>
        </View>

        <View style={[styles.row, { marginTop: spacing.md }]}>
          <View style={styles.half}>
            <SelectField
              testID="campo-membro"
              label="Membro"
              value={members.find((item) => item.id === memberId)?.displayName ?? 'Escolher'}
              placeholder={memberId === null}
              onPress={() => setSheet('membro')}
            />
          </View>
          <View style={styles.half}>
            <DateField
              testID="campo-data"
              label="Data"
              value={occurredAt}
              onChange={setOccurredAt}
              today={today}
            />
          </View>
        </View>

        <View style={{ marginTop: spacing.md }}>
          <Field
            label="Observação · opcional"
            testID="campo-observacao"
            value={notes}
            onChangeText={setNotes}
            placeholder="Reserva de emergência de agosto"
          />
        </View>

        <View style={{ marginTop: spacing.md }}>
          <Card testID="card-tarifa">
            <View style={styles.feeHeader}>
              <View style={styles.accountTexts}>
                <Text variant="rowTitle">Houve tarifa bancária</Text>
                <Text variant="rowMeta" tone="secondary">
                  cobrada da conta de origem
                </Text>
              </View>
              <Toggle
                testID="toggle-tarifa"
                value={hasFee}
                onValueChange={setHasFee}
                accessibilityLabel="Houve tarifa bancária"
              />
            </View>

            {hasFee ? (
              <View style={[styles.row, { marginTop: spacing.md }]}>
                <View style={styles.half}>
                  <Field
                    label="Valor da tarifa"
                    testID="campo-tarifa"
                    value={feeText}
                    onChangeText={setFeeText}
                    keyboardType="decimal-pad"
                    placeholder="R$ 3,50"
                  />
                </View>
                <View style={styles.half}>
                  <SelectField
                    testID="campo-categoria-tarifa"
                    label="Categoria da tarifa"
                    value={
                      expenseCategories.find((item) => item.id === feeCategoryId)?.name ??
                      'Escolher'
                    }
                    placeholder={feeCategoryId === null}
                    onPress={() => setSheet('categoria')}
                  />
                </View>
              </View>
            ) : null}
          </Card>
        </View>

        <View style={{ marginTop: spacing.md }}>
          <Banner
            kind="info"
            testID="banner-transferencia"
            message={`A transferência não é receita nem despesa: o dinheiro só muda de conta e não entra em nenhum relatório de categoria.${
              feeMinor > 0
                ? ` A tarifa, sim, é lançada como uma despesa separada de ${formatMoney(minor(feeMinor))}.`
                : ''
            }`}
          />
        </View>

        {/* Prévia dos saldos depois — a conta de origem paga também a tarifa. */}
        {from === null || to === null || amountMinor === 0 ? null : (
          <View style={{ marginTop: spacing.md }}>
            <Card testID="card-previa">
              <View style={styles.previewRow}>
                <Text variant="rowMeta" tone="secondary">{`${from.name} depois`}</Text>
                <Text variant="moneyRow">
                  {formatMoney(minor(from.balanceMinor - amountMinor - feeMinor))}
                </Text>
              </View>
              <View style={styles.previewRow}>
                <Text variant="rowMeta" tone="secondary">{`${to.name} depois`}</Text>
                <Text variant="moneyRow">{formatMoney(minor(to.balanceMinor + amountMinor))}</Text>
              </View>
            </Card>
          </View>
        )}

        {error === null ? null : (
          <View style={{ marginTop: spacing.md }}>
            <Banner kind="error" message={error} testID="erro-transferencia" />
          </View>
        )}
      </ScrollView>

      <OptionSheet
        visible={sheet === 'origem'}
        title="De"
        options={transferable.map((item) => ({
          value: item.id,
          label: item.name,
          meta: formatMoney(minor(item.balanceMinor)),
        }))}
        value={fromId}
        onSelect={setFromId}
        onClose={() => setSheet(null)}
      />
      <OptionSheet
        visible={sheet === 'destino'}
        title="Para"
        options={transferable
          .filter((item) => item.id !== fromId)
          .map((item) => ({
            value: item.id,
            label: item.name,
            meta: formatMoney(minor(item.balanceMinor)),
          }))}
        value={toId}
        onSelect={setToId}
        onClose={() => setSheet(null)}
      />
      <OptionSheet
        visible={sheet === 'membro'}
        title="Membro"
        options={members.map((item) => ({ value: item.id, label: item.displayName }))}
        value={memberId}
        onSelect={setMemberId}
        onClose={() => setSheet(null)}
      />
      <OptionSheet
        visible={sheet === 'categoria'}
        title="Categoria da tarifa"
        options={expenseCategories.map((item) => ({ value: item.id, label: item.name }))}
        value={feeCategoryId}
        onSelect={setFeeCategoryId}
        onClose={() => setSheet(null)}
      />

      <View
        style={[
          styles.footer,
          {
            backgroundColor: colors.surface,
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
  amount: { alignItems: 'center', gap: 2 },
  // COMPONENT-SPECS §MoneyInput: 44 no valor em destaque; lineHeight obrigatório.
  amountText: {
    fontFamily: font.extrabold,
    fontSize: 32,
    fontVariant: ['tabular-nums'],
    lineHeight: 40,
  },
  accountRow: { alignItems: 'center', flexDirection: 'row', gap: 12, paddingVertical: 11 },
  accountTexts: { flex: 1, gap: 2 },
  row: { flexDirection: 'row', gap: 10 },
  half: { flex: 1 },
  feeHeader: { alignItems: 'center', flexDirection: 'row', gap: 12 },
  previewRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
  },
  footer: { paddingTop: 12 },
});
