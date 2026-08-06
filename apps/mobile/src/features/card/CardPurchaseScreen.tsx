/**
 * Tela 2e — Compra parcelada no cartão (screenshots/2e-compra-parcelada.png).
 *
 * Blocos, na ordem da especificação:
 *   1. MoneyInput "Valor total" (30)
 *   2. Fields: Cartão · Data · Descrição · Categoria · Membro
 *   3. Chips de parcelas: À vista · 2× · 3× · 6× · 10× · Outro
 *   4. Prévia das parcelas (fatura e vencimento de cada), com badge
 *      "+ R$ 0,01 de arredondamento" na última quando houver diferença
 *   5. Banner brandSoft "Soma das parcelas R$ X ✓"
 *   6. Banner infoSoft "A compra entra como despesa por competência e consome
 *      limite. Sua conta bancária só muda quando a fatura for paga."
 *   7. Linha "Limite após a compra"
 *   8. CTA "Registrar compra em N×"
 *
 * A prévia usa o MESMO código do domínio que o servidor (`splitInstallments` e
 * `cyclesForInstallments`), então o que a pessoa vê é o que será gravado.
 */

import React, { useCallback, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  cyclesForInstallments,
  formatDate,
  formatMoney,
  isoDate,
  minor,
  splitInstallments,
} from '@ff/domain';
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
import * as api from './card-api';

const INSTALLMENT_OPTIONS = [1, 2, 3, 6, 10, 12] as const;

export function CardPurchaseScreen({
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

  const cards = useMemo(
    () => accounts.filter((account) => account.accountType === 'CREDIT_CARD'),
    [accounts],
  );
  const expenseCategories = useMemo(
    () => categories.filter((category) => category.nature === 'EXPENSE'),
    [categories],
  );

  const [amountMinor, setAmountMinor] = useState(0);
  const [cardId, setCardId] = useState<string | null>(cards[0]?.id ?? null);
  const [description, setDescription] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [memberId, setMemberId] = useState<string | null>(members[0]?.id ?? null);
  const [installments, setInstallments] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [idempotencyKey] = useState(() => newIdempotencyKey('compra'));

  const card = cards.find((item) => item.id === cardId) ?? null;

  /** Prévia com as mesmas funções do domínio que o servidor usa. */
  const preview = useMemo(() => {
    if (card === null || amountMinor <= 0 || card.closingDay === null || card.dueDay === null) {
      return [];
    }
    const parts = splitInstallments(minor(amountMinor), installments);
    const cycles = cyclesForInstallments(
      isoDate(purchaseDate),
      card.closingDay,
      card.dueDay,
      installments,
    );
    const base = parts[0] ?? 0;
    return parts.map((amount, index) => ({
      number: index + 1,
      amountMinor: amount as number,
      dueDate: (cycles[index]?.dueDate ?? purchaseDate) as string,
      closingDate: (cycles[index]?.closingDate ?? purchaseDate) as string,
      roundingMinor: index === parts.length - 1 ? amount - base : 0,
    }));
  }, [amountMinor, card, installments, purchaseDate]);

  const sumMinor = preview.reduce((sum, item) => sum + item.amountMinor, 0);
  const limitAfter =
    card === null || card.availableLimitMinor === null
      ? null
      : card.availableLimitMinor - amountMinor;

  const handleSave = useCallback(async () => {
    if (!accessToken || !household || cardId === null || memberId === null) return;
    setError(null);
    setSaving(true);
    try {
      await api.createPurchase(accessToken, household.id, {
        accountId: cardId,
        description: description.trim(),
        amountMinor,
        purchaseDate,
        memberId,
        installments,
        idempotencyKey,
        ...(categoryId === null ? {} : { categoryId }),
      });
      onSaved();
    } catch (cause) {
      setError(
        cause instanceof ApiRequestError ? cause.message : 'Não foi possível registrar agora.',
      );
    } finally {
      setSaving(false);
    }
  }, [
    accessToken,
    amountMinor,
    cardId,
    categoryId,
    description,
    household,
    idempotencyKey,
    installments,
    memberId,
    onSaved,
    purchaseDate,
  ]);

  const canSubmit =
    amountMinor > 0 && description.trim() !== '' && cardId !== null && memberId !== null && !saving;

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: colors.surface }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScreenHeader title="Compra no cartão" onBack={onBack} size="screen" />

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingHorizontal: layout.screenPaddingH, paddingBottom: spacing.xxxl },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <MoneyInput
          label="VALOR TOTAL"
          testID="campo-valor"
          valueMinor={amountMinor}
          onChangeMinor={setAmountMinor}
          size={30}
          autoFocus
        />

        {cards.length === 0 ? (
          <View style={{ marginTop: spacing.md }}>
            <Banner
              kind="warning"
              testID="banner-sem-cartao"
              message="Você ainda não cadastrou um cartão de crédito. Cadastre em Contas e cartões."
            />
          </View>
        ) : (
          <View style={{ marginTop: spacing.xl }}>
            <SectionLabel>CARTÃO</SectionLabel>
            <View style={styles.chips}>
              {cards.map((item) => (
                <ChoiceChip
                  key={item.id}
                  testID={`cartao-${item.id}`}
                  label={
                    item.cardLastFour === null ? item.name : `${item.name} · ${item.cardLastFour}`
                  }
                  selected={cardId === item.id}
                  onPress={() => setCardId(item.id)}
                />
              ))}
            </View>
          </View>
        )}

        <View style={{ gap: spacing.md, marginTop: spacing.md }}>
          <Field
            label="Descrição"
            testID="campo-descricao"
            value={description}
            onChangeText={setDescription}
            autoCapitalize="sentences"
            placeholder="Sofá"
          />
          <Field
            label="Data da compra"
            testID="campo-data"
            value={purchaseDate}
            onChangeText={setPurchaseDate}
            autoCapitalize="none"
          />
        </View>

        {expenseCategories.length === 0 ? null : (
          <View style={{ marginTop: spacing.xl }}>
            <SectionLabel>CATEGORIA</SectionLabel>
            <View style={styles.chips}>
              {expenseCategories.map((category) => (
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
          <SectionLabel>PARCELAS</SectionLabel>
          <View style={styles.chips}>
            {INSTALLMENT_OPTIONS.map((count) => (
              <ChoiceChip
                key={count}
                testID={`parcelas-${count}`}
                label={count === 1 ? 'À vista' : `${count}×`}
                selected={installments === count}
                onPress={() => setInstallments(count)}
              />
            ))}
          </View>
        </View>

        {preview.length === 0 ? null : (
          <View style={{ marginTop: spacing.md }}>
            <Card testID="card-previa">
              {preview.map((item) => (
                <View key={item.number} style={styles.previewRow}>
                  <Text variant="rowMeta" tone="secondary">
                    {`${String(item.number).padStart(2, '0')}/${String(installments).padStart(2, '0')} · fatura fecha ${formatDate(isoDate(item.closingDate))} · vence ${formatDate(isoDate(item.dueDate))}`}
                  </Text>
                  <Text variant="moneyRow">{formatMoney(minor(item.amountMinor))}</Text>
                </View>
              ))}
              {preview.length > 1 && (preview[preview.length - 1]?.roundingMinor ?? 0) !== 0 ? (
                <Text variant="rowMeta" tone="warning" style={{ marginTop: 4 }}>
                  {`+ ${formatMoney(minor(preview[preview.length - 1]?.roundingMinor ?? 0))} de arredondamento na última parcela`}
                </Text>
              ) : null}
            </Card>

            <View style={{ marginTop: spacing.sm }}>
              <Banner
                kind="info"
                testID="banner-soma"
                message={`Soma das parcelas ${formatMoney(minor(sumMinor))} ✓`}
              />
            </View>
          </View>
        )}

        <View style={{ marginTop: spacing.md }}>
          <Banner
            kind="info"
            testID="banner-competencia"
            message="A compra entra como despesa por competência e consome limite. Sua conta bancária só muda quando a fatura for paga."
          />
        </View>

        {limitAfter === null ? null : (
          <View style={{ marginTop: spacing.md }}>
            <Card>
              <View style={styles.previewRow}>
                <Text variant="rowTitle">Limite após a compra</Text>
                <Text variant="moneyRow" tone={limitAfter < 0 ? 'danger' : 'primary'}>
                  {formatMoney(minor(limitAfter))}
                </Text>
              </View>
            </Card>
          </View>
        )}

        {error === null ? null : (
          <View style={{ marginTop: spacing.md }}>
            <Banner kind="error" message={error} testID="erro-compra" />
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
          testID="registrar-compra"
          label={installments === 1 ? 'Registrar compra' : `Registrar compra em ${installments}×`}
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
    gap: 10,
    justifyContent: 'space-between',
    paddingVertical: 3,
  },
  footer: { borderTopWidth: 1, paddingTop: 12 },
});
