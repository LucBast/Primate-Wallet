/**
 * Nova conta a pagar / a receber.
 *
 * Sem screenshot dedicado (SCREEN-SPECS §"Telas sem screenshot"): usa
 * MoneyInput, Field, ChoiceChip e Banner, exatamente como as demais telas de
 * formulário. Cobre parcelamento e recorrência, com prévia calculada pelo
 * MESMO código do domínio que o servidor usa.
 */

import React, { useCallback, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Account, Category, Member, PlannedEntryNature } from '@ff/api-contracts';
import {
  addMonths,
  describeRecurrence,
  formatDate,
  formatMoney,
  generateOccurrences,
  isoDate,
  minor,
  splitInstallments,
} from '@ff/domain';
import { Banner } from '../../components/Banner';
import { Button } from '../../components/Button';
import { Card, SectionLabel } from '../../components/Card';
import { ChoiceChip, SegmentedControl } from '../../components/Chip';
import { Field } from '../../components/Field';
import { MoneyInput } from '../../components/MoneyInput';
import { ScreenHeader } from '../../components/ScreenHeader';
import { Text } from '../../design-system/Text';
import { useTheme } from '../../design-system/theme';
import { ApiRequestError } from '../../services/api-client';
import { newIdempotencyKey } from '../../services/idempotency';
import { useSessionStore } from '../auth/session-store';
import { useActiveHousehold } from '../household/household-store';
import * as api from './planning-api';

type Repeat = 'NONE' | 'INSTALLMENTS' | 'RECURRING';

export type PlannedEntryFormScreenProps = {
  readonly nature: PlannedEntryNature;
  readonly accounts: readonly Account[];
  readonly categories: readonly Category[];
  readonly members: readonly Member[];
  readonly onBack: () => void;
  readonly onSaved: () => void;
};

/** "AAAA-MM-DD" de hoje, para pré-preencher competência e vencimento. */
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function PlannedEntryFormScreen({
  nature,
  accounts,
  categories,
  members,
  onBack,
  onSaved,
}: PlannedEntryFormScreenProps): React.JSX.Element {
  const { colors, layout, spacing } = useTheme();
  const insets = useSafeAreaInsets();
  const accessToken = useSessionStore((state) => state.accessToken);
  const household = useActiveHousehold();

  const [amountMinor, setAmountMinor] = useState(0);
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState(todayIso());
  const [competenceDate, setCompetenceDate] = useState(todayIso());
  const [accountId, setAccountId] = useState<string | null>(accounts[0]?.id ?? null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [memberId, setMemberId] = useState<string | null>(members[0]?.id ?? null);
  const [counterparty, setCounterparty] = useState('');
  const [reminderDays, setReminderDays] = useState('3');
  const [repeat, setRepeat] = useState<Repeat>('NONE');
  const [installments, setInstallments] = useState(3);
  const [occurrences, setOccurrences] = useState(12);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [idempotencyKey] = useState(newIdempotencyKey);

  const relevantCategories = useMemo(
    () =>
      categories.filter(
        (category) => category.nature === (nature === 'PAYABLE' ? 'EXPENSE' : 'INCOME'),
      ),
    [categories, nature],
  );

  /** Prévia calculada com o mesmo código do domínio usado no servidor. */
  const preview = useMemo(() => {
    if (repeat === 'INSTALLMENTS' && amountMinor > 0) {
      const parts = splitInstallments(minor(amountMinor), installments);
      return parts.map((part, index) => ({
        label: `${String(index + 1).padStart(2, '0')}/${String(installments).padStart(2, '0')}`,
        date: addMonths(isoDate(dueDate), index) as string,
        amountMinor: part as number,
      }));
    }
    if (repeat === 'RECURRING' && amountMinor > 0) {
      return generateOccurrences(
        { frequency: 'MONTHLY', interval: 1, startDate: isoDate(dueDate) },
        Math.min(occurrences, 6),
      ).map((date, index) => ({
        label: `${index + 1}ª`,
        date: date as string,
        amountMinor,
      }));
    }
    return [];
  }, [amountMinor, dueDate, installments, occurrences, repeat]);

  const handleSave = useCallback(async () => {
    if (!accessToken || !household || memberId === null) return;
    setError(null);
    setSaving(true);
    try {
      await api.createPlannedEntry(accessToken, household.id, {
        nature,
        description: description.trim(),
        originalAmountMinor: amountMinor,
        competenceDate,
        dueDate,
        memberId,
        idempotencyKey,
        ...(accountId === null ? {} : { expectedAccountId: accountId }),
        ...(categoryId === null ? {} : { categoryId }),
        ...(counterparty.trim() === '' ? {} : { counterpartyName: counterparty.trim() }),
        ...(reminderDays === '' ? {} : { reminderDaysBefore: Number.parseInt(reminderDays, 10) }),
        ...(repeat === 'INSTALLMENTS' ? { installments } : {}),
        ...(repeat === 'RECURRING'
          ? {
              recurrence: {
                frequency: 'MONTHLY' as const,
                interval: 1,
                maxOccurrences: occurrences,
              },
            }
          : {}),
      });
      onSaved();
    } catch (cause) {
      setError(cause instanceof ApiRequestError ? cause.message : 'Não foi possível salvar agora.');
    } finally {
      setSaving(false);
    }
  }, [
    accessToken,
    accountId,
    amountMinor,
    categoryId,
    competenceDate,
    counterparty,
    description,
    dueDate,
    household,
    idempotencyKey,
    installments,
    memberId,
    nature,
    occurrences,
    onSaved,
    reminderDays,
    repeat,
  ]);

  const canSubmit = amountMinor > 0 && description.trim() !== '' && memberId !== null && !saving;

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: colors.surface }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScreenHeader
        title={nature === 'PAYABLE' ? 'Nova conta a pagar' : 'Nova conta a receber'}
        onBack={onBack}
        size="screen"
      />

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

        <View style={{ gap: spacing.md, marginTop: spacing.md }}>
          <Field
            label="Descrição"
            testID="campo-descricao"
            value={description}
            onChangeText={setDescription}
            autoCapitalize="sentences"
            placeholder={nature === 'PAYABLE' ? 'Energia elétrica' : 'Salário'}
          />
          <Field
            label="Vence em"
            testID="campo-vencimento"
            value={dueDate}
            onChangeText={setDueDate}
            placeholder="2026-08-08"
            autoCapitalize="none"
          />
          <Field
            label="Competência"
            testID="campo-competencia"
            value={competenceDate}
            onChangeText={setCompetenceDate}
            placeholder="2026-08-01"
            autoCapitalize="none"
          />
          <Field
            label={nature === 'PAYABLE' ? 'Favorecido' : 'Pagador'}
            testID="campo-favorecido"
            value={counterparty}
            onChangeText={setCounterparty}
            autoCapitalize="words"
          />
          <Field
            label="Lembrar quantos dias antes"
            testID="campo-lembrete"
            value={reminderDays}
            onChangeText={(text) => setReminderDays(text.replace(/\D/g, '').slice(0, 2))}
            keyboardType="number-pad"
          />
        </View>

        {accounts.length === 0 ? null : (
          <View style={{ marginTop: spacing.xl }}>
            <SectionLabel>CONTA PREVISTA</SectionLabel>
            <View style={styles.chips}>
              {accounts.map((account) => (
                <ChoiceChip
                  key={account.id}
                  testID={`conta-${account.id}`}
                  label={account.name}
                  selected={accountId === account.id}
                  onPress={() => setAccountId(account.id)}
                />
              ))}
            </View>
          </View>
        )}

        {relevantCategories.length === 0 ? null : (
          <View style={{ marginTop: spacing.xl }}>
            <SectionLabel>CATEGORIA</SectionLabel>
            <View style={styles.chips}>
              {relevantCategories.map((category) => (
                <ChoiceChip
                  key={category.id}
                  testID={`categoria-${category.id}`}
                  label={category.name}
                  selected={categoryId === category.id}
                  onPress={() => setCategoryId(category.id)}
                />
              ))}
            </View>
          </View>
        )}

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

        <View style={{ marginTop: spacing.xl }}>
          <SectionLabel>REPETIÇÃO</SectionLabel>
          <SegmentedControl
            testID="segmento-repeticao"
            options={[
              { value: 'NONE', label: 'Única' },
              { value: 'INSTALLMENTS', label: 'Parcelada' },
              { value: 'RECURRING', label: 'Recorrente' },
            ]}
            value={repeat}
            onChange={setRepeat}
          />

          {repeat === 'INSTALLMENTS' ? (
            <View style={[styles.chips, { marginTop: spacing.md }]}>
              {[2, 3, 6, 10, 12].map((count) => (
                <ChoiceChip
                  key={count}
                  testID={`parcelas-${count}`}
                  label={`${count}×`}
                  selected={installments === count}
                  onPress={() => setInstallments(count)}
                />
              ))}
            </View>
          ) : null}

          {repeat === 'RECURRING' ? (
            <View style={{ marginTop: spacing.md }}>
              <Text variant="rowMeta" tone="secondary">
                {describeRecurrence({
                  frequency: 'MONTHLY',
                  interval: 1,
                  startDate: isoDate(dueDate),
                })}
              </Text>
              <View style={[styles.chips, { marginTop: spacing.sm }]}>
                {[6, 12, 24].map((count) => (
                  <ChoiceChip
                    key={count}
                    testID={`ocorrencias-${count}`}
                    label={`${count} vezes`}
                    selected={occurrences === count}
                    onPress={() => setOccurrences(count)}
                  />
                ))}
              </View>
            </View>
          ) : null}

          {preview.length === 0 ? null : (
            <View style={{ marginTop: spacing.md }}>
              <Card testID="card-previa">
                {preview.map((item) => (
                  <View key={`${item.label}-${item.date}`} style={styles.previewRow}>
                    <Text variant="rowMeta" tone="secondary">
                      {`${item.label} · ${formatDate(isoDate(item.date))}`}
                    </Text>
                    <Text variant="moneyRow">{formatMoney(minor(item.amountMinor))}</Text>
                  </View>
                ))}
              </Card>
              {repeat === 'INSTALLMENTS' ? (
                <View style={{ marginTop: spacing.sm }}>
                  <Banner
                    kind="info"
                    testID="banner-soma"
                    message={`Soma das parcelas ${formatMoney(minor(amountMinor))} ✓ — a diferença de centavos vai na última parcela.`}
                  />
                </View>
              ) : null}
            </View>
          )}
        </View>

        {error === null ? null : (
          <View style={{ marginTop: spacing.md }}>
            <Banner kind="error" message={error} testID="erro-conta-prevista" />
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
          testID="salvar-conta-prevista"
          label="Salvar"
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
    paddingVertical: 3,
  },
  footer: { borderTopWidth: 1, paddingTop: 12 },
});
