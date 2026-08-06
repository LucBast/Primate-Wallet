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
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
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
import { Card, SectionLabel } from '../../components/Card';
import { ChoiceChip, SegmentedControl } from '../../components/Chip';
import { ProgressBar } from '../../components/ProgressBar';
import { ScreenHeader } from '../../components/ScreenHeader';
import { Toggle } from '../../components/Toggle';
import { EmptyState, RecoverableError, SkeletonList } from '../../components/states';
import { Text } from '../../design-system/Text';
import { useTheme } from '../../design-system/theme';
import { icons, iconSize } from '../../design-system/icons';
import { ApiRequestError } from '../../services/api-client';
import { useSessionStore } from '../auth/session-store';
import { useActiveHousehold } from '../household/household-store';
import * as api from './report-api';

const MONTH_FORMAT = new Intl.DateTimeFormat('pt-BR', { month: 'short', year: 'numeric' });

type ReportView = 'OVERVIEW' | 'CATEGORY' | 'MEMBER';

export function ReportsScreen({ onBack }: { readonly onBack: () => void }): React.JSX.Element {
  const { colors, layout, spacing } = useTheme();
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

  const Prev = icons.anterior;
  const Next = icons.proximo;

  /** Escala do gráfico de evolução: o maior valor vira 100%. */
  const maxMonth = useMemo(
    () =>
      Math.max(
        1,
        ...(months?.months ?? []).map((month) => Math.max(month.incomeMinor, month.expenseMinor)),
      ),
    [months],
  );

  return (
    <View style={[styles.flex, { backgroundColor: colors.surface }]}>
      <ScreenHeader title="Relatórios" onBack={onBack} size="screen" />

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

        <View style={[styles.monthRow, { marginTop: spacing.md }]}>
          <Pressable
            testID="mes-anterior"
            accessibilityRole="button"
            accessibilityLabel="Mês anterior"
            hitSlop={10}
            onPress={() => setMonthAnchor((current) => addMonths(current, -1))}
          >
            <Prev size={iconSize.row} color={colors.textSecondary} />
          </Pressable>
          <Text variant="section">
            {MONTH_FORMAT.format(new Date(`${range.start}T12:00:00Z`)).replace('.', '')}
          </Text>
          <Pressable
            testID="mes-proximo"
            accessibilityRole="button"
            accessibilityLabel="Próximo mês"
            hitSlop={10}
            onPress={() => setMonthAnchor((current) => addMonths(current, 1))}
          >
            <Next size={iconSize.row} color={colors.textSecondary} />
          </Pressable>
        </View>

        <View style={{ marginTop: spacing.md }}>
          <SegmentedControl
            testID="segmento-visao"
            options={[
              { value: 'OVERVIEW', label: 'Geral' },
              { value: 'CATEGORY', label: 'Categoria' },
              { value: 'MEMBER', label: 'Membro' },
            ]}
            value={view}
            onChange={setView}
          />
        </View>

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
            <View style={[styles.kpiRow, { marginTop: spacing.lg }]}>
              <Card style={styles.kpiCard} testID="kpi-receitas">
                <Text variant="rowMeta" tone="secondary">
                  Receitas
                </Text>
                <Text variant="moneyRow" tone="income">
                  {formatMoney(minor(summary.incomeMinor))}
                </Text>
                <Text variant="rowMeta" tone="secondary">
                  {`previsto ${formatMoney(minor(summary.plannedIncomeMinor))}`}
                </Text>
                <Text
                  variant="rowMeta"
                  tone={summary.incomeMinor >= summary.previousIncomeMinor ? 'income' : 'expense'}
                >
                  {`${summary.incomeMinor >= summary.previousIncomeMinor ? '↑' : '↓'} vs mês anterior`}
                </Text>
              </Card>

              <Card style={styles.kpiCard} testID="kpi-despesas">
                <Text variant="rowMeta" tone="secondary">
                  Despesas
                </Text>
                <Text variant="moneyRow" tone="expense">
                  {formatMoney(minor(summary.expenseMinor))}
                </Text>
                <Text variant="rowMeta" tone="secondary">
                  {`previsto ${formatMoney(minor(summary.plannedExpenseMinor))}`}
                </Text>
                <Text
                  variant="rowMeta"
                  tone={summary.expenseMinor <= summary.previousExpenseMinor ? 'income' : 'expense'}
                >
                  {`${summary.expenseMinor <= summary.previousExpenseMinor ? '↓' : '↑'} vs mês anterior`}
                </Text>
              </Card>

              <Card style={styles.kpiCard} testID="kpi-resultado">
                <Text variant="rowMeta" tone="secondary">
                  Resultado
                </Text>
                <Text variant="moneyRow" tone={summary.resultMinor < 0 ? 'expense' : 'income'}>
                  {formatMoney(minor(summary.resultMinor), { signDisplay: 'always' })}
                </Text>
              </Card>
            </View>

            <View style={{ marginTop: spacing.xl }}>
              <SectionLabel>EVOLUÇÃO — ÚLTIMOS 6 MESES</SectionLabel>
              <Card testID="card-evolucao">
                {(months?.months ?? []).length === 0 ? (
                  <Text variant="rowMeta" tone="secondary">
                    Ainda não há histórico suficiente.
                  </Text>
                ) : (
                  (months?.months ?? []).map((month) => (
                    <View key={month.month} style={styles.evolutionRow}>
                      <Text variant="rowMeta" tone="secondary" style={styles.evolutionLabel}>
                        {month.month}
                      </Text>
                      <View style={styles.evolutionBars}>
                        <ProgressBar
                          percent={(month.incomeMinor * 100) / maxMonth}
                          tone="income"
                          height={5}
                          accessibilityLabel={`Receitas de ${month.month}`}
                        />
                        <ProgressBar
                          percent={(month.expenseMinor * 100) / maxMonth}
                          tone="expense"
                          height={5}
                          accessibilityLabel={`Despesas de ${month.month}`}
                        />
                      </View>
                      <Text variant="rowMeta" tone={month.resultMinor < 0 ? 'expense' : 'income'}>
                        {formatMoney(minor(month.resultMinor), { signDisplay: 'always' })}
                      </Text>
                    </View>
                  ))
                )}
                <View style={[styles.legend, { marginTop: spacing.sm }]}>
                  <Text variant="rowMeta" tone="income">
                    ● Receitas
                  </Text>
                  <Text variant="rowMeta" tone="expense">
                    ● Despesas
                  </Text>
                </View>
              </Card>
            </View>

            <View style={{ marginTop: spacing.xl }}>
              <Button
                testID="abrir-exportacao"
                label="Exportar dados"
                variant="secondary"
                onPress={() => setExporting(true)}
              />
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
                      <ProgressBar
                        percent={item.percent}
                        tone="expense"
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
            label={`Gerar CSV · ${MONTH_FORMAT.format(new Date(`${range.start}T12:00:00Z`)).replace('.', '')}`}
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
  monthRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'center',
  },
  kpiRow: { flexDirection: 'row', gap: 8 },
  kpiCard: { flex: 1, gap: 2 },
  evolutionRow: { alignItems: 'center', flexDirection: 'row', gap: 8, paddingVertical: 5 },
  evolutionLabel: { width: 58 },
  evolutionBars: { flex: 1, gap: 3 },
  legend: { flexDirection: 'row', gap: 12 },
  breakdownRow: { gap: 5, paddingVertical: 11 },
  breakdownHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  chips: { flexDirection: 'row', gap: 8 },
});
