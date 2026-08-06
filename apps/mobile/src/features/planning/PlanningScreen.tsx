/**
 * Tela 1d — Planejamento (screenshots/1d-planejamento.png).
 *
 * Blocos, na ordem da especificação:
 *   1. Título + mês navegável
 *   2. Segmented "A pagar | A receber | Calendário"
 *   3. Três mini-cards: Previsto / Pago (income) / Falta pagar (warning)
 *   4. Listas agrupadas: "Vencidas · N" (card com borda danger), "Esta semana",
 *      "Mais adiante". Linha vencida ou parcial mostra ProgressBar e a ação
 *      "Dar baixa ›" / "Completar ›". Paga fica com título riscado e status income.
 *   5. BottomNav com Planejamento ativo (a barra é da AppTabs)
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
import { Card, ListRow, SectionLabel } from '../../components/Card';
import { SegmentedControl } from '../../components/Chip';
import { ProgressBar } from '../../components/ProgressBar';
import { ScreenHeader } from '../../components/ScreenHeader';
import { StatusChip } from '../../components/StatusChip';
import { EmptyState, RecoverableError, SkeletonList } from '../../components/states';
import { Text } from '../../design-system/Text';
import { useTheme } from '../../design-system/theme';
import { icons, iconSize } from '../../design-system/icons';
import { ApiRequestError } from '../../services/api-client';
import { useSessionStore } from '../auth/session-store';
import { useActiveHousehold } from '../household/household-store';
import * as api from './planning-api';

const MONTH_FORMAT = new Intl.DateTimeFormat('pt-BR', { month: 'short', year: 'numeric' });

type Tab = 'PAYABLE' | 'RECEIVABLE' | 'CALENDAR';

export type PlanningScreenProps = {
  readonly onNewEntry: (nature: PlannedEntryNature) => void;
  readonly onSettle: (entry: PlannedEntry) => void;
  readonly onOpenEntry: (entry: PlannedEntry) => void;
};

/** Chip de status da linha, com a copy final da especificação. */
function statusFor(entry: PlannedEntry): React.JSX.Element {
  if (entry.status === 'CANCELED') return <StatusChip status="estornado" />;
  if (entry.status === 'SETTLED') {
    return <StatusChip status={entry.nature === 'PAYABLE' ? 'pago' : 'recebido'} />;
  }
  if (entry.overdue) {
    return (
      <StatusChip
        status="vencido"
        detail={`há ${entry.overdueDays} ${entry.overdueDays === 1 ? 'dia' : 'dias'}`}
      />
    );
  }
  if (entry.status === 'PARTIAL') {
    return (
      <StatusChip status="parcial" detail={`falta ${formatMoney(minor(entry.outstandingMinor))}`} />
    );
  }
  return <StatusChip status="aberto" />;
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

  /** Agrupa em Vencidas / Esta semana / Mais adiante, como no screenshot. */
  const groups = useMemo(() => {
    const today =
      household === null
        ? isoDate(new Date().toISOString().slice(0, 10))
        : familyToday(household.timezone);
    const weekEnd = addDays(today, 7);
    const list = entries ?? [];
    return {
      overdue: list.filter((entry) => entry.overdue),
      thisWeek: list.filter(
        (entry) => !entry.overdue && entry.dueDate >= today && entry.dueDate <= weekEnd,
      ),
      later: list.filter((entry) => !entry.overdue && entry.dueDate > weekEnd),
      settled: list.filter((entry) => entry.status === 'SETTLED'),
    };
  }, [entries, household]);

  const Prev = icons.anterior;
  const Next = icons.proximo;
  const Calendar = icons.planejamento;

  const renderRow = (entry: PlannedEntry, index: number): React.JSX.Element => {
    const isSettled = entry.status === 'SETTLED';
    const showProgress = entry.status === 'PARTIAL';
    return (
      <View key={entry.id}>
        <ListRow
          first={index === 0}
          testID={`previsto-${entry.id}`}
          title={entry.description}
          meta={`vence ${formatDate(isoDate(entry.dueDate))}${entry.installmentTotal === null ? '' : ` · parcela ${String(entry.installmentNumber).padStart(2, '0')}/${String(entry.installmentTotal).padStart(2, '0')}`}`}
          onPress={() => onOpenEntry(entry)}
          right={
            <Text
              variant="moneyRow"
              tone={entry.nature === 'PAYABLE' ? 'expense' : 'income'}
              style={isSettled ? styles.settled : undefined}
            >
              {formatMoney(minor(entry.originalAmountMinor))}
            </Text>
          }
        />
        <View style={styles.rowExtras}>
          {statusFor(entry)}
          {showProgress ? (
            <View style={styles.progressWrap}>
              <ProgressBar
                percent={entry.settledPercent}
                tone="warning"
                accessibilityLabel={`${entry.settledPercent}% pago`}
              />
              <Text variant="rowMeta" tone="secondary">
                {`${entry.settledPercent}% pago · falta ${formatMoney(minor(entry.outstandingMinor))}`}
              </Text>
            </View>
          ) : null}
          {isSettled || entry.status === 'CANCELED' ? null : (
            <Pressable
              testID={`baixa-${entry.id}`}
              accessibilityRole="button"
              accessibilityLabel={entry.status === 'PARTIAL' ? 'Completar' : 'Dar baixa'}
              onPress={() => onSettle(entry)}
              hitSlop={8}
            >
              <Text variant="rowTitle" tone="brand">
                {entry.status === 'PARTIAL' ? 'Completar ›' : 'Dar baixa ›'}
              </Text>
            </Pressable>
          )}
        </View>
      </View>
    );
  };

  return (
    <View style={[styles.flex, { backgroundColor: colors.surface }]}>
      <ScreenHeader
        title="Planejamento"
        right={
          <Pressable
            testID="nova-conta-prevista"
            accessibilityRole="button"
            accessibilityLabel="Nova conta prevista"
            hitSlop={10}
            onPress={() => onNewEntry(nature)}
          >
            <Text variant="rowTitle" tone="brand">
              + Nova
            </Text>
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
        <View style={styles.monthRow}>
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
            testID="segmento-planejamento"
            options={[
              { value: 'PAYABLE', label: 'A pagar' },
              { value: 'RECEIVABLE', label: 'A receber' },
              { value: 'CALENDAR', label: 'Calendário' },
            ]}
            value={tab}
            onChange={setTab}
          />
        </View>

        {summary === null ? null : (
          <View style={[styles.miniCards, { marginTop: spacing.md }]}>
            <Card style={styles.miniCard}>
              <Text variant="rowMeta" tone="secondary">
                Previsto
              </Text>
              <Text variant="moneyRow">{formatMoney(minor(summary.plannedMinor))}</Text>
            </Card>
            <Card style={styles.miniCard}>
              <Text variant="rowMeta" tone="secondary">
                {nature === 'PAYABLE' ? 'Pago' : 'Recebido'}
              </Text>
              <Text variant="moneyRow" tone="income">
                {formatMoney(minor(summary.settledMinor))}
              </Text>
            </Card>
            <Card style={styles.miniCard}>
              <Text variant="rowMeta" tone="secondary">
                {nature === 'PAYABLE' ? 'Falta pagar' : 'Falta receber'}
              </Text>
              <Text variant="moneyRow" tone="warning">
                {formatMoney(minor(summary.outstandingMinor))}
              </Text>
            </Card>
          </View>
        )}

        {tab === 'CALENDAR' ? (
          <View style={{ marginTop: spacing.xl }}>
            <CalendarMonth entries={entries ?? []} start={range.start} onSelect={onOpenEntry} />
          </View>
        ) : error !== null ? (
          <View style={{ marginTop: spacing.lg }}>
            <RecoverableError
              message={error}
              onRetry={() => void load()}
              testID="erro-planejamento"
            />
          </View>
        ) : entries === null ? (
          <View style={{ marginTop: spacing.lg }}>
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
            {groups.overdue.length === 0 ? null : (
              <View style={{ marginTop: spacing.xl }}>
                <SectionLabel>{`VENCIDAS · ${groups.overdue.length}`}</SectionLabel>
                <Card padded={false} tone="danger" testID="card-vencidas">
                  {groups.overdue.map(renderRow)}
                </Card>
              </View>
            )}

            {groups.thisWeek.length === 0 ? null : (
              <View style={{ marginTop: spacing.xl }}>
                <SectionLabel>ESTA SEMANA</SectionLabel>
                <Card padded={false} testID="card-semana">
                  {groups.thisWeek.map(renderRow)}
                </Card>
              </View>
            )}

            {groups.later.length === 0 ? null : (
              <View style={{ marginTop: spacing.xl }}>
                <SectionLabel>MAIS ADIANTE</SectionLabel>
                <Card padded={false} testID="card-adiante">
                  {groups.later.map(renderRow)}
                </Card>
              </View>
            )}
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
  monthRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'center',
  },
  miniCards: { flexDirection: 'row', gap: 8 },
  miniCard: { flex: 1, gap: 2 },
  rowExtras: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingBottom: 10,
  },
  progressWrap: { flex: 1, gap: 3, minWidth: 140 },
  settled: { textDecorationLine: 'line-through' },
});
