/**
 * Tela 1g — Movimentações (screenshots/1g-movimentacoes.png).
 *
 * Blocos, na ordem da especificação:
 *   1. Título + busca "⌕ Buscar por descrição, valor, favorecido…"
 *   2. Filtros pill em rolagem horizontal: Período · Conta · Categoria ·
 *      Membro · Status (o ativo fica brand com ✕ para limpar)
 *   3. Banner offline quando aplicável
 *   4. Lista agrupada por dia, com as regras de leitura da especificação:
 *      transferência com valor neutro e "não é despesa"; pendente de aprovação
 *      em pending, com "não afeta saldo"; estornada riscada com o motivo;
 *      pagamento de fatura com "não vira nova despesa"; reembolso em income.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import type { Transaction, TransactionType } from '@ff/api-contracts';
import { familyToday, formatMoney, isoDate, minor, monthRange } from '@ff/domain';
import { Banner } from '../../components/Banner';
import { Card, IconBadge, ListRow, SectionLabel } from '../../components/Card';
import { ScreenHeader } from '../../components/ScreenHeader';
import { EmptyState, RecoverableError, SkeletonList } from '../../components/states';
import { Text } from '../../design-system/Text';
import { useTheme } from '../../design-system/theme';
import { icons, iconSize } from '../../design-system/icons';
import { font, type as typeTokens } from '../../design-system/tokens';
import { fixedColors } from '../../design-system/spec-values';
import { ApiRequestError } from '../../services/api-client';
import { readList, writeList } from '../../offline/cache';
import { SyncBanner } from '../../offline/SyncBanner';
import { dayHeader, longMonthLabel } from '../../services/dates';
import { useSessionStore } from '../auth/session-store';
import { useActiveHousehold } from '../household/household-store';
import { useReferenceStore } from '../household/reference-store';
import * as api from './transaction-api';

/** Microcopy fixa por tipo, verbatim da especificação da tela 1g. */
const TYPE_NOTE: Partial<Record<TransactionType, string>> = {
  TRANSFER: 'não é despesa',
  CARD_PAYMENT: 'não vira nova despesa',
  CARD_PURCHASE: 'consome limite do cartão',
};

/**
 * Ícone da NATUREZA da movimentação (COMPONENT-SPECS §Ícones por categoria):
 * "arrow-down expense · arrow-up income · arrows-left-right transferência
 * (chipNeutral/textTertiary) · rotate-ccw estorno · credit-card pagamento de
 * fatura · plus-minus ajuste". Compra no cartão é despesa: usa a seta, não o
 * cartão — o cartão é do PAGAMENTO da fatura.
 */
function visualFor(
  type: TransactionType,
  colors: ReturnType<typeof useTheme>['colors'],
): { Icon: (typeof icons)[keyof typeof icons]; color: string; background: string } {
  switch (type) {
    case 'INCOME':
    case 'REFUND':
      return { Icon: icons.receita, color: colors.income, background: colors.incomeSoft };
    case 'TRANSFER':
      return {
        Icon: icons.transferencia,
        color: colors.textTertiary,
        background: colors.chipNeutral,
      };
    case 'CARD_PAYMENT':
      return { Icon: icons.cartao, color: colors.info, background: colors.infoSoft };
    case 'REVERSAL':
      return { Icon: icons.estorno, color: colors.textTertiary, background: colors.chipNeutral };
    case 'ADJUSTMENT':
      return { Icon: icons.ajuste, color: colors.warning, background: colors.warningSoft };
    default:
      return { Icon: icons.despesa, color: colors.expense, background: colors.expenseSoft };
  }
}

/**
 * Meta da linha, na ordem do screenshot: quando há estado, é ele que fala
 * ("● Aguardando aprovação · não afeta saldo"); quando não há, a linha diz de
 * onde saiu — conta · membro · categoria. O tipo da movimentação NÃO aparece:
 * quem diz o tipo é o ícone.
 */
function metaFor(item: Transaction): string {
  if (item.status === 'REVERSED') {
    return [
      '● Estornada',
      item.reversalReason === null ? null : `motivo: ${item.reversalReason}`,
      item.reversedByName === null ? null : `por ${item.reversedByName}`,
    ]
      .filter((part): part is string => Boolean(part))
      .join(' · ');
  }
  if (item.status === 'PENDING_APPROVAL') return '● Aguardando aprovação · não afeta saldo';

  if (item.transactionType === 'TRANSFER') {
    return [
      item.accountName === null || item.destinationAccountName === null
        ? item.accountName
        : `${item.accountName} → ${item.destinationAccountName}`,
      TYPE_NOTE.TRANSFER,
    ]
      .filter((part): part is string => Boolean(part))
      .join(' · ');
  }

  return [item.accountName, item.memberName, item.categoryName, TYPE_NOTE[item.transactionType]]
    .filter((part): part is string => Boolean(part))
    .join(' · ');
}

type FilterKey = 'periodo' | 'conta' | 'categoria' | 'membro' | 'status';

export type TransactionsScreenProps = {
  readonly onOpen: (transaction: Transaction) => void;
};

export function TransactionsScreen({ onOpen }: TransactionsScreenProps): React.JSX.Element {
  const { colors, layout, radius, spacing } = useTheme();
  const accessToken = useSessionStore((state) => state.accessToken);
  const household = useActiveHousehold();
  const reference = useReferenceStore();

  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<Partial<Record<FilterKey, string>>>({});
  /** O período começa aplicado no mês corrente, como o "Agosto ✕" do design. */
  const [period, setPeriod] = useState(true);
  const [items, setItems] = useState<Transaction[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const today =
    household === null
      ? isoDate(new Date().toISOString().slice(0, 10))
      : familyToday(household.timezone);
  const range = useMemo(() => monthRange(today), [today]);

  const semFiltro =
    period &&
    search.trim() === '' &&
    filters.conta === undefined &&
    filters.categoria === undefined &&
    filters.membro === undefined &&
    filters.status === undefined;

  const load = useCallback(async () => {
    if (!accessToken || !household) return;
    setError(null);
    try {
      const page = await api.listTransactions(accessToken, household.id, {
        ...(period ? { from: range.start, to: range.end } : {}),
        ...(search.trim() === '' ? {} : { search: search.trim() }),
        ...(filters.conta === undefined ? {} : { accountId: filters.conta }),
        ...(filters.categoria === undefined ? {} : { categoryId: filters.categoria }),
        ...(filters.membro === undefined ? {} : { memberId: filters.membro }),
        ...(filters.status === undefined
          ? {}
          : { status: filters.status as Transaction['status'] }),
        pageSize: 50,
      });
      setItems([...page.items]);
      setOffline(false);
      // Só o mês corrente sem filtro alimenta o cache: é o que a leitura
      // offline promete (docs/11 §1, "movimentações recentes"). Guardar o
      // resultado de uma busca faria o cache mostrar uma lista filtrada como se
      // fosse o extrato inteiro.
      if (semFiltro) void writeList('transactions', household.id, page.items);
    } catch (cause) {
      if (cause instanceof ApiRequestError && cause.isOffline) {
        setOffline(true);
        // Offline não é tela vazia: mostra o que foi visto por último. Se o
        // cache também estiver vazio, mostra o estado vazio — esqueleto para
        // sempre faria parecer que ainda está carregando algo.
        setItems(await readList<Transaction>('transactions', household.id));
        return;
      }
      setError(
        cause instanceof ApiRequestError
          ? cause.message
          : 'Não foi possível carregar as movimentações agora.',
      );
    }
  }, [accessToken, filters, household, period, range.end, range.start, search, semFiltro]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), search === '' ? 0 : 300);
    return () => clearTimeout(timer);
  }, [load, search]);

  /**
   * Agrupa por dia, como no screenshot.
   *
   * A movimentação de estorno não vira linha própria: o screenshot mostra a
   * original riscada com "● Estornada · motivo: … · por Ana", e listar as duas
   * contaria o mesmo fato duas vezes. O registro continua existindo — é ele
   * que carrega o motivo exibido na linha original.
   */
  const days = useMemo(() => {
    const groups = new Map<string, Transaction[]>();
    for (const item of items ?? []) {
      if (item.transactionType === 'REVERSAL') continue;
      const day = item.occurredAt.slice(0, 10);
      const bucket = groups.get(day);
      if (bucket) bucket.push(item);
      else groups.set(day, [item]);
    }
    return [...groups.entries()];
  }, [items]);

  const toggleFilter = useCallback((key: FilterKey, value: string | undefined) => {
    setFilters((current) => {
      const next = { ...current };
      if (value === undefined || next[key] === value) delete next[key];
      else next[key] = value;
      return next;
    });
  }, []);

  const Buscar = icons.buscar;

  return (
    <View style={[styles.flex, { backgroundColor: colors.surface }]}>
      <ScreenHeader title="Movimentações" />

      <View style={{ paddingHorizontal: layout.screenPaddingH }}>
        <View
          style={[
            styles.search,
            {
              backgroundColor: colors.surfaceElevated,
              borderColor: colors.border,
              borderRadius: radius.lg,
            },
          ]}
        >
          <Buscar size={iconSize.row} color={colors.textSecondary} />
          <TextInput
            testID="campo-busca"
            accessibilityLabel="Buscar movimentações"
            value={search}
            onChangeText={setSearch}
            placeholder="Buscar por descrição, valor, favorecido…"
            placeholderTextColor={colors.textSecondary}
            style={[
              styles.searchInput,
              {
                color: colors.textPrimary,
                fontFamily: font.bold,
                fontSize: typeTokens.rowTitle.fontSize,
              },
            ]}
          />
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        // Sem isto a fila de filtros é espremida pela lista e os rótulos ficam
        // cortados: num ScrollView horizontal a altura vem do conteúdo, e o
        // irmão de baixo precisa ser o único a crescer.
        style={styles.filtersRow}
        contentContainerStyle={[
          styles.filters,
          { paddingHorizontal: layout.screenPaddingH, paddingVertical: spacing.md },
        ]}
      >
        {/* "Agosto ✕" — o período começa aplicado, como no screenshot. */}
        <FilterPill
          label="Período"
          value={
            period
              ? longMonthLabel(range.start).replace(/^./, (letter) => letter.toUpperCase())
              : undefined
          }
          onPress={() => setPeriod(true)}
          onClear={() => setPeriod(false)}
        />
        <FilterPill
          label="Conta"
          value={reference.accounts.find((account) => account.id === filters.conta)?.name}
          onPress={() => {
            const next = reference.accounts.find((account) => account.id !== filters.conta);
            toggleFilter('conta', filters.conta === undefined ? next?.id : undefined);
          }}
          onClear={() => toggleFilter('conta', undefined)}
        />
        <FilterPill
          label="Categoria"
          value={reference.categories.find((category) => category.id === filters.categoria)?.name}
          onPress={() => {
            const next = reference.categories.find((category) => category.id !== filters.categoria);
            toggleFilter('categoria', filters.categoria === undefined ? next?.id : undefined);
          }}
          onClear={() => toggleFilter('categoria', undefined)}
        />
        <FilterPill
          label="Membro"
          value={reference.members.find((member) => member.id === filters.membro)?.displayName}
          onPress={() => {
            const next = reference.members.find((member) => member.id !== filters.membro);
            toggleFilter('membro', filters.membro === undefined ? next?.id : undefined);
          }}
          onClear={() => toggleFilter('membro', undefined)}
        />
        <FilterPill
          label="Status"
          value={filters.status === 'REVERSED' ? 'Estornadas' : undefined}
          onPress={() =>
            toggleFilter('status', filters.status === 'REVERSED' ? undefined : 'REVERSED')
          }
          onClear={() => toggleFilter('status', undefined)}
        />
      </ScrollView>

      <ScrollView
        style={styles.list}
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
        <SyncBanner onRetry={() => void load()} />

        {offline ? (
          <View style={{ marginBottom: spacing.md }}>
            <Banner
              kind="offline"
              testID="banner-offline"
              message="Sem conexão — mostrando dados salvos."
            />
          </View>
        ) : null}

        {error !== null ? (
          <RecoverableError
            message={error}
            onRetry={() => void load()}
            testID="erro-movimentacoes"
          />
        ) : items === null ? (
          <SkeletonList rows={6} />
        ) : items.length === 0 ? (
          <EmptyState
            title="Nenhuma movimentação"
            subtitle="Use o botão + para registrar a primeira despesa ou receita."
          />
        ) : (
          days.map(([day, group]) => (
            <View key={day} style={{ marginBottom: spacing.xl }}>
              <SectionLabel>{dayHeader(day, today)}</SectionLabel>
              <Card padded={false} testID={`dia-${day}`}>
                {group.map((item, index) => {
                  const reversed = item.status === 'REVERSED';
                  // Movimentação estornada troca o ícone da natureza pelo do
                  // estorno, em neutro — é assim que o screenshot marca a
                  // linha riscada de "Jantar restaurante".
                  const visual = visualFor(reversed ? 'REVERSAL' : item.transactionType, colors);
                  const pending = item.status === 'PENDING_APPROVAL';
                  const neutral =
                    item.transactionType === 'TRANSFER' ||
                    item.transactionType === 'CARD_PAYMENT' ||
                    item.transactionType === 'REVERSAL';
                  const positive =
                    item.transactionType === 'INCOME' || item.transactionType === 'REFUND';

                  return (
                    <ListRow
                      key={item.id}
                      first={index === 0}
                      testID={`movimentacao-${item.id}`}
                      title={
                        item.transactionType === 'TRANSFER' && item.destinationAccountName !== null
                          ? `Transferência → ${item.destinationAccountName}`
                          : item.description
                      }
                      titleStyle={
                        reversed ? { ...styles.reversed, color: colors.textSecondary } : undefined
                      }
                      meta={metaFor(item)}
                      metaTone={pending ? 'pending' : 'secondary'}
                      onPress={() => onOpen(item)}
                      left={
                        <IconBadge background={visual.background}>
                          <visual.Icon size={iconSize.row} color={visual.color} />
                        </IconBadge>
                      }
                      right={
                        <Text
                          variant="moneyRow"
                          tone={
                            reversed || neutral
                              ? 'tertiary'
                              : pending
                                ? 'pending'
                                : positive
                                  ? 'income'
                                  : 'expense'
                          }
                        >
                          {/* Transferência, pagamento de fatura e estorno saem
                              sem sinal e em textTertiary: nenhum deles é
                              despesa nem receita (COMPONENT-SPECS §ListRow). */}
                          {neutral || reversed || pending
                            ? formatMoney(minor(item.amountMinor), { signDisplay: 'never' })
                            : formatMoney(minor(positive ? item.amountMinor : -item.amountMinor), {
                                signDisplay: 'always',
                              })}
                        </Text>
                      }
                    />
                  );
                })}
              </Card>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

/** Pill de filtro: ativo em brand com ✕ para limpar (screenshot 1g). */
function FilterPill({
  label,
  value,
  onPress,
  onClear,
}: {
  readonly label: string;
  readonly value: string | undefined;
  readonly onPress: () => void;
  readonly onClear: () => void;
}): React.JSX.Element {
  const { colors, radius } = useTheme();
  const active = value !== undefined;

  return (
    <Pressable
      testID={`filtro-${label.toLowerCase()}`}
      accessibilityRole="button"
      accessibilityLabel={active ? `${label}: ${value}. Toque para limpar` : label}
      accessibilityState={{ selected: active }}
      onPress={active ? onClear : onPress}
      style={[
        styles.pill,
        {
          backgroundColor: active ? colors.brand : colors.surfaceElevated,
          borderColor: active ? colors.brand : colors.border,
          borderRadius: radius.pill,
        },
      ]}
    >
      {/* Filtro ativo: branco sobre brand, nos dois temas. */}
      <Text variant="chip" style={{ color: active ? fixedColors.onBrand : colors.textPrimary }}>
        {active ? `${value} ✕` : label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: { flex: 1 },
  filtersRow: { flexGrow: 0 },
  content: { paddingTop: 4 },
  search: {
    alignItems: 'center',
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  searchInput: { flex: 1, padding: 0 },
  filters: { flexDirection: 'row', gap: 8 },
  pill: { borderWidth: 1, paddingHorizontal: 12, paddingVertical: 7 },
  chipRow: { paddingBottom: 10 },
  reversed: { textDecorationLine: 'line-through' },
});
