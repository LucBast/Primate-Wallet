/**
 * Tela 1b — Início / Dashboard (screenshots/1b-inicio.png; tema escuro em 5b).
 *
 * Blocos, na ordem do screenshot:
 *   1. Header: avatar 38 + "Olá, {nome}" + seletor "Família Souza ▾" + sino
 *   2. Segmented "Competência | Caixa" + seletor de mês "‹ Ago 2026 ›"
 *   3. Card Saldo consolidado (brand): moneyLg + "Disponível / Cartões em aberto"
 *   4. Card "Previsto × realizado": duas barras (income/expense) com
 *      "R$ X de R$ Y" + linha "Resultado realizado"
 *   5. Banner dangerSoft "● N contas vencidas · R$ X — Resolver ›"
 *   6. Card "Próximos compromissos": até 5 linhas + "Ver todos ›"
 *   7. Card "Resumo por membro": mini-cards com o total de despesa
 *
 * Alternar Competência/Caixa muda TODOS os números da tela — nunca se misturam.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import type { Dashboard, ReportMode } from '@ff/api-contracts';
import { addMonths, formatMoney, isoDate, minor, monthRange } from '@ff/domain';
import { Avatar } from '../../components/Avatar';
import { Banner } from '../../components/Banner';
import { Card, IconBadge, ListRow } from '../../components/Card';
import { SegmentedControl } from '../../components/Chip';
import { MonthPicker } from '../../components/MonthPicker';
import { ProgressBar } from '../../components/ProgressBar';
import { ScreenHeader } from '../../components/ScreenHeader';
import { EmptyState, RecoverableError, SkeletonList } from '../../components/states';
import { Text } from '../../design-system/Text';
import { useTheme } from '../../design-system/theme';
import { icons, iconSize } from '../../design-system/icons';
import { categoryVisual } from '../../design-system/category-icons';
import { ApiRequestError } from '../../services/api-client';
import { dueLabel, longMonthLabel, monthLabel } from '../../services/dates';
import { useSessionStore } from '../auth/session-store';
import { useActiveHousehold, useHouseholdStore } from '../household/household-store';
import * as api from './report-api';

export type HomeScreenProps = {
  readonly onOpenPlanning: () => void;
  readonly onOpenReports: () => void;
  readonly onOpenNotifications: () => void;
  readonly onSwitchHousehold: () => void;
};

export function HomeScreen({
  onOpenPlanning,
  onOpenReports,
  onOpenNotifications,
  onSwitchHousehold,
}: HomeScreenProps): React.JSX.Element {
  const { colors, layout, radius, spacing } = useTheme();
  const accessToken = useSessionStore((state) => state.accessToken);
  const profile = useSessionStore((state) => state.profile);
  const household = useActiveHousehold();
  const households = useHouseholdStore((state) => state.households);

  const [mode, setMode] = useState<ReportMode>('ACCRUAL');
  const [monthAnchor, setMonthAnchor] = useState(() =>
    isoDate(new Date().toISOString().slice(0, 10)),
  );
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const range = useMemo(() => monthRange(monthAnchor), [monthAnchor]);

  const load = useCallback(async () => {
    if (!accessToken || !household) return;
    setError(null);
    try {
      setData(
        await api.getDashboard(accessToken, household.id, {
          mode,
          from: range.start,
          to: range.end,
        }),
      );
    } catch (cause) {
      setError(
        cause instanceof ApiRequestError ? cause.message : 'Não foi possível carregar o início.',
      );
    }
  }, [accessToken, household, mode, range.end, range.start]);

  useEffect(() => {
    void load();
  }, [load]);

  const Bell = icons.notificacao;

  const firstName = (profile?.displayName ?? '').split(' ')[0] ?? '';

  return (
    <View style={[styles.flex, { backgroundColor: colors.surface }]}>
      <ScreenHeader
        title={`Olá, ${firstName}`}
        // O screenshot mostra "Família Souza ▾" sempre — o ▾ é o seletor de
        // família, não um enfeite que aparece só quando há mais de uma.
        subtitle={`${household?.name ?? 'Família'} ▾`}
        onPressSubtitle={households.length > 1 ? onSwitchHousehold : undefined}
        left={<Avatar name={profile?.displayName ?? '?'} tone="brand" />}
        right={
          <Pressable
            testID="abrir-notificacoes"
            accessibilityRole="button"
            accessibilityLabel="Notificações"
            hitSlop={10}
            onPress={onOpenNotifications}
          >
            <IconBadge background={colors.warningSoft}>
              <Bell size={iconSize.row} color={colors.warning} />
            </IconBadge>
          </Pressable>
        }
      />

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingHorizontal: layout.screenPaddingH, paddingBottom: spacing.xxxl },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load().finally(() => setRefreshing(false));
            }}
          />
        }
      >
        <View style={styles.controls}>
          <View style={styles.segment}>
            <SegmentedControl
              testID="segmento-modo"
              options={[
                { value: 'ACCRUAL', label: 'Competência' },
                { value: 'CASH', label: 'Caixa' },
              ]}
              value={mode}
              onChange={setMode}
            />
          </View>

          <MonthPicker
            label={monthLabel(range.start)}
            onPrevious={() => setMonthAnchor((current) => addMonths(current, -1))}
            onNext={() => setMonthAnchor((current) => addMonths(current, 1))}
            style={styles.monthPicker}
          />
        </View>

        {error !== null ? (
          <View style={{ marginTop: spacing.lg }}>
            <RecoverableError message={error} onRetry={() => void load()} testID="erro-inicio" />
          </View>
        ) : data === null ? (
          <View style={{ marginTop: spacing.lg }}>
            <SkeletonList rows={5} />
          </View>
        ) : (
          <>
            {/* 3. Saldo consolidado */}
            <View
              style={[
                styles.balanceCard,
                {
                  backgroundColor: colors.brand,
                  borderRadius: radius.xxl,
                  marginTop: spacing.md,
                },
              ]}
              testID="card-saldo"
            >
              <Text variant="sectionCaps" tone="onBrand">
                SALDO CONSOLIDADO
              </Text>
              <Text variant="moneyLg" tone="onBrand">
                {formatMoney(minor(data.consolidatedBalanceMinor))}
              </Text>
              <Text variant="chip" tone="onBrand">
                {`Disponível ${formatMoney(minor(data.availableBalanceMinor))}    Cartões em aberto ${formatMoney(minor(data.cardDebtMinor))}`}
              </Text>
            </View>

            {/* 4. Previsto × realizado */}
            <View style={{ marginTop: spacing.md }}>
              <Card testID="card-previsto-realizado">
                <View style={styles.cardHeader}>
                  <Text variant="rowTitle">Previsto × realizado</Text>
                  <Text variant="rowMeta" tone="secondary">
                    {longMonthLabel(range.start)}
                  </Text>
                </View>

                <View style={{ gap: spacing.md, marginTop: spacing.md }}>
                  <View style={styles.compareRow}>
                    <View style={styles.compareHeader}>
                      <Text variant="rowMeta" tone="income">
                        ↑ Receitas
                      </Text>
                      <Text variant="moneyRow">
                        {`${formatMoney(minor(data.summary.incomeMinor))} de ${formatMoney(minor(data.summary.plannedIncomeMinor))}`}
                      </Text>
                    </View>
                    <ProgressBar
                      percent={
                        data.summary.plannedIncomeMinor === 0
                          ? 100
                          : (data.summary.incomeMinor * 100) / data.summary.plannedIncomeMinor
                      }
                      tone="income"
                      accessibilityLabel="Receitas realizadas"
                    />
                  </View>

                  <View style={styles.compareRow}>
                    <View style={styles.compareHeader}>
                      <Text variant="rowMeta" tone="expense">
                        ↓ Despesas
                      </Text>
                      <Text variant="moneyRow">
                        {`${formatMoney(minor(data.summary.expenseMinor))} de ${formatMoney(minor(data.summary.plannedExpenseMinor))}`}
                      </Text>
                    </View>
                    <ProgressBar
                      percent={
                        data.summary.plannedExpenseMinor === 0
                          ? 100
                          : (data.summary.expenseMinor * 100) / data.summary.plannedExpenseMinor
                      }
                      tone="expense"
                      accessibilityLabel="Despesas realizadas"
                    />
                  </View>
                </View>

                <View style={[styles.cardHeader, { marginTop: spacing.md }]}>
                  <Text variant="rowTitle">Resultado realizado</Text>
                  <Text
                    variant="moneyRow"
                    tone={data.summary.resultMinor < 0 ? 'expense' : 'income'}
                  >
                    {formatMoney(minor(data.summary.resultMinor), { signDisplay: 'always' })}
                  </Text>
                </View>
              </Card>
            </View>

            {/* 5. Vencidas */}
            {data.overdueCount === 0 ? null : (
              <Pressable
                testID="banner-vencidas"
                accessibilityRole="button"
                accessibilityLabel="Resolver contas vencidas"
                onPress={onOpenPlanning}
                style={{ marginTop: spacing.md }}
              >
                <Banner
                  kind="error"
                  message={`● ${data.overdueCount} ${data.overdueCount === 1 ? 'conta vencida' : 'contas vencidas'} · ${formatMoney(minor(data.overdueMinor))}`}
                  actionLabel="Resolver ›"
                />
              </Pressable>
            )}

            {/* 6. Próximos compromissos */}
            <View style={{ marginTop: spacing.md }}>
              {data.upcoming.length === 0 ? (
                <EmptyState
                  title="Nada previsto"
                  subtitle="Cadastre contas a pagar e a receber para acompanhar o mês."
                />
              ) : (
                /* No screenshot o título fica DENTRO do card, em caixa normal,
                   com "Ver todos ›" na mesma linha — não é um SectionLabel em
                   caixa alta acima do card. */
                <Card padded={false} testID="card-compromissos">
                  <View style={[styles.cardHeader, styles.innerHeader]}>
                    <Text variant="rowTitle">Próximos compromissos</Text>
                    <Pressable
                      testID="ver-todos"
                      accessibilityRole="button"
                      accessibilityLabel="Ver todos os compromissos"
                      hitSlop={8}
                      onPress={onOpenPlanning}
                    >
                      <Text variant="rowMeta" tone="brand">
                        Ver todos ›
                      </Text>
                    </Pressable>
                  </View>

                  {data.upcoming.map((item) => {
                    // A fatura tem tratamento próprio (COMPONENT-SPECS §Linha de
                    // fatura): ícone credit-card em brandSoft, meta já pronta no
                    // servidor ("fecha 10/08 · vence 15/08") e valor em
                    // textPrimary sem sinal, porque fatura não é despesa.
                    const fatura = item.kind === 'CARD_STATEMENT';
                    const receita = item.nature === 'RECEIVABLE';
                    // Compromisso usa o ícone da CATEGORIA (COMPONENT-SPECS
                    // §Ícones por categoria); a fatura tem o seu, credit-card.
                    const visual = categoryVisual(item.categoryName, colors);
                    const Icone = fatura ? icons.cartao : visual.Icon;
                    const corIcone = fatura ? colors.brand : visual.color;
                    const fundoIcone = fatura ? colors.brandSoft : visual.background;

                    return (
                      <ListRow
                        key={item.id}
                        testID={`compromisso-${item.id}`}
                        title={item.description}
                        left={
                          <IconBadge background={fundoIcone}>
                            <Icone size={iconSize.row} color={corIcone} />
                          </IconBadge>
                        }
                        meta={
                          fatura
                            ? (item.meta ?? undefined)
                            : [
                                item.overdue ? 'vencida' : `vence ${dueLabel(item.dueDate)}`,
                                item.meta,
                              ]
                                .filter((part): part is string => Boolean(part))
                                .join(' · ')
                        }
                        metaTone={item.overdue ? 'danger' : 'secondary'}
                        onPress={onOpenPlanning}
                        right={
                          <Text
                            variant="moneyRow"
                            tone={fatura ? 'primary' : receita ? 'income' : 'expense'}
                          >
                            {formatMoney(minor(item.amountMinor))}
                          </Text>
                        }
                      />
                    );
                  })}
                </Card>
              )}
            </View>

            {/* 7. Resumo por membro */}
            <View style={{ marginTop: spacing.md }}>
              <Card testID="card-resumo-membro">
                <View style={styles.cardHeader}>
                  <Text variant="rowTitle">Resumo por membro</Text>
                  <Pressable
                    testID="abrir-relatorios"
                    accessibilityRole="button"
                    accessibilityLabel="Abrir relatórios"
                    hitSlop={8}
                    onPress={onOpenReports}
                  >
                    <Text variant="rowMeta" tone="brand">
                      Relatório ›
                    </Text>
                  </Pressable>
                </View>

                <View style={[styles.memberRow, { marginTop: spacing.md }]}>
                  {data.byMember.map((member) => (
                    <View
                      key={member.memberId}
                      style={[
                        styles.memberCard,
                        { backgroundColor: colors.surface, borderRadius: radius.lg },
                      ]}
                    >
                      <Text variant="rowTitle">
                        {member.memberName}
                        {member.role === 'CHILD' ? (
                          /* O screenshot marca o filho supervisionado ao lado do
                             nome: "Caio · filho". */
                          <Text variant="rowMeta" tone="pending">
                            {'  · filho'}
                          </Text>
                        ) : null}
                      </Text>
                      <Text variant="moneyRow" tone="expense">
                        {formatMoney(minor(member.expenseMinor))}
                      </Text>
                    </View>
                  ))}
                </View>
              </Card>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingTop: 4 },
  controls: { flexDirection: 'row', gap: 8 },
  segment: { flex: 1.6 },
  monthPicker: { flex: 1 },
  balanceCard: { gap: 2, paddingHorizontal: 18, paddingVertical: 14 },
  cardHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  compareRow: { gap: 6 },
  compareHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  innerHeader: { paddingTop: 14 },
  memberRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  memberCard: { flexBasis: '30%', flexGrow: 1, gap: 2, padding: 10 },
});
