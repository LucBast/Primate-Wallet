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
  familyToday,
  formatMoney,
  isoDate,
  minor,
  splitInstallments,
} from '@ff/domain';
import { Badge } from '../../components/Badge';
import { Banner } from '../../components/Banner';
import { Button } from '../../components/Button';
import { Card, ListRow, SectionLabel } from '../../components/Card';
import { ChoiceChip } from '../../components/Chip';
import { DateField } from '../../components/DateField';
import { Field } from '../../components/Field';
import { MoneyInput } from '../../components/MoneyInput';
import { OptionSheet } from '../../components/OptionSheet';
import { ScreenHeader } from '../../components/ScreenHeader';
import { SelectField } from '../../components/SelectField';
import { Text } from '../../design-system/Text';
import { useTheme } from '../../design-system/theme';
import { ApiRequestError } from '../../services/api-client';
import { dayMonth, longMonthLabel } from '../../services/dates';
import { newIdempotencyKey } from '../../services/idempotency';
import { useSessionStore } from '../auth/session-store';
import { useActiveHousehold } from '../household/household-store';
import { useReferenceStore } from '../household/reference-store';
import * as api from './card-api';

const INSTALLMENT_OPTIONS = [1, 2, 3, 6, 10] as const;
/** O que abre no "Outro ▾". */
const OUTRAS_PARCELAS = [4, 5, 8, 12, 15, 18, 24, 36] as const;

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
  const today =
    household === null
      ? new Date().toISOString().slice(0, 10)
      : (familyToday(household.timezone) as string);
  const [purchaseDate, setPurchaseDate] = useState<string>(today);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [memberId, setMemberId] = useState<string | null>(members[0]?.id ?? null);
  const [installments, setInstallments] = useState(1);
  const [sheet, setSheet] = useState<'cartao' | 'categoria' | 'membro' | 'parcelas' | null>(null);
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
          /* Cartão e data dividem a linha (screenshot 2e). */
          <View style={[styles.row, { marginTop: spacing.md }]}>
            <View style={styles.wide}>
              <SelectField
                testID="campo-cartao"
                label="Cartão"
                value={
                  card === null
                    ? 'Escolher'
                    : card.cardLastFour === null
                      ? card.name
                      : `${card.name} • • • • ${card.cardLastFour}`
                }
                placeholder={card === null}
                onPress={() => setSheet('cartao')}
              />
            </View>
            <View style={styles.narrow}>
              <DateField
                testID="campo-data"
                label="Data"
                value={purchaseDate}
                onChange={setPurchaseDate}
                today={today}
              />
            </View>
          </View>
        )}

        {/* Descrição ao lado de "Categoria · Membro", num select só. */}
        <View style={[styles.row, { marginTop: spacing.md }]}>
          <View style={styles.wide}>
            <Field
              label="Descrição"
              testID="campo-descricao"
              value={description}
              onChangeText={setDescription}
              autoCapitalize="sentences"
              placeholder="Sofá"
            />
          </View>
          <View style={styles.wide}>
            <SelectField
              testID="campo-categoria-membro"
              label="Categoria · Membro"
              value={[
                expenseCategories.find((item) => item.id === categoryId)?.name,
                members.find((item) => item.id === memberId)?.displayName,
              ]
                .filter((part): part is string => Boolean(part))
                .join(' · ')}
              placeholder={categoryId === null && memberId === null}
              onPress={() => setSheet('categoria')}
            />
          </View>
        </View>

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
            {/* "Outro ▾" abre o resto das opções, como no screenshot. */}
            <ChoiceChip
              testID="parcelas-outro"
              label={
                INSTALLMENT_OPTIONS.includes(installments as (typeof INSTALLMENT_OPTIONS)[number])
                  ? 'Outro ▾'
                  : `${installments}× ▾`
              }
              selected={
                !INSTALLMENT_OPTIONS.includes(installments as (typeof INSTALLMENT_OPTIONS)[number])
              }
              onPress={() => setSheet('parcelas')}
            />
          </View>
        </View>

        {preview.length === 0 ? null : (
          <View style={{ marginTop: spacing.md }}>
            <Card padded={false} testID="card-previa">
              {preview.map((item, index) => (
                <ListRow
                  key={item.number}
                  first={index === 0}
                  testID={`parcela-${item.number}`}
                  title={`Parcela ${item.number} de ${installments}`}
                  // O arredondamento é um selo ao lado do título, não um aviso
                  // solto no fim do card.
                  badge={
                    item.roundingMinor === 0 ? undefined : (
                      <Badge
                        tone="income"
                        label={`+ ${formatMoney(minor(item.roundingMinor))} de arredondamento`}
                      />
                    )
                  }
                  meta={`fatura de ${longMonthLabel(item.closingDate)} · vence ${dayMonth(item.dueDate)}`}
                  right={<Text variant="moneyRow">{formatMoney(minor(item.amountMinor))}</Text>}
                />
              ))}
            </Card>

            <View style={{ marginTop: spacing.sm }}>
              <Banner
                kind="brand"
                testID="banner-soma"
                message="Soma das parcelas"
                actionLabel={`${formatMoney(minor(sumMinor))} ✓`}
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

        {/* Linha simples, sem card: "Limite após a compra   R$ 3.750,00
            disponível de R$ 8.000,00". */}
        {limitAfter === null ? null : (
          <View style={[styles.previewRow, { marginTop: spacing.md }]}>
            <Text variant="rowMeta" tone="secondary">
              Limite após a compra
            </Text>
            <Text variant="rowMeta" tone={limitAfter < 0 ? 'danger' : 'secondary'}>
              {`${formatMoney(minor(limitAfter))} disponível de ${formatMoney(minor(card?.creditLimitMinor ?? 0))}`}
            </Text>
          </View>
        )}

        {error === null ? null : (
          <View style={{ marginTop: spacing.md }}>
            <Banner kind="error" message={error} testID="erro-compra" />
          </View>
        )}
      </ScrollView>

      <OptionSheet
        visible={sheet === 'cartao'}
        title="Cartão"
        options={cards.map((item) => ({
          value: item.id,
          label: item.name,
          meta: item.cardLastFour === null ? undefined : `• • • • ${item.cardLastFour}`,
        }))}
        value={cardId}
        onSelect={setCardId}
        onClose={() => setSheet(null)}
      />
      <OptionSheet
        visible={sheet === 'categoria'}
        title="Categoria"
        options={expenseCategories.map((item) => ({ value: item.id, label: item.name }))}
        value={categoryId}
        onSelect={(value) => {
          setCategoryId(value);
          setSheet('membro');
        }}
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
        visible={sheet === 'parcelas'}
        title="Parcelas"
        options={OUTRAS_PARCELAS.map((count) => ({ value: String(count), label: `${count}×` }))}
        value={String(installments)}
        onSelect={(value) => setInstallments(Number.parseInt(value, 10))}
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
  row: { flexDirection: 'row', gap: 10 },
  wide: { flex: 1.4 },
  narrow: { flex: 1 },
  previewRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
    paddingVertical: 3,
  },
  footer: { paddingTop: 12 },
});
