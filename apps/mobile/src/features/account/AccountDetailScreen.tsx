/**
 * Tela 2c — Detalhe da conta + extrato (screenshots/2c-detalhe-conta.png).
 *
 * Blocos:
 *   1. Header com nome/instituição/selo + editar
 *   2. Card brand com "Saldo atual" e a linha de reconciliação
 *      "Conferido: saldo inicial + movimentações = saldo atual ✓"
 *   3. Três ações: Transferir · Ajustar saldo · Permissões
 *   4. Extrato com seletor de mês
 *   5. Rodapé: microcopy de arquivamento + ação Arquivar (destrutiva)
 *
 * A tela 2d (ajuste de saldo) abre como BottomSheet a partir daqui.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import type { Account, AccountStatementRow } from '@ff/api-contracts';
import { addMonths, formatDate, formatMoney, isoDate, minor, monthRange } from '@ff/domain';
import { Banner } from '../../components/Banner';
import { Button } from '../../components/Button';
import { Card, ListRow, SectionLabel } from '../../components/Card';
import { ScreenHeader } from '../../components/ScreenHeader';
import { EmptyState, RecoverableError, SkeletonList } from '../../components/states';
import { Text } from '../../design-system/Text';
import { useTheme } from '../../design-system/theme';
import { icons, iconSize } from '../../design-system/icons';
import { ApiRequestError } from '../../services/api-client';
import { useSessionStore } from '../auth/session-store';
import { useActiveHousehold } from '../household/household-store';
import * as api from './account-api';
import { AdjustBalanceSheet } from './AdjustBalanceSheet';

/** Rótulos pt-BR dos tipos de movimentação que aparecem no extrato. */
const TYPE_LABEL: Record<string, string> = {
  EXPENSE: 'Despesa',
  INCOME: 'Receita',
  TRANSFER: 'Transferência',
  CARD_PURCHASE: 'Compra no cartão',
  CARD_PAYMENT: 'Pagamento de fatura',
  ADJUSTMENT: 'Ajuste de saldo',
  REFUND: 'Reembolso',
  REVERSAL: 'Estorno',
};

const MONTH_FORMAT = new Intl.DateTimeFormat('pt-BR', { month: 'short', year: 'numeric' });

export type AccountDetailScreenProps = {
  readonly account: Account;
  readonly onBack: () => void;
  readonly onTransfer: () => void;
  readonly onPermissions: () => void;
};

export function AccountDetailScreen({
  account: initial,
  onBack,
  onTransfer,
  onPermissions,
}: AccountDetailScreenProps): React.JSX.Element {
  const { colors, layout, radius, spacing } = useTheme();
  const accessToken = useSessionStore((state) => state.accessToken);
  const household = useActiveHousehold();

  const [account, setAccount] = useState<Account>(initial);
  const [monthAnchor, setMonthAnchor] = useState(() =>
    isoDate(new Date().toISOString().slice(0, 10)),
  );
  const [rows, setRows] = useState<AccountStatementRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adjusting, setAdjusting] = useState(false);

  const canAdjust = household?.myRole === 'OWNER' || household?.myRole === 'ADMIN';
  const range = useMemo(() => monthRange(monthAnchor), [monthAnchor]);

  const load = useCallback(async () => {
    if (!accessToken || !household) return;
    setError(null);
    try {
      const [fresh, statement] = await Promise.all([
        api.getAccount(accessToken, household.id, account.id),
        api.accountStatement(accessToken, household.id, account.id, range.start, range.end),
      ]);
      setAccount(fresh);
      setRows(statement);
    } catch (cause) {
      setError(
        cause instanceof ApiRequestError ? cause.message : 'Não foi possível carregar o extrato.',
      );
    }
  }, [accessToken, account.id, household, range.end, range.start]);

  useEffect(() => {
    void load();
  }, [load]);

  const Prev = icons.anterior;
  const Next = icons.proximo;

  return (
    <View style={[styles.flex, { backgroundColor: colors.surface }]}>
      <ScreenHeader
        title={account.name}
        subtitle={account.institutionName ?? undefined}
        onBack={onBack}
        size="screen"
      />

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingHorizontal: layout.screenPaddingH, paddingBottom: spacing.xxxl },
        ]}
      >
        {/* 2. Card de saldo, em brand */}
        <View
          style={[styles.balanceCard, { backgroundColor: colors.brand, borderRadius: radius.xxl }]}
        >
          <Text variant="sectionCaps" tone="onBrand">
            {account.accountType === 'CREDIT_CARD' ? 'DÍVIDA ATUAL' : 'SALDO ATUAL'}
          </Text>
          <Text variant="moneyLg" tone="onBrand">
            {formatMoney(minor(account.balanceMinor))}
          </Text>
          <Text variant="rowMeta" tone="onBrand">
            {account.accountType === 'CREDIT_CARD'
              ? `Limite disponível ${formatMoney(minor(account.availableLimitMinor ?? 0))}`
              : 'Conferido: saldo inicial + movimentações = saldo atual ✓'}
          </Text>
        </View>

        {/* 3. Ações */}
        <View style={[styles.actions, { marginTop: spacing.md }]}>
          <View style={styles.action}>
            <Button label="Transferir" variant="secondary" size="sm" onPress={onTransfer} />
          </View>
          {canAdjust ? (
            <View style={styles.action}>
              <Button
                testID="ajustar-saldo"
                label="Ajustar saldo"
                variant="secondary"
                size="sm"
                onPress={() => setAdjusting(true)}
              />
            </View>
          ) : null}
          <View style={styles.action}>
            <Button label="Permissões" variant="secondary" size="sm" onPress={onPermissions} />
          </View>
        </View>

        {/* 4. Extrato */}
        <View style={[styles.monthRow, { marginTop: spacing.xl }]}>
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

        <View style={{ marginTop: spacing.sm }}>
          {error !== null ? (
            <RecoverableError message={error} onRetry={() => void load()} testID="erro-extrato" />
          ) : rows === null ? (
            <SkeletonList rows={4} />
          ) : rows.length === 0 ? (
            <EmptyState
              title="Nenhuma movimentação neste mês"
              subtitle="Quando houver lançamentos nesta conta, eles aparecem aqui."
            />
          ) : (
            <Card padded={false} testID="card-extrato">
              {rows.map((row, index) => (
                <ListRow
                  key={row.id}
                  first={index === 0}
                  testID={`extrato-${row.id}`}
                  title={row.description}
                  meta={[
                    TYPE_LABEL[row.transactionType] ?? row.transactionType,
                    row.memberName,
                    formatDate(isoDate(row.occurredAt.slice(0, 10))),
                    row.reason,
                  ]
                    .filter((part): part is string => Boolean(part))
                    .join(' · ')}
                  right={
                    <Text
                      variant="moneyRow"
                      tone={row.signedAmountMinor < 0 ? 'expense' : 'income'}
                      style={row.status === 'REVERSED' ? styles.reversed : undefined}
                    >
                      {formatMoney(minor(row.signedAmountMinor), { signDisplay: 'always' })}
                    </Text>
                  }
                />
              ))}
            </Card>
          )}
        </View>

        {/* 5. Arquivamento */}
        <View style={{ marginTop: spacing.xxl }}>
          <Banner
            kind="warning"
            testID="banner-arquivar"
            message="Arquivar a conta impede novos usos, mantém o histórico e preserva os relatórios antigos."
          />
          {account.archivedAt === null ? (
            <View style={{ marginTop: spacing.md }}>
              <Button
                testID="arquivar-conta"
                label="Arquivar conta"
                variant="destructive"
                onPress={async () => {
                  if (!accessToken || !household) return;
                  setAccount(await api.archiveAccount(accessToken, household.id, account.id, true));
                }}
              />
            </View>
          ) : (
            <View style={{ marginTop: spacing.md }}>
              <SectionLabel>CONTA ARQUIVADA</SectionLabel>
              <Button
                testID="desarquivar-conta"
                label="Reativar conta"
                variant="secondary"
                onPress={async () => {
                  if (!accessToken || !household) return;
                  setAccount(
                    await api.archiveAccount(accessToken, household.id, account.id, false),
                  );
                }}
              />
            </View>
          )}
        </View>
      </ScrollView>

      <AdjustBalanceSheet
        visible={adjusting}
        account={account}
        onClose={() => setAdjusting(false)}
        onAdjusted={(updated) => {
          setAccount(updated);
          setAdjusting(false);
          void load();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingTop: 4 },
  balanceCard: { gap: 2, paddingHorizontal: 18, paddingVertical: 14 },
  actions: { flexDirection: 'row', gap: 8 },
  action: { flex: 1 },
  monthRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'center',
  },
  reversed: { textDecorationLine: 'line-through' },
});
