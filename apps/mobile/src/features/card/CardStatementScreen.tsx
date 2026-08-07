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
import { familyToday, formatMoney, minor } from '@ff/domain';
import { Avatar } from '../../components/Avatar';
import { Badge } from '../../components/Badge';
import { Banner } from '../../components/Banner';
import { Button } from '../../components/Button';
import { Card, IconBadge, ListRow, SectionLabel } from '../../components/Card';
import { MoneyInput } from '../../components/MoneyInput';
import { ProgressBar } from '../../components/ProgressBar';
import { ScreenHeader } from '../../components/ScreenHeader';
import { StatusChip } from '../../components/StatusChip';
import { EmptyState, RecoverableError, SkeletonList } from '../../components/states';
import { Text } from '../../design-system/Text';
import { useTheme } from '../../design-system/theme';
import { icons, iconSize } from '../../design-system/icons';
import { ApiRequestError } from '../../services/api-client';
import { dayMonth } from '../../services/dates';
import { newIdempotencyKey } from '../../services/idempotency';
import { useSessionStore } from '../auth/session-store';
import { useActiveHousehold } from '../household/household-store';
import { useReferenceStore } from '../household/reference-store';
import * as api from './card-api';

const MONTH_FORMAT = new Intl.DateTimeFormat('pt-BR', { month: 'long', timeZone: 'UTC' });
/** "‹ jul · ago · set ›" do cabeçalho. */
const MONTH_SHORT = new Intl.DateTimeFormat('pt-BR', { month: 'short', timeZone: 'UTC' });

function shortMonth(iso: string): string {
  return MONTH_SHORT.format(new Date(`${iso}T12:00:00Z`)).replace('.', '');
}

/** "FATURA FECHADA · VENCE 15/08" (1f-fatura.png). */
function statementCaps(statement: CardStatement): string {
  const estado =
    statement.status === 'OPEN' ? 'ABERTA' : statement.status === 'PAID' ? 'PAGA' : 'FECHADA';
  return `FATURA ${estado} · VENCE ${dayMonth(statement.dueDate)}`;
}

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
  // A lista vem da mais recente para a mais antiga: o índice seguinte é o mês
  // anterior. "‹ jul · ago · set ›".
  const previousStatement = statements?.[index + 1];
  const nextStatement = statements?.[index - 1];

  const load = useCallback(async () => {
    if (!accessToken || !household) return;
    setError(null);
    try {
      const list = await api.listStatements(accessToken, household.id, card.id);
      setStatements(list);
      // A lista vem da mais recente para a mais antiga, e uma compra parcelada
      // cria faturas até o fim do parcelamento: abrir no índice 0 mostraria o
      // ciclo de daqui a dez meses. A tela abre no ciclo corrente.
      const today = familyToday(household.timezone);
      const atual = list.findIndex((item) => item.cycleStartDate <= today);
      setIndex(atual === -1 ? list.length - 1 : atual);
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

  const Confirmado = icons.confirmado;

  return (
    <View style={[styles.flex, { backgroundColor: colors.surface }]}>
      <ScreenHeader
        title={
          statement === null
            ? 'Fatura'
            : `Fatura de ${MONTH_FORMAT.format(new Date(`${statement.closingDate}T12:00:00Z`))}`
        }
        // "Cartão Azul • • • • 4412 · ‹ jul · ago · set ›": no screenshot a
        // navegação entre faturas vive no subtítulo, não numa linha própria.
        subtitle={
          <View style={styles.subtitle}>
            <Text variant="rowMeta" tone="secondary">
              {card.cardLastFour === null ? card.name : `${card.name} • • • • ${card.cardLastFour}`}
            </Text>
            {statement === null || statements === null ? null : (
              <>
                <Text variant="rowMeta" tone="secondary">
                  {' · ‹ '}
                </Text>
                <Pressable
                  testID="fatura-anterior"
                  accessibilityRole="button"
                  accessibilityLabel="Fatura anterior"
                  hitSlop={8}
                  disabled={index >= statements.length - 1}
                  onPress={() =>
                    setIndex((current) => Math.min(statements.length - 1, current + 1))
                  }
                >
                  <Text variant="rowMeta" tone="secondary">
                    {previousStatement === undefined
                      ? '—'
                      : shortMonth(previousStatement.closingDate)}
                  </Text>
                </Pressable>
                <Text variant="rowMeta" tone="secondary">
                  {` · ${shortMonth(statement.closingDate)} · `}
                </Text>
                <Pressable
                  testID="fatura-proxima"
                  accessibilityRole="button"
                  accessibilityLabel="Próxima fatura"
                  hitSlop={8}
                  disabled={index === 0}
                  onPress={() => setIndex((current) => Math.max(0, current - 1))}
                >
                  <Text variant="rowMeta" tone="secondary">
                    {nextStatement === undefined ? '—' : shortMonth(nextStatement.closingDate)}
                  </Text>
                </Pressable>
                <Text variant="rowMeta" tone="secondary">
                  {' ›'}
                </Text>
              </>
            )}
          </View>
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
                  {statementCaps(statement)}
                </Text>
                <StatusChip
                  onCard
                  status={
                    statement.status === 'PAID'
                      ? 'pago'
                      : statement.overdue
                        ? 'vencido'
                        : statement.status === 'PARTIAL'
                          ? 'parcial'
                          : 'aberto'
                  }
                />
              </View>

              <Text variant="moneyLg" tone="onBrand">
                {formatMoney(minor(statement.totalMinor))}
              </Text>

              <View style={[styles.cardLine, { marginTop: spacing.sm }]}>
                <Text variant="rowMeta" tone="onBrand">
                  {`Pago ${formatMoney(minor(statement.paidMinor))}`}
                </Text>
                <Text variant="rowMeta" tone="onBrand">
                  {`Falta pagar ${formatMoney(minor(statement.outstandingMinor))}`}
                </Text>
              </View>

              <View style={{ marginTop: 6 }}>
                <ProgressBar
                  percent={statement.paidPercent}
                  tone="statement"
                  trackTone="onCard"
                  height={7}
                  accessibilityLabel={`${statement.paidPercent}% pago`}
                />
              </View>

              {statement.creditLimitMinor === null ? null : (
                <>
                  <View style={[styles.cardLine, { marginTop: spacing.md }]}>
                    <Text variant="rowMeta" tone="onBrand">
                      {`Limite usado ${formatMoney(minor(statement.usedLimitMinor))} / ${formatMoney(minor(statement.creditLimitMinor))}`}
                    </Text>
                    <Text variant="rowMeta" tone="onBrand">
                      {`Disponível ${formatMoney(minor(statement.availableLimitMinor ?? 0))}`}
                    </Text>
                  </View>
                  <View style={{ marginTop: 6 }}>
                    <ProgressBar
                      percent={(statement.usedLimitMinor / statement.creditLimitMinor) * 100}
                      tone="onCard"
                      trackTone="onCard"
                      height={5}
                      accessibilityLabel="Limite usado"
                    />
                  </View>
                </>
              )}
            </View>

            <View style={{ marginTop: spacing.md }}>
              <SectionLabel>
                {`Compras · ${statement.items.length} ${statement.items.length === 1 ? 'item' : 'itens'}`}
              </SectionLabel>
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
                        // COMPONENT-SPECS §StatusChip: estornado é line-through
                        // em textSecondary — no screenshot a linha inteira
                        // esmaece, só o valor devolvido fica em income.
                        titleStyle={
                          reversed ? { ...styles.reversed, color: colors.textSecondary } : undefined
                        }
                        // "28/07 · Mercado · Ana": data, categoria e membro,
                        // nessa ordem. Estornada troca tudo pelo motivo.
                        meta={
                          reversed
                            ? `● Estornada em ${dayMonth(item.occurredAt.slice(0, 10))}${
                                item.reversalReason === null
                                  ? ''
                                  : ` · motivo: ${item.reversalReason}`
                              }`
                            : [
                                dayMonth(item.occurredAt.slice(0, 10)),
                                item.categoryName,
                                item.memberName,
                                refund ? 'reembolso' : null,
                              ]
                                .filter((part): part is string => Boolean(part))
                                .join(' · ')
                        }
                        metaTone="secondary"
                        badge={
                          item.installmentTotal === null ||
                          item.installmentNumber === null ? undefined : (
                            <Badge
                              label={`parcela ${String(item.installmentNumber).padStart(2, '0')}/${String(item.installmentTotal).padStart(2, '0')}`}
                            />
                          )
                        }
                        left={<Avatar name={item.memberName ?? '?'} tone="neutral" size="sm" />}
                        right={
                          <Text
                            variant="moneyRow"
                            // No extrato da fatura a compra já é despesa por
                            // definição: o valor fica em textPrimary, sem sinal
                            // (medido em 1f-fatura.png). Estorno e reembolso
                            // devolvem dinheiro e aparecem em income com "−".
                            tone={refund || reversed ? 'income' : 'primary'}
                          >
                            {formatMoney(
                              minor(refund || reversed ? -item.amountMinor : item.amountMinor),
                              { signDisplay: refund || reversed ? 'always' : 'auto' },
                            )}
                          </Text>
                        }
                      />
                    );
                  })}
                </Card>
              )}
            </View>

            {statement.payments.length === 0 ? null : (
              <View style={{ marginTop: spacing.md }}>
                <SectionLabel>Pagamentos</SectionLabel>
                <Card padded={false} testID="card-pagamentos">
                  {statement.payments.map((payment, paymentIndex) => {
                    const estornado = payment.reversedAt !== null;
                    // "Pagamento parcial" quando não quita a fatura inteira.
                    const parcial = payment.amountMinor < statement.totalMinor;
                    return (
                      <ListRow
                        key={payment.id}
                        first={paymentIndex === 0}
                        testID={`pagamento-${payment.id}`}
                        left={
                          <IconBadge
                            background={estornado ? colors.chipNeutral : colors.incomeSoft}
                          >
                            <Confirmado
                              size={iconSize.row}
                              color={estornado ? colors.textSecondary : colors.income}
                            />
                          </IconBadge>
                        }
                        title={`${parcial ? 'Pagamento parcial' : 'Pagamento'}${
                          payment.accountName === null ? '' : ` · ${payment.accountName}`
                        }`}
                        titleStyle={estornado ? styles.reversed : undefined}
                        meta={[
                          dayMonth(payment.paidAt),
                          payment.createdByName === null ? null : `por ${payment.createdByName}`,
                          estornado ? '● Estornado' : 'não vira nova despesa',
                        ]
                          .filter((part): part is string => Boolean(part))
                          .join(' · ')}
                        metaTone={estornado ? 'danger' : 'secondary'}
                        right={
                          <Text variant="moneyRow" tone={estornado ? 'secondary' : 'income'}>
                            {formatMoney(minor(payment.amountMinor))}
                          </Text>
                        }
                      />
                    );
                  })}
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
          <Text
            variant="rowMeta"
            tone="secondary"
            style={[styles.microcopy, { marginTop: spacing.sm }]}
          >
            O botão muda com o estado: &quot;Pagar fatura&quot; → &quot;Completar pagamento&quot; →
            &quot;Ver pagamentos&quot;.
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingTop: 4 },
  subtitle: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap' },
  statementCard: { paddingHorizontal: 18, paddingVertical: 14 },
  statementHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  cardLine: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  reversed: { textDecorationLine: 'line-through' },
  microcopy: { textAlign: 'center' },
  footer: { paddingTop: 12 },
});
