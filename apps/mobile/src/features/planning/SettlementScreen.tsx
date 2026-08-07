/**
 * Tela 1e — Dar baixa (screenshots/1e-baixa-parcial.png).
 *
 * Blocos, na ordem da especificação:
 *   1. Header "Dar baixa" + contexto da conta prevista
 *   2. Card resumo: Valor original / Já pago (income) / Falta pagar (warning)
 *      + ProgressBar 8 + "44% pago · status: ● Parcial"
 *   3. MoneyInput "Valor desta baixa" (28), com máximo = saldo em aberto
 *   4. Três campos lado a lado: Juros · Multa · Desconto
 *   5. Campos: Conta usada · Data
 *   6. Banner brandSoft "Total que sai da conta" com a soma
 *   7. "Histórico de baixas": valor, conta, data, autor + ação Estornar
 *   8. CTA "Confirmar baixa de R$ X" + microcopy
 *      "A conta ficará como ● Paga. Baixas podem ser estornadas, nunca apagadas."
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { PlannedEntry, Settlement } from '@ff/api-contracts';
import { familyToday, formatMoney, isoDate, minor } from '@ff/domain';
import { Banner } from '../../components/Banner';
import { Button } from '../../components/Button';
import { Card, IconBadge, ListRow, SectionLabel } from '../../components/Card';
import { DateField } from '../../components/DateField';
import { Field } from '../../components/Field';
import { MoneyInput } from '../../components/MoneyInput';
import { OptionSheet } from '../../components/OptionSheet';
import { ProgressBar } from '../../components/ProgressBar';
import { ScreenHeader } from '../../components/ScreenHeader';
import { SelectField } from '../../components/SelectField';
import { Text, type TextTone } from '../../design-system/Text';
import { useTheme } from '../../design-system/theme';
import { icons, iconSize } from '../../design-system/icons';
import { ApiRequestError } from '../../services/api-client';
import { dayMonth } from '../../services/dates';
import { newIdempotencyKey } from '../../services/idempotency';
import { useSessionStore } from '../auth/session-store';
import { useActiveHousehold } from '../household/household-store';
import { useReferenceStore } from '../household/reference-store';
import * as api from './settlement-api';

/** Lê centavos de um campo de texto ("R$ 15,00" → 1500). */
function parseCents(text: string): number {
  const digits = text.replace(/\D/g, '');
  return digits === '' ? 0 : Number.parseInt(digits, 10);
}

/** "● Parcial" da linha "44% pago · status: ● Parcial" (1e). */
function statusWord(entry: PlannedEntry): { readonly text: string; readonly tone: TextTone } {
  if (entry.status === 'SETTLED') {
    return { text: entry.nature === 'PAYABLE' ? '● Paga' : '● Recebida', tone: 'income' };
  }
  if (entry.status === 'PARTIAL') return { text: '● Parcial', tone: 'warning' };
  if (entry.overdue) return { text: '● Vencida', tone: 'danger' };
  return { text: '● Aberta', tone: 'secondary' };
}

export function SettlementScreen({
  entry: initial,
  onBack,
  onSettled,
}: {
  readonly entry: PlannedEntry;
  readonly onBack: () => void;
  readonly onSettled: (entry: PlannedEntry) => void;
}): React.JSX.Element {
  const { colors, layout, spacing } = useTheme();
  const insets = useSafeAreaInsets();
  const accessToken = useSessionStore((state) => state.accessToken);
  const household = useActiveHousehold();
  const { accounts } = useReferenceStore();

  const today =
    household === null
      ? isoDate(new Date().toISOString().slice(0, 10))
      : familyToday(household.timezone);

  const [entry, setEntry] = useState<PlannedEntry>(initial);
  const [history, setHistory] = useState<Settlement[]>([]);
  const [principalMinor, setPrincipalMinor] = useState(Math.max(0, initial.outstandingMinor));
  const [interestMinor, setInterestMinor] = useState(0);
  const [penaltyMinor, setPenaltyMinor] = useState(0);
  const [discountMinor, setDiscountMinor] = useState(0);
  const [accountId, setAccountId] = useState<string | null>(
    initial.expectedAccountId ?? accounts[0]?.id ?? null,
  );
  const [accountSheet, setAccountSheet] = useState(false);
  const [settledAt, setSettledAt] = useState<string>(today);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState(() => newIdempotencyKey('baixa'));

  const load = useCallback(async () => {
    if (!accessToken || !household) return;
    try {
      setHistory(await api.listSettlements(accessToken, household.id, entry.id));
    } catch {
      // Histórico é complementar: sua falha não impede registrar a baixa.
      setHistory([]);
    }
  }, [accessToken, entry.id, household]);

  useEffect(() => {
    void load();
  }, [load]);

  const charges = useMemo(
    () => ({ interest: interestMinor, penalty: penaltyMinor, discount: discountMinor }),
    [discountMinor, interestMinor, penaltyMinor],
  );

  /** "Total que sai da conta": principal + juros + multa − desconto. */
  const netMinor = principalMinor + charges.interest + charges.penalty - charges.discount;
  const settlesFully = principalMinor >= entry.outstandingMinor;

  /** Baixas que ainda valem — o "(1 baixa)" do card resumo. */
  const validSettlements = history.filter((item) => item.reversedAt === null).length;
  const selectedAccount = accounts.find((account) => account.id === accountId);

  const handleConfirm = useCallback(async () => {
    if (!accessToken || !household || accountId === null) return;
    setError(null);
    setSaving(true);
    try {
      const result = await api.settle(accessToken, household.id, entry.id, {
        principalAmountMinor: principalMinor,
        interestAmountMinor: charges.interest,
        penaltyAmountMinor: charges.penalty,
        discountAmountMinor: charges.discount,
        accountId,
        settledAt,
        idempotencyKey,
        expectedVersion: entry.version,
      });
      setEntry(result.plannedEntry);
      onSettled(result.plannedEntry);
    } catch (cause) {
      // Chave nova depois de um erro: a próxima tentativa é um comando novo.
      setIdempotencyKey(newIdempotencyKey('baixa'));
      setError(
        cause instanceof ApiRequestError ? cause.message : 'Não foi possível dar baixa agora.',
      );
    } finally {
      setSaving(false);
    }
  }, [
    accessToken,
    accountId,
    charges,
    entry.id,
    entry.version,
    household,
    idempotencyKey,
    onSettled,
    principalMinor,
    settledAt,
  ]);

  const canConfirm = principalMinor > 0 && netMinor > 0 && accountId !== null && !saving;

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: colors.surface }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScreenHeader
        title="Dar baixa"
        // "Mensalidade escola — Caio · conta a pagar" (1e-baixa-parcial.png):
        // o contexto é a conta e a natureza dela, não a data de vencimento.
        subtitle={`${entry.description} · conta a ${entry.nature === 'PAYABLE' ? 'pagar' : 'receber'}`}
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
        <Card testID="card-resumo">
          <View style={styles.row}>
            <Text variant="rowMeta" tone="secondary">
              Valor original
            </Text>
            <Text variant="moneyRow">{formatMoney(minor(entry.originalAmountMinor))}</Text>
          </View>
          <View style={styles.row}>
            <Text variant="rowMeta" tone="secondary">
              {/* "Já pago (1 baixa)" — o screenshot conta as baixas válidas. */}
              {`${entry.nature === 'PAYABLE' ? 'Já pago' : 'Já recebido'}${
                validSettlements === 0
                  ? ''
                  : ` (${validSettlements} ${validSettlements === 1 ? 'baixa' : 'baixas'})`
              }`}
            </Text>
            <Text variant="moneyRow" tone="income">
              {formatMoney(minor(entry.settledMinor))}
            </Text>
          </View>
          <View style={styles.row}>
            <Text variant="rowMeta" tone="secondary">
              {entry.nature === 'PAYABLE' ? 'Falta pagar' : 'Falta receber'}
            </Text>
            <Text variant="moneyRow" tone="warning">
              {formatMoney(minor(Math.max(0, entry.outstandingMinor)))}
            </Text>
          </View>

          <View style={{ marginTop: spacing.md }}>
            <ProgressBar
              percent={entry.settledPercent}
              tone={entry.status === 'SETTLED' ? 'income' : 'warning'}
              height={8}
              accessibilityLabel={`${entry.settledPercent}% pago`}
            />
            {/* "44% pago · status: ● Parcial" numa linha só: o screenshot não
                usa a pílula do StatusChip aqui, e sim texto com o ponto na cor
                do estado. */}
            <Text variant="rowMeta" tone="secondary" style={{ marginTop: spacing.sm }}>
              {`${entry.settledPercent}% ${entry.nature === 'PAYABLE' ? 'pago' : 'recebido'} · status: `}
              <Text variant="rowMeta" tone={statusWord(entry).tone}>
                {statusWord(entry).text}
              </Text>
            </Text>
          </View>
        </Card>

        <View style={{ marginTop: spacing.md }}>
          <MoneyInput
            label="VALOR DESTA BAIXA"
            testID="campo-valor-baixa"
            valueMinor={principalMinor}
            onChangeMinor={setPrincipalMinor}
            maxMinor={Math.max(0, entry.outstandingMinor)}
            maxHelperSuffix=" (saldo em aberto)"
            size={28}
          />
        </View>

        {/* Juros, multa e desconto são dinheiro: o screenshot mostra "R$ 6,20"
            dentro do campo, não um texto solto. Digitar acrescenta centavos. */}
        <View style={[styles.chargeRow, { marginTop: spacing.md }]}>
          <View style={styles.charge}>
            <Field
              label="Juros"
              testID="campo-juros"
              value={formatMoney(minor(interestMinor))}
              onChangeText={(text) => setInterestMinor(parseCents(text))}
              keyboardType="number-pad"
            />
          </View>
          <View style={styles.charge}>
            <Field
              label="Multa"
              testID="campo-multa"
              value={formatMoney(minor(penaltyMinor))}
              onChangeText={(text) => setPenaltyMinor(parseCents(text))}
              keyboardType="number-pad"
            />
          </View>
          <View style={styles.charge}>
            <Field
              label="Desconto"
              testID="campo-desconto"
              value={formatMoney(minor(discountMinor))}
              onChangeText={(text) => setDiscountMinor(parseCents(text))}
              keyboardType="number-pad"
            />
          </View>
        </View>

        {/* "CONTA USADA" e "DATA" são dois selects lado a lado (1e). */}
        <View style={[styles.chargeRow, { marginTop: spacing.md }]}>
          <View style={styles.accountField}>
            <SelectField
              testID="campo-conta-usada"
              label="Conta usada"
              value={
                selectedAccount === undefined
                  ? 'Escolher'
                  : [selectedAccount.name, selectedAccount.primaryMemberName]
                      .filter((part): part is string => Boolean(part))
                      .join(' · ')
              }
              placeholder={selectedAccount === undefined}
              onPress={() => setAccountSheet(true)}
            />
          </View>
          <View style={styles.charge}>
            <DateField
              testID="campo-data"
              label="Data"
              value={settledAt}
              onChange={setSettledAt}
              today={today}
            />
          </View>
        </View>

        <View style={{ marginTop: spacing.md }}>
          <Banner
            kind="brand"
            testID="banner-total"
            message="Total que sai da conta"
            actionLabel={formatMoney(minor(netMinor))}
          />
        </View>

        {history.length === 0 ? null : (
          <View style={{ marginTop: spacing.xl }}>
            <SectionLabel>Histórico de baixas</SectionLabel>
            <Card padded={false} testID="card-historico">
              {history.map((settlement, index) => {
                const estornada = settlement.reversedAt !== null;
                const Marca = estornada ? icons.estorno : icons.confirmado;
                return (
                  <ListRow
                    key={settlement.id}
                    first={index === 0}
                    testID={`baixa-${settlement.id}`}
                    left={
                      <IconBadge background={estornada ? colors.chipNeutral : colors.incomeSoft}>
                        <Marca
                          size={iconSize.row}
                          color={estornada ? colors.textSecondary : colors.income}
                        />
                      </IconBadge>
                    }
                    title={`${formatMoney(minor(settlement.netAmountMinor))}${
                      settlement.accountName === null ? '' : ` · ${settlement.accountName}`
                    }`}
                    titleStyle={estornada ? styles.reversed : undefined}
                    meta={[
                      dayMonth(settlement.settledAt.slice(0, 10)),
                      settlement.createdByName === null ? null : `por ${settlement.createdByName}`,
                      estornada ? `● Estornada · ${settlement.reversalReason ?? ''}` : null,
                    ]
                      .filter((part): part is string => Boolean(part))
                      .join(' · ')}
                    metaTone={estornada ? 'danger' : 'secondary'}
                    right={
                      estornada ? undefined : (
                        <Pressable
                          testID={`estornar-${settlement.id}`}
                          accessibilityRole="button"
                          accessibilityLabel="Estornar baixa"
                          hitSlop={8}
                          onPress={async () => {
                            if (!accessToken || !household) return;
                            const result = await api.reverseSettlement(
                              accessToken,
                              household.id,
                              settlement.id,
                              {
                                reason: 'Estorno solicitado pelo usuário',
                                idempotencyKey: newIdempotencyKey('estorno-baixa'),
                              },
                            );
                            setEntry(result.plannedEntry);
                            await load();
                          }}
                        >
                          <Text variant="rowMeta" tone="danger">
                            Estornar
                          </Text>
                        </Pressable>
                      )
                    }
                  />
                );
              })}
            </Card>
          </View>
        )}

        {error === null ? null : (
          <View style={{ marginTop: spacing.md }}>
            <Banner kind="error" message={error} testID="erro-baixa" />
          </View>
        )}
      </ScrollView>

      <OptionSheet
        visible={accountSheet}
        title="Conta usada"
        testID="folha-conta-usada"
        options={accounts.map((account) => ({
          value: account.id,
          label: account.name,
          meta: account.primaryMemberName ?? undefined,
        }))}
        value={accountId}
        onSelect={setAccountId}
        onClose={() => setAccountSheet(false)}
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
          testID="confirmar-baixa"
          label={`Confirmar baixa de ${formatMoney(minor(netMinor))}`}
          loading={saving}
          disabled={!canConfirm}
          onPress={handleConfirm}
        />
        {/* Centralizada, como no screenshot. */}
        <Text
          variant="rowMeta"
          tone="secondary"
          style={[styles.microcopy, { marginTop: spacing.sm }]}
        >
          {settlesFully
            ? `A conta ficará como ● ${entry.nature === 'PAYABLE' ? 'Paga' : 'Recebida'}. Baixas podem ser estornadas, nunca apagadas.`
            : 'A conta ficará como ● Parcial. Baixas podem ser estornadas, nunca apagadas.'}
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingTop: 4 },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  chargeRow: { flexDirection: 'row', gap: 8 },
  charge: { flex: 1 },
  // "CONTA USADA · Conta Corrente · Bruno" precisa de mais espaço que a data.
  accountField: { flex: 1.6 },
  reversed: { textDecorationLine: 'line-through' },
  microcopy: { textAlign: 'center' },
  // Sem linha divisória: o screenshot mostra o CTA sobre o próprio fundo.
  footer: { paddingTop: 12 },
});
