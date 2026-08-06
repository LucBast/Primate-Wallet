/**
 * Tela 1f — Fatura do cartão (screenshots/1f-fatura.png).
 *
 * Blocos, na ordem da especificação:
 *   1. Header "Fatura de {mês}" + cartão + navegação ‹ mês · mês · mês ›
 *   2. Card cardNavy: status + chip, valor da fatura em moneyLg, Pago/Falta
 *      pagar com barra de progresso (7, preenchimento toastAction) e barra de
 *      limite (5, branca)
 *   3. "Compras · N": linhas com avatar do membro; parcela com badge
 *      "parcela 03/10"; estornada riscada com "− R$" em income
 *   4. "Pagamentos": linha ✓ com a microcopy "não vira nova despesa"
 *   5. CTA que muda por estado (STATES-AND-MATRICES §3):
 *      Ver compras → Pagar fatura → Completar pagamento → Ver pagamentos
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Account, CardStatement } from '@ff/api-contracts';
import { formatDate, formatMoney, isoDate, minor } from '@ff/domain';
import { Avatar } from '../../components/Avatar';
import { Banner } from '../../components/Banner';
import { Button } from '../../components/Button';
import { Card, ListRow, SectionLabel } from '../../components/Card';
import { MoneyInput } from '../../components/MoneyInput';
import { ProgressBar } from '../../components/ProgressBar';
import { ScreenHeader } from '../../components/ScreenHeader';
import { StatusChip } from '../../components/StatusChip';
import { EmptyState, RecoverableError, SkeletonList } from '../../components/states';
import { Text } from '../../design-system/Text';
import { useTheme } from '../../design-system/theme';
import { icons, iconSize } from '../../design-system/icons';
import { ApiRequestError } from '../../services/api-client';
import { newIdempotencyKey } from '../../services/idempotency';
import { useSessionStore } from '../auth/session-store';
import { useActiveHousehold } from '../household/household-store';
import { useReferenceStore } from '../household/reference-store';
import * as api from './card-api';

const MONTH_FORMAT = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' });

/** CTA por estado da fatura (STATES-AND-MATRICES §3). */
function ctaFor(statement: CardStatement): string {
  switch (statement.status) {
    case 'OPEN':
      return 'Ver compras';
    case 'CLOSED':
      return `Pagar fatura · ${formatMoney(minor(statement.outstandingMinor))}`;
    case 'PARTIAL':
      return `Completar pagamento · ${formatMoney(minor(statement.outstandingMinor))}`;
    case 'PAID':
      return 'Ver pagamentos';
  }
}

export function CardStatementScreen({
  card,
  onBack,
}: {
  readonly card: Account;
  readonly onBack: () => void;
}): React.JSX.Element {
  const { colors, layout, radius, spacing } = useTheme();
  const insets = useSafeAreaInsets();
  const accessToken = useSessionStore((state) => state.accessToken);
  const household = useActiveHousehold();
  const { accounts, members } = useReferenceStore();

  const [statements, setStatements] = useState<CardStatement[] | null>(null);
  const [index, setIndex] = useState(0);
  const [paying, setPaying] = useState(false);
  const [payAmountMinor, setPayAmountMinor] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  const statement = statements?.[index] ?? null;

  const load = useCallback(async () => {
    if (!accessToken || !household) return;
    setError(null);
    try {
      setStatements(await api.listStatements(accessToken, household.id, card.id));
    } catch (cause) {
      setError(
        cause instanceof ApiRequestError ? cause.message : 'Não foi possível carregar a fatura.',
      );
    }
  }, [accessToken, card.id, household]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (statement !== null) setPayAmountMinor(statement.outstandingMinor);
  }, [statement]);

  const paymentAccount = useMemo(
    () =>
      accounts.find((account) => account.id === card.defaultPaymentAccountId) ??
      accounts.find((account) => account.accountType !== 'CREDIT_CARD') ??
      null,
    [accounts, card.defaultPaymentAccountId],
  );

  const handlePay = useCallback(async () => {
    if (!accessToken || !household || statement === null || paymentAccount === null) return;
    const memberId = members[0]?.id;
    if (memberId === undefined) return;

    setWorking(true);
    setError(null);
    try {
      // Fatura ainda aberta precisa fechar antes de receber pagamento.
      let target = statement;
      if (target.status === 'OPEN') {
        target = await api.closeStatement(accessToken, household.id, target.id, target.version);
      }
      await api.payStatement(accessToken, household.id, target.id, {
        amountMinor: payAmountMinor,
        fromAccountId: paymentAccount.id,
        paidAt: new Date().toISOString().slice(0, 10),
        memberId,
        idempotencyKey: newIdempotencyKey('fatura'),
        expectedVersion: target.version,
      });
      setPaying(false);
      await load();
    } catch (cause) {
      setError(cause instanceof ApiRequestError ? cause.message : 'Não foi possível pagar agora.');
    } finally {
      setWorking(false);
    }
  }, [accessToken, household, load, members, paymentAccount, payAmountMinor, statement]);

  const Prev = icons.anterior;
  const Next = icons.proximo;

  return (
    <View style={[styles.flex, { backgroundColor: colors.surface }]}>
      <ScreenHeader
        title={
          statement === null
            ? 'Fatura'
            : `Fatura de ${MONTH_FORMAT.format(new Date(`${statement.closingDate}T12:00:00Z`)).replace(' de ', ' ')}`
        }
        subtitle={
          card.cardLastFour === null ? card.name : `${card.name} · • • • • ${card.cardLastFour}`
        }
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
        {error !== null ? (
          <RecoverableError message={error} onRetry={() => void load()} testID="erro-fatura" />
        ) : statements === null ? (
          <SkeletonList rows={5} />
        ) : statement === null ? (
          <EmptyState
            title="Nenhuma fatura ainda"
            subtitle="Assim que houver compras neste cartão, a fatura do ciclo aparece aqui."
          />
        ) : (
          <>
            <View style={styles.monthRow}>
              <Pressable
                testID="fatura-anterior"
                accessibilityRole="button"
                accessibilityLabel="Fatura anterior"
                hitSlop={10}
                disabled={index >= statements.length - 1}
                onPress={() => setIndex((current) => Math.min(statements.length - 1, current + 1))}
              >
                <Prev size={iconSize.row} color={colors.textSecondary} />
              </Pressable>
              <Text variant="section">
                {`${formatDate(isoDate(statement.cycleStartDate))} — ${formatDate(isoDate(statement.cycleEndDate))}`}
              </Text>
              <Pressable
                testID="fatura-proxima"
                accessibilityRole="button"
                accessibilityLabel="Próxima fatura"
                hitSlop={10}
                disabled={index === 0}
                onPress={() => setIndex((current) => Math.max(0, current - 1))}
              >
                <Next size={iconSize.row} color={colors.textSecondary} />
              </Pressable>
            </View>

            {/* Card da fatura, em cardNavy */}
            <View
              style={[
                styles.statementCard,
                { backgroundColor: colors.cardNavy, borderRadius: radius.xxl },
              ]}
              testID="card-fatura"
            >
              <View style={styles.statementHeader}>
                <Text variant="sectionCaps" tone="onBrand">
                  FATURA
                </Text>
                <StatusChip
                  status={
                    statement.status === 'PAID'
                      ? 'pago'
                      : statement.overdue
                        ? 'vencido'
                        : statement.status === 'PARTIAL'
                          ? 'parcial'
                          : 'aberto'
                  }
                  {...(statement.status === 'PARTIAL'
                    ? { detail: `falta ${formatMoney(minor(statement.outstandingMinor))}` }
                    : {})}
                />
              </View>

              <Text variant="moneyLg" tone="onBrand">
                {formatMoney(minor(statement.totalMinor))}
              </Text>
              <Text variant="rowMeta" tone="onBrand">
                {`Pago ${formatMoney(minor(statement.paidMinor))} · Falta pagar ${formatMoney(minor(statement.outstandingMinor))} · vence ${formatDate(isoDate(statement.dueDate))}`}
              </Text>

              <View style={{ marginTop: spacing.md }}>
                <ProgressBar
                  percent={statement.paidPercent}
                  tone="income"
                  height={7}
                  accessibilityLabel={`${statement.paidPercent}% pago`}
                />
              </View>

              {statement.creditLimitMinor === null ? null : (
                <View style={{ marginTop: spacing.sm }}>
                  <ProgressBar
                    percent={(statement.usedLimitMinor / statement.creditLimitMinor) * 100}
                    tone="info"
                    height={5}
                    accessibilityLabel="Limite usado"
                  />
                  <Text variant="rowMeta" tone="onBrand" style={{ marginTop: 4 }}>
                    {`Limite ${formatMoney(minor(statement.creditLimitMinor))} · disponível ${formatMoney(minor(statement.availableLimitMinor ?? 0))}`}
                  </Text>
                </View>
              )}
            </View>

            <View style={{ marginTop: spacing.xl }}>
              <SectionLabel>{`COMPRAS · ${statement.items.length}`}</SectionLabel>
              {statement.items.length === 0 ? (
                <Card>
                  <Text variant="rowMeta" tone="secondary">
                    Nenhuma compra neste ciclo.
                  </Text>
                </Card>
              ) : (
                <Card padded={false} testID="card-compras">
                  {statement.items.map((item, itemIndex) => {
                    const reversed = item.status === 'REVERSED';
                    const refund = item.transactionType === 'REFUND';
                    return (
                      <ListRow
                        key={item.id}
                        first={itemIndex === 0}
                        testID={`compra-${item.id}`}
                        title={item.description}
                        meta={[
                          item.categoryName,
                          formatDate(isoDate(item.occurredAt.slice(0, 10))),
                          refund ? 'reembolso' : null,
                        ]
                          .filter((part): part is string => Boolean(part))
                          .join(' · ')}
                        left={<Avatar name={item.memberName ?? '?'} seed={item.id} size="sm" />}
                        right={
                          <Text
                            variant="moneyRow"
                            tone={refund ? 'income' : reversed ? 'secondary' : 'expense'}
                            style={reversed ? styles.reversed : undefined}
                          >
                            {formatMoney(minor(refund ? -item.amountMinor : item.amountMinor), {
                              signDisplay: refund ? 'always' : 'auto',
                            })}
                          </Text>
                        }
                      />
                    );
                  })}
                </Card>
              )}
            </View>

            {statement.payments.length === 0 ? null : (
              <View style={{ marginTop: spacing.xl }}>
                <SectionLabel>{`PAGAMENTOS · ${statement.payments.length}`}</SectionLabel>
                <Card padded={false} testID="card-pagamentos">
                  {statement.payments.map((payment, paymentIndex) => (
                    <ListRow
                      key={payment.id}
                      first={paymentIndex === 0}
                      title={`✓ ${formatMoney(minor(payment.amountMinor))}`}
                      meta={[
                        payment.accountName,
                        formatDate(isoDate(payment.paidAt)),
                        payment.createdByName,
                        payment.reversedAt === null ? 'não vira nova despesa' : 'estornado',
                      ]
                        .filter((part): part is string => Boolean(part))
                        .join(' · ')}
                      metaTone={payment.reversedAt === null ? 'secondary' : 'danger'}
                    />
                  ))}
                </Card>
              </View>
            )}

            {paying ? (
              <View style={{ marginTop: spacing.xl }}>
                <MoneyInput
                  label="VALOR DO PAGAMENTO"
                  testID="campo-pagamento"
                  valueMinor={payAmountMinor}
                  onChangeMinor={setPayAmountMinor}
                  maxMinor={statement.outstandingMinor}
                  size={28}
                />
                <View style={{ marginTop: spacing.md }}>
                  <Banner
                    kind="info"
                    testID="banner-pagamento"
                    message={`Sai de ${paymentAccount?.name ?? 'sua conta'}. O pagamento de fatura não vira nova despesa: as despesas já foram as compras do cartão.`}
                  />
                </View>
              </View>
            ) : null}
          </>
        )}
      </ScrollView>

      {statement === null ? null : (
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
            testID="cta-fatura"
            label={
              paying
                ? `Confirmar pagamento de ${formatMoney(minor(payAmountMinor))}`
                : ctaFor(statement)
            }
            loading={working}
            disabled={statement.status === 'PAID' && !paying}
            onPress={() => {
              if (statement.status === 'PAID') return;
              if (!paying) {
                setPaying(true);
                return;
              }
              void handlePay();
            }}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingTop: 4 },
  monthRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'center',
    marginBottom: 12,
  },
  statementCard: { gap: 2, paddingHorizontal: 18, paddingVertical: 14 },
  statementHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  reversed: { textDecorationLine: 'line-through' },
  footer: { borderTopWidth: 1, paddingTop: 12 },
});
