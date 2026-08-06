/**
 * Tela 2a — Lista de contas (screenshots/2a-contas.png).
 *
 * Blocos, na ordem da especificação:
 *   1. Header + botão "+ Nova conta"
 *   2. Card resumo: "Total em contas" / "Dívida em cartões" (expense)
 *   3. Grupo "Contas · N": ícone colorido, nome, titular + selo de visibilidade
 *      (Família brand · Só adultos warning · Restrita pending), saldo
 *   4. Grupo "Cartões de crédito · N": final do cartão, fecha/vence dia,
 *      mini barra de limite e dívida em expense
 *   5. Linha "Arquivadas · N — Mostrar ▾" + microcopy de arquivamento
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import type { Account, VisibilityScope } from '@ff/api-contracts';
import { add, formatMoney, minor, type MinorUnits, ZERO } from '@ff/domain';
import { Button } from '../../components/Button';
import { Card, IconBadge, ListRow, SectionLabel } from '../../components/Card';
import { ProgressBar } from '../../components/ProgressBar';
import { ScreenHeader } from '../../components/ScreenHeader';
import { EmptyState, RecoverableError, SkeletonList } from '../../components/states';
import { Text } from '../../design-system/Text';
import { useTheme } from '../../design-system/theme';
import { icons, iconSize } from '../../design-system/icons';
import { ApiRequestError } from '../../services/api-client';
import { useSessionStore } from '../auth/session-store';
import { useActiveHousehold } from '../household/household-store';
import * as api from './account-api';

/** Selo de visibilidade da conta (screenshot 2a). */
const VISIBILITY_LABEL: Record<VisibilityScope, string> = {
  HOUSEHOLD: 'Família',
  ADULTS_ONLY: 'Só adultos',
  SELECTED_MEMBERS: 'Restrita',
  OWNER_ONLY: 'Só eu',
};

const VISIBILITY_TONE: Record<VisibilityScope, 'brand' | 'warning' | 'pending'> = {
  HOUSEHOLD: 'brand',
  ADULTS_ONLY: 'warning',
  SELECTED_MEMBERS: 'pending',
  OWNER_ONLY: 'pending',
};

export type AccountsScreenProps = {
  readonly onBack: () => void;
  readonly onNewAccount: () => void;
  readonly onOpenAccount: (account: Account) => void;
};

export function AccountsScreen({
  onBack,
  onNewAccount,
  onOpenAccount,
}: AccountsScreenProps): React.JSX.Element {
  const { colors, layout, spacing } = useTheme();
  const accessToken = useSessionStore((state) => state.accessToken);
  const household = useActiveHousehold();

  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const canManage =
    household?.myRole === 'OWNER' || household?.myRole === 'ADMIN' || household?.myRole === 'ADULT';

  const load = useCallback(async () => {
    if (!accessToken || !household) return;
    setError(null);
    try {
      setAccounts(await api.listAccounts(accessToken, household.id, true));
    } catch (cause) {
      setError(
        cause instanceof ApiRequestError
          ? cause.message
          : 'Não foi possível carregar as contas agora.',
      );
    }
  }, [accessToken, household]);

  useEffect(() => {
    void load();
  }, [load]);

  const groups = useMemo(() => {
    const all = accounts ?? [];
    const active = all.filter((account) => account.archivedAt === null);
    return {
      banks: active.filter((account) => account.accountType !== 'CREDIT_CARD'),
      cards: active.filter((account) => account.accountType === 'CREDIT_CARD'),
      archived: all.filter((account) => account.archivedAt !== null),
    };
  }, [accounts]);

  const totals = useMemo(() => {
    const inAccounts = groups.banks.reduce<MinorUnits>(
      (sum, account) => add(sum, minor(account.balanceMinor)),
      ZERO,
    );
    const cardDebt = groups.cards.reduce<MinorUnits>(
      (sum, account) => add(sum, minor(account.balanceMinor)),
      ZERO,
    );
    return { inAccounts, cardDebt };
  }, [groups]);

  const Wallet = icons.cartao;
  const CardIcon = icons.cartao;

  return (
    <View style={[styles.flex, { backgroundColor: colors.surface }]}>
      <ScreenHeader
        title="Contas e cartões"
        onBack={onBack}
        right={
          canManage ? (
            <Button
              testID="nova-conta"
              label="+ Nova conta"
              variant="secondary"
              size="sm"
              onPress={onNewAccount}
              style={styles.headerAction}
            />
          ) : undefined
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
        {error !== null ? (
          <RecoverableError message={error} onRetry={() => void load()} testID="erro-contas" />
        ) : accounts === null ? (
          <SkeletonList rows={4} />
        ) : accounts.length === 0 ? (
          <EmptyState
            icon={<Wallet size={iconSize.action} color={colors.brand} />}
            title="Nenhuma conta ainda"
            subtitle="Cadastre suas contas e cartões para começar a registrar lançamentos."
            {...(canManage ? { actionLabel: '+ Nova conta', onAction: onNewAccount } : {})}
          />
        ) : (
          <>
            <Card testID="card-resumo">
              <View style={styles.summaryRow}>
                <View style={styles.summaryItem}>
                  <Text variant="rowMeta" tone="secondary">
                    Total em contas
                  </Text>
                  <Text variant="moneyMd">{formatMoney(totals.inAccounts)}</Text>
                </View>
                <View style={styles.summaryItem}>
                  <Text variant="rowMeta" tone="secondary">
                    Dívida em cartões
                  </Text>
                  <Text variant="moneyMd" tone="expense">
                    {formatMoney(totals.cardDebt)}
                  </Text>
                </View>
              </View>
            </Card>

            {groups.banks.length === 0 ? null : (
              <View style={{ marginTop: spacing.xl }}>
                <SectionLabel>{`CONTAS · ${groups.banks.length}`}</SectionLabel>
                <Card padded={false} testID="card-contas">
                  {groups.banks.map((account, index) => (
                    <ListRow
                      key={account.id}
                      first={index === 0}
                      testID={`conta-${account.id}`}
                      title={account.name}
                      meta={`${account.primaryMemberName ?? 'Família'} · ${VISIBILITY_LABEL[account.visibilityScope]}`}
                      metaTone={VISIBILITY_TONE[account.visibilityScope]}
                      left={
                        <IconBadge background={colors.brandSoft}>
                          <Wallet size={iconSize.row} color={colors.brand} />
                        </IconBadge>
                      }
                      right={
                        <Text
                          variant="moneyRow"
                          tone={account.balanceMinor < 0 ? 'expense' : 'primary'}
                        >
                          {formatMoney(minor(account.balanceMinor))}
                        </Text>
                      }
                      onPress={() => onOpenAccount(account)}
                    />
                  ))}
                </Card>
              </View>
            )}

            {groups.cards.length === 0 ? null : (
              <View style={{ marginTop: spacing.xl }}>
                <SectionLabel>{`CARTÕES DE CRÉDITO · ${groups.cards.length}`}</SectionLabel>
                <Card padded={false} testID="card-cartoes">
                  {groups.cards.map((account, index) => {
                    const limit = account.creditLimitMinor ?? 0;
                    const used = limit === 0 ? 0 : (account.balanceMinor / limit) * 100;
                    return (
                      <View
                        key={account.id}
                        style={[
                          styles.cardRow,
                          index > 0 && { borderTopColor: colors.divider, borderTopWidth: 1 },
                        ]}
                      >
                        <Pressable
                          testID={`cartao-${account.id}`}
                          accessibilityRole="button"
                          accessibilityLabel={account.name}
                          onPress={() => onOpenAccount(account)}
                          style={styles.cardTop}
                        >
                          <IconBadge background={colors.brandSoft}>
                            <CardIcon size={iconSize.row} color={colors.brand} />
                          </IconBadge>
                          <View style={styles.cardTexts}>
                            <Text variant="rowTitle">
                              {account.cardLastFour === null
                                ? account.name
                                : `${account.name} · • • • • ${account.cardLastFour}`}
                            </Text>
                            <Text variant="rowMeta" tone="secondary">
                              {`fecha dia ${account.closingDay ?? '—'} · vence dia ${account.dueDay ?? '—'}`}
                            </Text>
                          </View>
                          <Text variant="moneyRow" tone="expense">
                            {formatMoney(minor(account.balanceMinor))}
                          </Text>
                        </Pressable>

                        <View style={styles.cardLimit}>
                          <ProgressBar
                            percent={used}
                            tone="expense"
                            height={5}
                            accessibilityLabel={`Limite usado de ${account.name}`}
                          />
                          <Text variant="rowMeta" tone="secondary">
                            {`${formatMoney(minor(account.availableLimitMinor ?? 0))} disponíveis de ${formatMoney(minor(limit))}`}
                          </Text>
                        </View>
                      </View>
                    );
                  })}
                </Card>
              </View>
            )}

            {groups.archived.length === 0 ? null : (
              <View style={{ marginTop: spacing.xl }}>
                <Pressable
                  testID="mostrar-arquivadas"
                  accessibilityRole="button"
                  onPress={() => setShowArchived((current) => !current)}
                  hitSlop={8}
                >
                  <Text variant="rowTitle" tone="secondary">
                    {`Arquivadas · ${groups.archived.length} — ${showArchived ? 'Ocultar ▴' : 'Mostrar ▾'}`}
                  </Text>
                </Pressable>

                {showArchived ? (
                  <View style={{ marginTop: spacing.sm }}>
                    <Card padded={false}>
                      {groups.archived.map((account, index) => (
                        <ListRow
                          key={account.id}
                          first={index === 0}
                          title={account.name}
                          meta="Arquivada"
                          left={
                            <IconBadge background={colors.chipNeutral}>
                              <Wallet size={iconSize.row} color={colors.textSecondary} />
                            </IconBadge>
                          }
                          right={
                            <Text variant="moneyRow" tone="secondary">
                              {formatMoney(minor(account.balanceMinor))}
                            </Text>
                          }
                          onPress={() => onOpenAccount(account)}
                        />
                      ))}
                    </Card>
                  </View>
                ) : null}

                <Text variant="rowMeta" tone="secondary" style={{ marginTop: spacing.sm }}>
                  Arquivar uma conta impede novos usos e mantém todo o histórico e os relatórios
                  antigos.
                </Text>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingTop: 4 },
  headerAction: { width: 116 },
  summaryRow: { flexDirection: 'row', gap: 16 },
  summaryItem: { flex: 1, gap: 2 },
  cardRow: { gap: 8, paddingVertical: 11 },
  cardTop: { alignItems: 'center', flexDirection: 'row', gap: 12 },
  cardTexts: { flex: 1, gap: 2 },
  cardLimit: { gap: 4 },
});
