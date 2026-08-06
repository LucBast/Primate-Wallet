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
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { PlannedEntry, Settlement } from '@ff/api-contracts';
import { formatDate, formatMoney, isoDate, minor } from '@ff/domain';
import { Banner } from '../../components/Banner';
import { Button } from '../../components/Button';
import { Card, ListRow, SectionLabel } from '../../components/Card';
import { ChoiceChip } from '../../components/Chip';
import { Field } from '../../components/Field';
import { MoneyInput } from '../../components/MoneyInput';
import { ProgressBar } from '../../components/ProgressBar';
import { ScreenHeader } from '../../components/ScreenHeader';
import { StatusChip } from '../../components/StatusChip';
import { Text } from '../../design-system/Text';
import { useTheme } from '../../design-system/theme';
import { ApiRequestError } from '../../services/api-client';
import { newIdempotencyKey } from '../../services/idempotency';
import { useSessionStore } from '../auth/session-store';
import { useActiveHousehold } from '../household/household-store';
import { useReferenceStore } from '../household/reference-store';
import * as api from './settlement-api';

/** Lê centavos de um campo de texto ("15,00" → 1500). */
function parseCents(text: string): number {
  const digits = text.replace(/\D/g, '');
  return digits === '' ? 0 : Number.parseInt(digits, 10);
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

  const [entry, setEntry] = useState<PlannedEntry>(initial);
  const [history, setHistory] = useState<Settlement[]>([]);
  const [principalMinor, setPrincipalMinor] = useState(Math.max(0, initial.outstandingMinor));
  const [interestText, setInterestText] = useState('');
  const [penaltyText, setPenaltyText] = useState('');
  const [discountText, setDiscountText] = useState('');
  const [accountId, setAccountId] = useState<string | null>(
    initial.expectedAccountId ?? accounts[0]?.id ?? null,
  );
  const [settledAt, setSettledAt] = useState(() => new Date().toISOString().slice(0, 10));
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
    () => ({
      interest: parseCents(interestText),
      penalty: parseCents(penaltyText),
      discount: parseCents(discountText),
    }),
    [discountText, interestText, penaltyText],
  );

  /** "Total que sai da conta": principal + juros + multa − desconto. */
  const netMinor = principalMinor + charges.interest + charges.penalty - charges.discount;
  const settlesFully = principalMinor >= entry.outstandingMinor;

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
        subtitle={`${entry.description} · vence ${formatDate(isoDate(entry.dueDate))}`}
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
              {entry.nature === 'PAYABLE' ? 'Já pago' : 'Já recebido'}
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
            <View style={[styles.statusLine, { marginTop: spacing.sm }]}>
              <Text variant="rowMeta" tone="secondary">
                {`${entry.settledPercent}% pago · status:`}
              </Text>
              <StatusChip
                status={
                  entry.status === 'SETTLED'
                    ? entry.nature === 'PAYABLE'
                      ? 'pago'
                      : 'recebido'
                    : entry.status === 'PARTIAL'
                      ? 'parcial'
                      : entry.overdue
                        ? 'vencido'
                        : 'aberto'
                }
              />
            </View>
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

        <View style={[styles.chargeRow, { marginTop: spacing.md }]}>
          <View style={styles.charge}>
            <Field
              label="Juros"
              testID="campo-juros"
              value={interestText}
              onChangeText={setInterestText}
              keyboardType="number-pad"
              placeholder="0,00"
            />
          </View>
          <View style={styles.charge}>
            <Field
              label="Multa"
              testID="campo-multa"
              value={penaltyText}
              onChangeText={setPenaltyText}
              keyboardType="number-pad"
              placeholder="0,00"
            />
          </View>
          <View style={styles.charge}>
            <Field
              label="Desconto"
              testID="campo-desconto"
              value={discountText}
              onChangeText={setDiscountText}
              keyboardType="number-pad"
              placeholder="0,00"
            />
          </View>
        </View>

        <View style={{ marginTop: spacing.xl }}>
          <SectionLabel>CONTA USADA</SectionLabel>
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

        <View style={{ marginTop: spacing.md }}>
          <Field
            label="Data"
            testID="campo-data"
            value={settledAt}
            onChangeText={setSettledAt}
            autoCapitalize="none"
            placeholder="2026-08-08"
          />
        </View>

        <View style={{ marginTop: spacing.md }}>
          <Banner
            kind="info"
            testID="banner-total"
            message={`Total que sai da conta: ${formatMoney(minor(netMinor))} — ${formatMoney(minor(principalMinor))} de principal${charges.interest > 0 ? ` + ${formatMoney(minor(charges.interest))} de juros` : ''}${charges.penalty > 0 ? ` + ${formatMoney(minor(charges.penalty))} de multa` : ''}${charges.discount > 0 ? ` − ${formatMoney(minor(charges.discount))} de desconto` : ''}.`}
          />
        </View>

        {history.length === 0 ? null : (
          <View style={{ marginTop: spacing.xl }}>
            <SectionLabel>{`HISTÓRICO DE BAIXAS · ${history.length}`}</SectionLabel>
            <Card padded={false} testID="card-historico">
              {history.map((settlement, index) => (
                <ListRow
                  key={settlement.id}
                  first={index === 0}
                  testID={`baixa-${settlement.id}`}
                  title={`${settlement.reversedAt === null ? '✓' : '↺'} ${formatMoney(minor(settlement.netAmountMinor))}`}
                  meta={[
                    settlement.accountName,
                    formatDate(isoDate(settlement.settledAt)),
                    settlement.createdByName,
                    settlement.reversedAt === null
                      ? null
                      : `estornada · ${settlement.reversalReason ?? ''}`,
                  ]
                    .filter((part): part is string => Boolean(part))
                    .join(' · ')}
                  metaTone={settlement.reversedAt === null ? 'secondary' : 'danger'}
                  right={
                    settlement.reversedAt === null ? (
                      <Button
                        testID={`estornar-${settlement.id}`}
                        label="Estornar"
                        variant="destructive"
                        size="sm"
                        style={styles.reverseButton}
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
                      />
                    ) : undefined
                  }
                />
              ))}
            </Card>
          </View>
        )}

        {error === null ? null : (
          <View style={{ marginTop: spacing.md }}>
            <Banner kind="error" message={error} testID="erro-baixa" />
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
          testID="confirmar-baixa"
          label={`Confirmar baixa de ${formatMoney(minor(netMinor))}`}
          loading={saving}
          disabled={!canConfirm}
          onPress={handleConfirm}
        />
        <Text variant="rowMeta" tone="secondary" style={{ marginTop: spacing.sm }}>
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
  statusLine: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chargeRow: { flexDirection: 'row', gap: 8 },
  charge: { flex: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  reverseButton: { width: 92 },
  footer: { borderTopWidth: 1, paddingTop: 12 },
});
