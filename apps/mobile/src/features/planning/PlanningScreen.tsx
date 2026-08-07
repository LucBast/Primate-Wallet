/**
 * Tela 1d — Planejamento (screenshots/1d-planejamento.png).
 *
 * Blocos, na ordem do screenshot:
 *   1. Cabeçalho: "Planejamento" + seletor de mês "‹ Ago 2026 ›" à direita
 *   2. Segmented "A pagar | A receber | Calendário"
 *   3. Três mini-cards: PREVISTO / PAGO (income) / FALTA PAGAR (warning)
 *   4. Listas agrupadas: "VENCIDAS · N" (card com borda danger), "ESTA SEMANA",
 *      "MAIS ADIANTE"
 *   5. BottomNav com Planejamento ativo (a barra é da AppTabs)
 *
 * A linha de conta prevista NÃO usa StatusChip: o design põe o status como
 * texto na própria linha de meta, com o ponto e a cor semântica
 * (COMPONENT-SPECS §ListRow, "meta 10.5 textSecondary — ou cor semântica
 * quando é status"). A ação "Dar baixa ›" / "Completar ›" fica à direita,
 * abaixo do valor, e só aparece em conta vencida ou parcial.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import type { PlannedEntry, PlannedEntryNature, PlanningSummary } from '@ff/api-contracts';
import {
  addDays,
  addMonths,
  familyToday,
  formatDate,
  formatMoney,
  isoDate,
  minor,
  monthRange,
} from '@ff/domain';
import { Card, ListRow, SectionLabel, StatCard } from '../../components/Card';
import { SegmentedControl } from '../../components/Chip';
import { MonthPicker } from '../../components/MonthPicker';
import { ProgressBar } from '../../components/ProgressBar';
import { ScreenHeader } from '../../components/ScreenHeader';
import { EmptyState, RecoverableError, SkeletonList } from '../../components/states';
import { Text, type TextTone } from '../../design-system/Text';
import { useTheme } from '../../design-system/theme';
import { icons, iconSize } from '../../design-system/icons';
import { ApiRequestError } from '../../services/api-client';
import { dayMonth, dueLabel, monthLabel } from '../../services/dates';
import { useSessionStore } from '../auth/session-store';
import { useActiveHousehold } from '../household/household-store';
import * as api from './planning-api';

type Tab = 'PAYABLE' | 'RECEIVABLE' | 'CALENDAR';

export type PlanningScreenProps = {
  readonly onNewEntry: (nature: PlannedEntryNature) => void;
  readonly onSettle: (entry: PlannedEntry) => void;
  readonly onOpenEntry: (entry: PlannedEntry) => void;
};

/**
 * Linha de status da conta prevista, com a copy final do screenshot.
 *
 * Os rótulos concordam com "conta": Aberta, Vencida, Paga, Cancelada. Parcial
 * vem antes de vencida porque é assim que o design mostra a segunda linha do
 * card VENCIDAS ("● Parcial · falta R$ 510,10 de R$ 910,10").
 */
function statusLine(entry: PlannedEntry): { readonly text: string; readonly tone: TextTone } {
  const paga = entry.nature === 'PAYABLE' ? 'Paga' : 'Recebida';

  if (entry.status === 'CANCELED') return { text: '● Cancelada', tone: 'secondary' };

  if (entry.status === 'SETTLED') {
    const quando = entry.lastSettlementDate ?? entry.dueDate;
    const onde = entry.lastSettlementAccountName ?? entry.expectedAccountName;
    return {
      text: `● ${paga} em ${dayMonth(quando)}${onde === null ? '' : ` · ${onde}`}`,
      tone: 'income',
    };
  }

  if (entry.status === 'PARTIAL') {
    return {
      text: `● Parcial · falta ${formatMoney(minor(entry.outstandingMinor))} de ${formatMoney(minor(entry.originalAmountMinor))}`,
      tone: 'warning',
    };
  }

  if (entry.overdue) {
    const dias = `${entry.overdueDays} ${entry.overdueDays === 1 ? 'dia' : 'dias'}`;
    const quem = entry.memberName === null ? '' : ` · ${entry.memberName}`;
    return { text: `● Vencida há ${dias} · ${dayMonth(entry.dueDate)}${quem}`, tone: 'danger' };
  }

  // "recorrente" e "parcelamento" são exclusivos entre si (contrato do §3).
  const origem =
    entry.recurrenceRuleId !== null
      ? ' · recorrente'
      : entry.installmentGroupId !== null
        ? ' · parcelamento'
        : '';
  return { text: `● Aberta · vence ${dueLabel(entry.dueDate)}${origem}`, tone: 'secondary' };
}

/** "Financiamento carro · 14/48" — a parcela vai no título, não na meta. */
function rowTitle(entry: PlannedEntry): string {
  if (entry.installmentTotal === null || entry.installmentNumber === null) return entry.description;
  const numero = String(entry.installmentNumber).padStart(2, '0');
  const total = String(entry.installmentTotal).padStart(2, '0');
  return `${entry.description} · ${numero}/${total}`;
}

export function PlanningScreen({
  onNewEntry,
  onSettle,
  onOpenEntry,
}: PlanningScreenProps): React.JSX.Element {
  const { colors, layout, spacing } = useTheme();
  const accessToken = useSessionStore((state) => state.accessToken);
  const household = useActiveHousehold();

  const [tab, setTab] = useState<Tab>('PAYABLE');
  const [monthAnchor, setMonthAnchor] = useState(() =>
    isoDate(new Date().toISOString().slice(0, 10)),
  );
  const [entries, setEntries] = useState<PlannedEntry[] | null>(null);
  const [summary, setSummary] = useState<PlanningSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const range = useMemo(() => monthRange(monthAnchor), [monthAnchor]);
  const nature: PlannedEntryNature = tab === 'RECEIVABLE' ? 'RECEIVABLE' : 'PAYABLE';

  const load = useCallback(async () => {
    if (!accessToken || !household) return;
    setError(null);
    try {
      const result = await api.listPlannedEntries(accessToken, household.id, {
        nature,
        from: range.start,
        to: range.end,
      });
      setEntries(result.items);
      setSummary(result.summary);
    } catch (cause) {
      setError(
        cause instanceof ApiRequestError
          ? cause.message
          : 'Não foi possível carregar o planejamento agora.',
      );
    }
  }, [accessToken, household, nature, range.end, range.start]);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * Agrupa em Vencidas / Esta semana / Mais adiante, como no screenshot.
   * As pagas continuam na lista, no grupo do vencimento delas — o design
   * mostra "Plano de saúde" riscado dentro de MAIS ADIANTE.
   *
   * Conta já resolvida com vencimento anterior a hoje não é "vencida" nem
   * está no futuro: o screenshot não cobre esse caso, e em vez de inventar
   * uma quarta seção ela entra em "Esta semana", o grupo existente mais
   * próximo (docs/21-DECISIONS D-047).
   */
  const groups = useMemo(() => {
    const today =
      household === null
        ? isoDate(new Date().toISOString().slice(0, 10))
        : familyToday(household.timezone);
    const weekEnd = addDays(today, 7);
    const list = entries ?? [];
    return {
      overdue: list.filter((entry) => entry.overdue),
      thisWeek: list.filter((entry) => !entry.overdue && entry.dueDate <= weekEnd),
      later: list.filter((entry) => !entry.overdue && entry.dueDate > weekEnd),
    };
  }, [entries, household]);

  const Calendar = icons.planejamento;

  const renderRow = (entry: PlannedEntry, index: number): React.JSX.Element => {
    const encerrada = entry.status === 'SETTLED' || entry.status === 'CANCELED';
    const status = statusLine(entry);
    // Só conta vencida ou parcial traz ação na linha (1d-planejamento.png).
    const acao = !encerrada && (entry.overdue || entry.status === 'PARTIAL');

    return (
      <ListRow
        key={entry.id}
        first={index === 0}
        testID={`previsto-${entry.id}`}
        title={rowTitle(entry)}
        titleStyle={encerrada ? styles.settled : undefined}
        meta={status.text}
        metaTone={status.tone}
        onPress={() => onOpenEntry(entry)}
        below={
          entry.status === 'PARTIAL' ? (
            <ProgressBar
              percent={entry.settledPercent}
              tone="warning"
              accessibilityLabel={`${entry.settledPercent}% pago`}
            />
          ) : undefined
        }
        right={
          <View style={styles.rowRight}>
            <Text variant="moneyRow" tone={entry.status === 'SETTLED' ? 'secondary' : 'primary'}>
              {formatMoney(minor(entry.originalAmountMinor))}
            </Text>
            {acao ? (
              <Pressable
                testID={`baixa-${entry.id}`}
                accessibilityRole="button"
                accessibilityLabel={entry.status === 'PARTIAL' ? 'Completar' : 'Dar baixa'}
                onPress={() => onSettle(entry)}
                hitSlop={8}
              >
                <Text variant="rowMeta" tone="brand">
                  {entry.status === 'PARTIAL' ? 'Completar ›' : 'Dar baixa ›'}
                </Text>
              </Pressable>
            ) : null}
          </View>
        }
      />
    );
  };

  const grupo = (titulo: string, itens: readonly PlannedEntry[], testID: string, danger = false) =>
    itens.length === 0 ? null : (
      <View style={{ marginTop: spacing.md }}>
        <SectionLabel tone={danger ? 'danger' : 'secondary'}>{titulo}</SectionLabel>
        <Card padded={false} tone={danger ? 'danger' : 'default'} testID={testID}>
          {itens.map(renderRow)}
        </Card>
      </View>
    );

  return (
    <View style={[styles.flex, { backgroundColor: colors.surface }]}>
      <ScreenHeader
        title="Planejamento"
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
        <SegmentedControl
          testID="segmento-planejamento"
          options={[
            { value: 'PAYABLE', label: 'A pagar' },
            { value: 'RECEIVABLE', label: 'A receber' },
            { value: 'CALENDAR', label: 'Calendário' },
          ]}
          value={tab}
          onChange={setTab}
        />

        {summary === null ? null : (
          <View style={[styles.miniCards, { marginTop: spacing.md }]}>
            <StatCard
              testID="kpi-previsto"
              label="Previsto"
              value={formatMoney(minor(summary.plannedMinor))}
            />
            <StatCard
              testID="kpi-pago"
              label={nature === 'PAYABLE' ? 'Pago' : 'Recebido'}
              value={formatMoney(minor(summary.settledMinor))}
              tone="income"
              labelTone="income"
            />
            <StatCard
              testID="kpi-falta"
              label={nature === 'PAYABLE' ? 'Falta pagar' : 'Falta receber'}
              value={formatMoney(minor(summary.outstandingMinor))}
              tone="warning"
              labelTone="warning"
            />
          </View>
        )}

        {tab === 'CALENDAR' ? (
          <View style={{ marginTop: spacing.md }}>
            <CalendarMonth entries={entries ?? []} start={range.start} onSelect={onOpenEntry} />
          </View>
        ) : error !== null ? (
          <View style={{ marginTop: spacing.md }}>
            <RecoverableError
              message={error}
              onRetry={() => void load()}
              testID="erro-planejamento"
            />
          </View>
        ) : entries === null ? (
          <View style={{ marginTop: spacing.md }}>
            <SkeletonList rows={5} />
          </View>
        ) : entries.length === 0 ? (
          <EmptyState
            icon={<Calendar size={iconSize.action} color={colors.brand} />}
            title={nature === 'PAYABLE' ? 'Nada a pagar neste mês' : 'Nada a receber neste mês'}
            subtitle="Cadastre o que já sabe que vai entrar ou sair para acompanhar o mês."
            actionLabel={nature === 'PAYABLE' ? '+ Nova conta a pagar' : '+ Nova conta a receber'}
            onAction={() => onNewEntry(nature)}
          />
        ) : (
          <>
            {grupo(`Vencidas · ${groups.overdue.length}`, groups.overdue, 'card-vencidas', true)}
            {grupo('Esta semana', groups.thisWeek, 'card-semana')}
            {grupo('Mais adiante', groups.later, 'card-adiante')}
          </>
        )}
      </ScrollView>
    </View>
  );
}

/** Calendário do mês: um ponto por dia com conta prevista. */
function CalendarMonth({
  entries,
  start,
  onSelect,
}: {
  readonly entries: readonly PlannedEntry[];
  readonly start: string;
  readonly onSelect: (entry: PlannedEntry) => void;
}): React.JSX.Element {
  const { colors, spacing } = useTheme();
  const byDay = useMemo(() => {
    const map = new Map<string, PlannedEntry[]>();
    for (const entry of entries) {
      const bucket = map.get(entry.dueDate);
      if (bucket) bucket.push(entry);
      else map.set(entry.dueDate, [entry]);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [entries]);

  if (byDay.length === 0) {
    return (
      <EmptyState
        title="Nenhuma data marcada"
        subtitle={`Nada previsto para ${formatDate(isoDate(start)).slice(3)}.`}
      />
    );
  }

  return (
    <Card padded={false} testID="card-calendario">
      {byDay.map(([day, items], index) => (
        <ListRow
          key={day}
          first={index === 0}
          title={formatDate(isoDate(day))}
          meta={items.map((item) => item.description).join(' · ')}
          onPress={() => {
            const first = items[0];
            if (first) onSelect(first);
          }}
          right={
            <Text
              variant="moneyRow"
              tone={items.some((item) => item.overdue) ? 'danger' : 'primary'}
              style={{ marginRight: spacing.xs, color: colors.textPrimary }}
            >
              {formatMoney(minor(items.reduce((sum, item) => sum + item.originalAmountMinor, 0)))}
            </Text>
          }
        />
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingTop: 4 },
  miniCards: { flexDirection: 'row', gap: 8 },
  rowRight: { alignItems: 'flex-end', gap: 2 },
  settled: { textDecorationLine: 'line-through' },
});
