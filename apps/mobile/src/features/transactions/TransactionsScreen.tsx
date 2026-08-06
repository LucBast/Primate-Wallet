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
import { formatDate, formatMoney, isoDate, minor } from '@ff/domain';
import { Card, IconBadge, ListRow, SectionLabel } from '../../components/Card';
import { ScreenHeader } from '../../components/ScreenHeader';
import { StatusChip } from '../../components/StatusChip';
import { EmptyState, RecoverableError, SkeletonList } from '../../components/states';
import { Text } from '../../design-system/Text';
import { useTheme } from '../../design-system/theme';
import { icons, iconSize } from '../../design-system/icons';
import { font, type as typeTokens } from '../../design-system/tokens';
import { ApiRequestError } from '../../services/api-client';
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

const TYPE_LABEL: Record<TransactionType, string> = {
  EXPENSE: 'Despesa',
  INCOME: 'Receita',
  TRANSFER: 'Transferência',
  CARD_PURCHASE: 'Compra no cartão',
  CARD_PAYMENT: 'Pagamento de fatura',
  ADJUSTMENT: 'Ajuste de saldo',
  REFUND: 'Reembolso',
  REVERSAL: 'Estorno',
};

/** Ícone e cor por tipo (UI-FIDELITY §Ícones). */
function iconFor(type: TransactionType) {
  switch (type) {
    case 'INCOME':
    case 'REFUND':
      return { Icon: icons.receita, tone: 'income' as const };
    case 'TRANSFER':
    case 'CARD_PAYMENT':
      return { Icon: icons.transferencia, tone: 'info' as const };
    case 'REVERSAL':
      return { Icon: icons.estorno, tone: 'secondary' as const };
    case 'CARD_PURCHASE':
      return { Icon: icons.cartao, tone: 'expense' as const };
    case 'ADJUSTMENT':
      return { Icon: icons.mais, tone: 'warning' as const };
    default:
      return { Icon: icons.despesa, tone: 'expense' as const };
  }
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
  const [items, setItems] = useState<Transaction[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!accessToken || !household) return;
    setError(null);
    try {
      const page = await api.listTransactions(accessToken, household.id, {
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
    } catch (cause) {
      if (cause instanceof ApiRequestError && cause.isOffline) {
        setOffline(true);
        return;
      }
      setError(
        cause instanceof ApiRequestError
          ? cause.message
          : 'Não foi possível carregar as movimentações agora.',
      );
    }
  }, [accessToken, filters, household, search]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), search === '' ? 0 : 300);
    return () => clearTimeout(timer);
  }, [load, search]);

  /** Agrupa por dia, como no screenshot. */
  const days = useMemo(() => {
    const groups = new Map<string, Transaction[]>();
    for (const item of items ?? []) {
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

  const Search = icons.movimentacoes;

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
          <Search size={iconSize.row} color={colors.textSecondary} />
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
        contentContainerStyle={[
          styles.filters,
          { paddingHorizontal: layout.screenPaddingH, paddingVertical: spacing.md },
        ]}
      >
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
        {offline ? (
          <View style={{ marginBottom: spacing.md }}>
            <Text variant="rowMeta" tone="info">
              ◌ Sem conexão — mostrando dados salvos
            </Text>
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
              <SectionLabel>{formatDate(isoDate(day)).toUpperCase()}</SectionLabel>
              <Card padded={false} testID={`dia-${day}`}>
                {group.map((item, index) => {
                  const { Icon } = iconFor(item.transactionType);
                  const reversed = item.status === 'REVERSED';
                  const pending = item.status === 'PENDING_APPROVAL';
                  const neutral =
                    item.transactionType === 'TRANSFER' || item.transactionType === 'CARD_PAYMENT';
                  const positive =
                    item.transactionType === 'INCOME' || item.transactionType === 'REFUND';

                  const note = TYPE_NOTE[item.transactionType];
                  const meta = [
                    TYPE_LABEL[item.transactionType],
                    item.categoryName,
                    item.memberName,
                    pending ? 'não afeta saldo' : note,
                    reversed && item.reason !== null ? `motivo: ${item.reason}` : null,
                  ]
                    .filter((part): part is string => Boolean(part))
                    .join(' · ');

                  return (
                    <View key={item.id}>
                      <ListRow
                        first={index === 0}
                        testID={`movimentacao-${item.id}`}
                        title={item.description}
                        meta={meta}
                        metaTone={pending ? 'pending' : 'secondary'}
                        onPress={() => onOpen(item)}
                        left={
                          <IconBadge
                            background={
                              positive
                                ? colors.incomeSoft
                                : neutral
                                  ? colors.infoSoft
                                  : reversed
                                    ? colors.chipNeutral
                                    : colors.expenseSoft
                            }
                          >
                            <Icon
                              size={iconSize.row}
                              color={
                                positive
                                  ? colors.income
                                  : neutral
                                    ? colors.info
                                    : reversed
                                      ? colors.textSecondary
                                      : colors.expense
                              }
                            />
                          </IconBadge>
                        }
                        right={
                          <Text
                            variant="moneyRow"
                            tone={
                              reversed
                                ? 'secondary'
                                : neutral
                                  ? 'tertiary'
                                  : positive
                                    ? 'income'
                                    : 'expense'
                            }
                            style={reversed ? styles.reversed : undefined}
                          >
                            {neutral
                              ? formatMoney(minor(item.amountMinor), { signDisplay: 'never' })
                              : formatMoney(
                                  minor(positive ? item.amountMinor : -item.amountMinor),
                                  {
                                    signDisplay: 'always',
                                  },
                                )}
                          </Text>
                        }
                      />
                      {reversed || pending ? (
                        <View style={styles.chipRow}>
                          <StatusChip status={pending ? 'aguardandoAprovacao' : 'estornado'} />
                        </View>
                      ) : null}
                    </View>
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
      <Text variant="chip" style={{ color: active ? colors.surfaceElevated : colors.textPrimary }}>
        {active ? `${value} ✕` : label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
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
