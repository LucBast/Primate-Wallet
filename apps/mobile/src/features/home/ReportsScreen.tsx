/**
 * Telas 4a–4d — Relatórios (screenshots/4a-relatorios.png, 4b, 4c, 4d).
 *
 * Uma tela com quatro visões, porque a especificação as descreve como o mesmo
 * relatório visto por ângulos diferentes:
 *   4a Visão geral: segmented Competência|Caixa SEMPRE visível, 3 KPI cards
 *      (com previsto e comparação com o mês anterior) e evolução dos 6 meses.
 *   4b Por categoria: barras horizontais com valor e percentual.
 *   4c Por membro: barras por membro, com a parte que veio de rateio.
 *   4d Exportação: formato, período e o aviso de que exportação é auditada.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import type {
  CategoryBreakdown,
  Evolution,
  MemberBreakdown,
  MonthlySummary,
  ReportMode,
} from '@ff/api-contracts';
import { addMonths, formatMoney, isoDate, minor, monthRange } from '@ff/domain';
import { Banner } from '../../components/Banner';
import { BottomSheet } from '../../components/BottomSheet';
import { Button } from '../../components/Button';
import { Card, ListRow } from '../../components/Card';
import { ChoiceChip, SegmentedControl } from '../../components/Chip';
import { MonthPicker } from '../../components/MonthPicker';
import { ProgressBar } from '../../components/ProgressBar';
import { ScreenHeader } from '../../components/ScreenHeader';
import { Toggle } from '../../components/Toggle';
import { EmptyState, RecoverableError, SkeletonList } from '../../components/states';
import { Text } from '../../design-system/Text';
import { useTheme } from '../../design-system/theme';
import { ApiRequestError } from '../../services/api-client';
import { longMonthLabel, monthLabel, shortMonthLabel } from '../../services/dates';
import { useSessionStore } from '../auth/session-store';
import { useActiveHousehold } from '../household/household-store';
import * as api from './report-api';

type ReportView = 'OVERVIEW' | 'CATEGORY' | 'MEMBER';

/** O cabeçalho nomeia a visão aberta (4a → 4b/4c). */
const VIEW_TITLE: Record<ReportView, string> = {
  OVERVIEW: 'Relatórios',
  CATEGORY: 'Por categoria',
  MEMBER: 'Por membro',
};

/** Paleta das barras da 4b — só tons de `ProgressBar`, nenhuma cor nova. */
const CATEGORY_TONES = ['expense', 'brand', 'warning', 'info', 'income', 'danger'] as const;

/** Altura da barra do gráfico: o maior mês ocupa os 74dp medidos no design. */
const CHART_HEIGHT = 74;
function barHeight(valueMinor: number, maxMinor: number): number {
  if (maxMinor <= 0 || valueMinor <= 0) return 2;
  return Math.max(2, (valueMinor / maxMinor) * CHART_HEIGHT);
}

export function ReportsScreen({ onBack }: { readonly onBack: () => void }): React.JSX.Element {
  const { colors, layout, radius, spacing } = useTheme();
  const accessToken = useSessionStore((state) => state.accessToken);
  const household = useActiveHousehold();

  const [mode, setMode] = useState<ReportMode>('ACCRUAL');
  const [view, setView] = useState<ReportView>('OVERVIEW');
  const [monthAnchor, setMonthAnchor] = useState(() =>
    isoDate(new Date().toISOString().slice(0, 10)),
  );
  const [summary, setSummary] = useState<MonthlySummary | null>(null);
  const [categories, setCategories] = useState<CategoryBreakdown | null>(null);
  const [members, setMembers] = useState<MemberBreakdown | null>(null);
  const [months, setMonths] = useState<Evolution | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportResult, setExportResult] = useState<string | null>(null);
  const [includeReversed, setIncludeReversed] = useState(false);

  const range = useMemo(() => monthRange(monthAnchor), [monthAnchor]);

  const load = useCallback(async () => {
    if (!accessToken || !household) return;
    setError(null);
    const params = { mode, from: range.start, to: range.end };
    try {
      const [summaryResult, categoryResult, memberResult, evolutionResult] = await Promise.all([
        api.getSummary(accessToken, household.id, params),
        api.byCategory(accessToken, household.id, params),
        api.byMember(accessToken, household.id, params),
        api.evolution(accessToken, household.id, mode, 6),
      ]);
      setSummary(summaryResult);
      setCategories(categoryResult);
      setMembers(memberResult);
      setMonths(evolutionResult);
    } catch (cause) {
      setError(
        cause instanceof ApiRequestError
          ? cause.message
          : 'Não foi possível carregar os relatórios.',
      );
    }
  }, [accessToken, household, mode, range.end, range.start]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleExport = useCallback(async () => {
    if (!accessToken || !household) return;
    try {
      const result = await api.exportData(accessToken, household.id, {
        format: 'CSV',
        mode,
        from: range.start,
        to: range.end,
        content: 'TRANSACTIONS',
        includeReversed,
      });
      setExportResult(`${result.fileName} · ${result.rowCount} linhas`);
    } catch (cause) {
      setExportResult(null);
      setError(
        cause instanceof ApiRequestError ? cause.message : 'Não foi possível exportar agora.',
      );
    }
  }, [accessToken, household, includeReversed, mode, range.end, range.start]);

  /** Escala do gráfico de evolução: o maior valor vira a barra cheia. */
  const maxMonth = useMemo(
    () =>
      Math.max(
        1,
        ...(months?.months ?? []).map((month) => Math.max(month.incomeMinor, month.expenseMinor)),
      ),
    [months],
  );

  /** "+ 12% vs julho": variação do resultado sobre o mês anterior. */
  const resultDelta = useMemo(() => {
    if (summary === null) return null;
    const anterior = summary.previousIncomeMinor - summary.previousExpenseMinor;
    if (anterior === 0) return null;
    return Math.trunc(((summary.resultMinor - anterior) / Math.abs(anterior)) * 100);
  }, [summary]);

  return (
    <View style={[styles.flex, { backgroundColor: colors.surface }]}>
      {/* O seletor de mês fica no cabeçalho, como na 1d (screenshot 4a). */}
      <ScreenHeader
        title={VIEW_TITLE[view]}
        onBack={view === 'OVERVIEW' ? onBack : () => setView('OVERVIEW')}
        size="screen"
        right={
          <MonthPicker
            label={monthLabel(range.start)}
            onPrevious={() => setMonthAnchor((current) => addMonths(current, -1))}
            onNext={() => setMonthAnchor((current) => addMonths(current, 1))}
          />
        }
      />

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingHorizontal: layout.screenPaddingH, paddingBottom: spacing.xxxl },
        ]}
      >
        {/* Segmented Competência|Caixa SEMPRE visível (tela 4a). */}
        <SegmentedControl
          testID="segmento-modo"
          options={[
            { value: 'ACCRUAL', label: 'Competência' },
            { value: 'CASH', label: 'Caixa' },
          ]}
          value={mode}
          onChange={setMode}
        />

        {error !== null ? (
          <View style={{ marginTop: spacing.lg }}>
            <RecoverableError
              message={error}
              onRetry={() => void load()}
              testID="erro-relatorios"
            />
          </View>
        ) : summary === null ? (
          <View style={{ marginTop: spacing.lg }}>
            <SkeletonList rows={5} />
          </View>
        ) : view === 'OVERVIEW' ? (
          <>
            {/* Três KPI com o rótulo em caixa alta e a seta, como no design. */}
            <View style={[styles.kpiRow, { marginTop: spacing.md }]}>
              <Card style={styles.kpiCard} testID="kpi-receitas">
                <Text variant="label" tone="income">
                  ↑ Receitas
                </Text>
                <Text variant="moneyRow" tone="income" numberOfLines={1} adjustsFontSizeToFit>
                  {formatMoney(minor(summary.incomeMinor))}
                </Text>
                <Text variant="rowMeta" tone="secondary">
                  {`previsto ${formatMoney(minor(summary.plannedIncomeMinor))}`}
                </Text>
              </Card>

              <Card style={styles.kpiCard} testID="kpi-despesas">
                <Text variant="label" tone="expense">
                  ↓ Despesas
                </Text>
                <Text variant="moneyRow" tone="expense" numberOfLines={1} adjustsFontSizeToFit>
                  {formatMoney(minor(summary.expenseMinor))}
                </Text>
                <Text variant="rowMeta" tone="secondary">
                  {`previsto ${formatMoney(minor(summary.plannedExpenseMinor))}`}
                </Text>
              </Card>

              <Card style={styles.kpiCard} testID="kpi-resultado">
                <Text variant="label" tone="secondary">
                  Resultado
                </Text>
                <Text
                  variant="moneyRow"
                  tone={summary.resultMinor < 0 ? 'expense' : 'income'}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                >
                  {formatMoney(minor(summary.resultMinor), { signDisplay: 'always' })}
                </Text>
                {/* "+ 12% vs julho": a comparação é com o mês anterior, nomeado. */}
                <Text
                  variant="rowMeta"
                  tone={resultDelta === null || resultDelta >= 0 ? 'income' : 'expense'}
                >
                  {resultDelta === null
                    ? 'sem mês anterior'
                    : `${resultDelta >= 0 ? '+' : '−'} ${Math.abs(resultDelta)}% vs ${longMonthLabel(addMonths(range.start, -1))}`}
                </Text>
              </Card>
            </View>

            {/* Gráfico de barras verticais pareadas, com o mês atual destacado. */}
            <View style={{ marginTop: spacing.md }}>
              <Card testID="card-evolucao">
                <Text variant="rowTitle">Evolução — últimos 6 meses</Text>
                {(months?.months ?? []).length === 0 ? (
                  <Text variant="rowMeta" tone="secondary" style={{ marginTop: spacing.sm }}>
                    Ainda não há histórico suficiente.
                  </Text>
                ) : (
                  <View style={[styles.chart, { marginTop: spacing.lg }]}>
                    {(months?.months ?? []).map((month, index, all) => {
                      const atual = index === all.length - 1;
                      return (
                        <View key={month.month} style={styles.chartColumn}>
                          <View style={styles.chartBars}>
                            <View
                              accessibilityRole="image"
                              accessibilityLabel={`Receitas de ${shortMonthLabel(month.month)}: ${formatMoney(minor(month.incomeMinor))}`}
                              style={[
                                styles.bar,
                                {
                                  backgroundColor: atual ? colors.brand : colors.income,
                                  borderTopLeftRadius: radius.sm / 2,
                                  borderTopRightRadius: radius.sm / 2,
                                  height: barHeight(month.incomeMinor, maxMonth),
                                },
                              ]}
                            />
                            <View
                              accessibilityRole="image"
                              accessibilityLabel={`Despesas de ${shortMonthLabel(month.month)}: ${formatMoney(minor(month.expenseMinor))}`}
                              style={[
                                styles.bar,
                                {
                                  backgroundColor: colors.expense,
                                  borderTopLeftRadius: radius.sm / 2,
                                  borderTopRightRadius: radius.sm / 2,
                                  height: barHeight(month.expenseMinor, maxMonth),
                                },
                              ]}
                            />
                          </View>
                          <Text
                            variant="rowMeta"
                            tone={atual ? 'primary' : 'secondary'}
                            style={styles.chartLabel}
                          >
                            {shortMonthLabel(month.month)}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                )}
                <View style={[styles.legend, { marginTop: spacing.sm }]}>
                  <Text variant="rowMeta" tone="income">
                    ■ Receitas
                  </Text>
                  <Text variant="rowMeta" tone="expense">
                    ■ Despesas
                  </Text>
                </View>
              </Card>
            </View>

            {/* Lista de navegação do design, com os cinco destinos. */}
            <View style={{ marginTop: spacing.md }}>
              <Card padded={false} testID="card-navegacao">
                <ListRow
                  first
                  title="Por categoria"
                  showChevron
                  testID="link-categoria"
                  onPress={() => setView('CATEGORY')}
                />
                <ListRow
                  title="Por membro"
                  showChevron
                  testID="link-membro"
                  onPress={() => setView('MEMBER')}
                />
                {/* "Por conta e cartão" e "Parcelamentos e faturas" estão na
                    lista do screenshot, mas nem o SCREEN-SPECS nem os
                    screenshots descrevem essas telas. Linha que não leva a
                    lugar nenhum é pior que linha ausente: ficam de fora até o
                    pacote de design cobri-las (registrado no PROGRESS). */}
                <ListRow
                  title="Exportar dados"
                  showChevron
                  testID="abrir-exportacao"
                  onPress={() => setExporting(true)}
                />
              </Card>
            </View>
          </>
        ) : view === 'CATEGORY' ? (
          <View style={{ marginTop: spacing.lg }}>
            {categories === null || categories.items.length === 0 ? (
              <EmptyState
                title="Sem despesas no período"
                subtitle="Quando houver lançamentos, o relatório por categoria aparece aqui."
              />
            ) : (
              <>
                <Card padded={false} testID="card-categorias">
                  {categories.items.map((item, index) => (
                    <View
                      key={item.categoryId ?? `sem-categoria-${index}`}
                      style={[
                        styles.breakdownRow,
                        index > 0 && { borderTopColor: colors.divider, borderTopWidth: 1 },
                      ]}
                    >
                      <View style={styles.breakdownHeader}>
                        <Text variant="rowTitle">{item.categoryName}</Text>
                        <Text variant="moneyRow" tone="expense">
                          {`${formatMoney(minor(item.amountMinor))} · ${Math.floor(item.percent)}%`}
                        </Text>
                      </View>
                      {/* "cores variadas dos tokens" (SCREEN-SPECS §4b): cada
                          categoria pega um tom da paleta, na ordem da lista. */}
                      <ProgressBar
                        percent={item.percent}
                        tone={CATEGORY_TONES[index % CATEGORY_TONES.length] ?? 'expense'}
                        height={7}
                        accessibilityLabel={`${item.categoryName}: ${Math.floor(item.percent)}%`}
                      />
                    </View>
                  ))}
                </Card>
                <View style={{ marginTop: spacing.md }}>
                  <Banner
                    kind="info"
                    testID="banner-categoria"
                    message="Estornos não compõem os totais. Pagamentos de fatura não aparecem aqui: as despesas já foram as compras do cartão."
                  />
                </View>
              </>
            )}
          </View>
        ) : (
          <View style={{ marginTop: spacing.lg }}>
            {members === null || members.items.length === 0 ? (
              <EmptyState
                title="Sem despesas no período"
                subtitle="Quando houver lançamentos, o relatório por membro aparece aqui."
              />
            ) : (
              <>
                <Card padded={false} testID="card-membros">
                  {members.items.map((item, index) => (
                    <View
                      key={item.memberId}
                      style={[
                        styles.breakdownRow,
                        index > 0 && { borderTopColor: colors.divider, borderTopWidth: 1 },
                      ]}
                    >
                      <View style={styles.breakdownHeader}>
                        <Text variant="rowTitle">{item.memberName}</Text>
                        <Text variant="moneyRow" tone="expense">
                          {`${formatMoney(minor(item.amountMinor))} · ${Math.floor(item.percent)}%`}
                        </Text>
                      </View>
                      <ProgressBar
                        percent={item.percent}
                        tone="brand"
                        height={7}
                        accessibilityLabel={`${item.memberName}: ${Math.floor(item.percent)}%`}
                      />
                      {item.fromAllocationsMinor > 0 ? (
                        <Text variant="rowMeta" tone="secondary">
                          {`${formatMoney(minor(item.fromAllocationsMinor))} vieram de rateio`}
                        </Text>
                      ) : null}
                    </View>
                  ))}
                </Card>
                <View style={{ marginTop: spacing.md }}>
                  <Banner
                    kind="info"
                    testID="banner-membro"
                    message="✓ Soma dos rateios = valor total (validado pelo servidor). Membros só veem as contas visíveis para eles."
                  />
                </View>
              </>
            )}
          </View>
        )}
      </ScrollView>

      {/* 4d — Exportação */}
      <BottomSheet
        visible={exporting}
        onClose={() => setExporting(false)}
        title="Exportar dados"
        testID="sheet-exportacao"
        footer={
          <Button
            testID="gerar-csv"
            label={`Gerar CSV · ${monthLabel(range.start)}`}
            onPress={handleExport}
          />
        }
      >
        <View style={styles.chips}>
          <ChoiceChip label="CSV" selected onPress={() => undefined} testID="formato-csv" />
        </View>

        <View style={{ marginTop: spacing.md }}>
          <Card>
            <View style={styles.breakdownHeader}>
              <Text variant="rowTitle">Incluir estornos</Text>
              <Toggle
                testID="toggle-estornos"
                value={includeReversed}
                onValueChange={setIncludeReversed}
                accessibilityLabel="Incluir estornos"
              />
            </View>
          </Card>
        </View>

        <View style={{ marginTop: spacing.md }}>
          <Banner
            kind="warning"
            testID="banner-exportacao"
            message="Exportações são registradas na atividade da família. Filhos supervisionados não exportam dados amplos."
          />
        </View>

        {exportResult === null ? null : (
          <View style={{ marginTop: spacing.md }}>
            <Banner
              kind="info"
              message={`Arquivo gerado: ${exportResult}`}
              testID="resultado-exportacao"
            />
          </View>
        )}
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingTop: 4 },
  kpiRow: { flexDirection: 'row', gap: 8 },
  kpiCard: { flex: 1, gap: 2 },
  // Gráfico de barras verticais: uma coluna por mês, duas barras por coluna.
  chart: { flexDirection: 'row', gap: 10 },
  chartColumn: { alignItems: 'center', flex: 1, gap: 6 },
  chartBars: { alignItems: 'flex-end', flexDirection: 'row', gap: 3, height: CHART_HEIGHT },
  // Largura fixa: com um mês só, barras em `flex` esticariam pela tela toda.
  bar: { width: 18 },
  chartLabel: { textAlign: 'center' },
  legend: { flexDirection: 'row', gap: 12 },
  breakdownRow: { gap: 5, paddingVertical: 11 },
  breakdownHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  chips: { flexDirection: 'row', gap: 8 },
});
