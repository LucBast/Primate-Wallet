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
import type { Account, AccountStatementRow, VisibilityScope } from '@ff/api-contracts';
import { addMonths, formatMoney, isoDate, minor, monthRange } from '@ff/domain';
import { Button } from '../../components/Button';
import { Card, IconBadge, ListRow } from '../../components/Card';
import { MonthPicker } from '../../components/MonthPicker';
import { ScreenHeader } from '../../components/ScreenHeader';
import { EmptyState, RecoverableError, SkeletonList } from '../../components/states';
import { Text } from '../../design-system/Text';
import { useTheme } from '../../design-system/theme';
import { icons, iconSize } from '../../design-system/icons';
import { ApiRequestError } from '../../services/api-client';
import { dayMonth, monthLabel } from '../../services/dates';
import { useSessionStore } from '../auth/session-store';
import { useActiveHousehold } from '../household/household-store';
import * as api from './account-api';
import { AdjustBalanceSheet } from './AdjustBalanceSheet';

/** Selo de visibilidade no subtítulo, igual ao da 2a. */
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

/**
 * Título da linha do extrato, com a copy do screenshot: a transferência nomeia
 * o destino e a baixa se identifica como tal.
 */
function statementTitle(row: AccountStatementRow): string {
  if (row.transactionType === 'TRANSFER' && row.destinationAccountName !== null) {
    return `Transferência → ${row.destinationAccountName}`;
  }
  if (row.transactionType === 'ADJUSTMENT') return 'Ajuste de saldo';
  return row.description;
}

/** Ícone da natureza, como na 1g (COMPONENT-SPECS §Ícones). */
function statementVisual(
  type: string,
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
    case 'ADJUSTMENT':
      return { Icon: icons.ajuste, color: colors.textTertiary, background: colors.chipNeutral };
    case 'REVERSAL':
      return { Icon: icons.estorno, color: colors.textTertiary, background: colors.chipNeutral };
    default:
      return { Icon: icons.despesa, color: colors.expense, background: colors.expenseSoft };
  }
}

export type AccountDetailScreenProps = {
  readonly account: Account;
  readonly onBack: () => void;
  readonly onTransfer: () => void;
  readonly onPermissions: () => void;
  readonly onEdit?: (() => void) | undefined;
};

export function AccountDetailScreen({
  account: initial,
  onBack,
  onTransfer,
  onPermissions,
  onEdit,
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

  const Editar = icons.editar;

  return (
    <View style={[styles.flex, { backgroundColor: colors.surface }]}>
      {/* "Banco Andar · Bruno · Família", com o selo colorido (screenshot 2c). */}
      <ScreenHeader
        title={account.name}
        subtitle={
          <Text variant="rowMeta" tone="secondary">
            {[account.institutionName, account.primaryMemberName]
              .filter((part): part is string => Boolean(part))
              .map((part) => `${part} · `)
              .join('')}
            <Text variant="rowMeta" tone={VISIBILITY_TONE[account.visibilityScope]}>
              {VISIBILITY_LABEL[account.visibilityScope]}
            </Text>
          </Text>
        }
        onBack={onBack}
        size="screen"
        // O lápis só aparece quando há para onde ir: botão que não faz nada é
        // pior que botão ausente.
        right={
          onEdit === undefined ? undefined : (
            <Pressable
              testID="editar-conta"
              accessibilityRole="button"
              accessibilityLabel="Editar conta"
              hitSlop={10}
              onPress={onEdit}
            >
              <Editar size={iconSize.action} color={colors.textPrimary} />
            </Pressable>
          )
        }
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

        {/* 3. Ações — os três botões trazem ícone no screenshot. */}
        <View style={[styles.actions, { marginTop: spacing.md }]}>
          <View style={styles.action}>
            <Button label="⇄ Transferir" variant="secondary" size="sm" onPress={onTransfer} />
          </View>
          {canAdjust ? (
            <View style={styles.action}>
              <Button
                testID="ajustar-saldo"
                label="± Ajustar saldo"
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

        {/* 4. Extrato: título à esquerda, seletor de mês à direita. */}
        <View style={[styles.extratoHeader, { marginTop: spacing.lg }]}>
          <Text variant="section">Extrato</Text>
          <MonthPicker
            label={monthLabel(range.start)}
            onPrevious={() => setMonthAnchor((current) => addMonths(current, -1))}
            onNext={() => setMonthAnchor((current) => addMonths(current, 1))}
          />
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
              {rows.map((row, index) => {
                const visual = statementVisual(row.transactionType, colors);
                // Transferência muda de conta, não é despesa nem receita: fica
                // neutra, como no screenshot.
                const neutro = row.transactionType === 'TRANSFER';
                return (
                  <ListRow
                    key={row.id}
                    first={index === 0}
                    testID={`extrato-${row.id}`}
                    title={statementTitle(row)}
                    titleStyle={
                      row.status === 'REVERSED'
                        ? { ...styles.reversed, color: colors.textSecondary }
                        : undefined
                    }
                    left={
                      <IconBadge background={visual.background}>
                        <visual.Icon size={iconSize.row} color={visual.color} />
                      </IconBadge>
                    }
                    meta={[
                      dayMonth(row.occurredAt.slice(0, 10)),
                      row.reason === null ? null : `motivo: ${row.reason}`,
                      row.createdByName === null ? null : `por ${row.createdByName}`,
                    ]
                      .filter((part): part is string => Boolean(part))
                      .join(' · ')}
                    right={
                      <Text
                        variant="moneyRow"
                        tone={
                          neutro ? 'tertiary' : row.signedAmountMinor < 0 ? 'expense' : 'income'
                        }
                      >
                        {formatMoney(minor(row.signedAmountMinor), { signDisplay: 'always' })}
                      </Text>
                    }
                  />
                );
              })}
            </Card>
          )}
        </View>

        {/* 5. Arquivamento: uma linha só, com a ação em danger à direita. */}
        <View style={[styles.archiveRow, { marginTop: spacing.xl }]}>
          <Text variant="rowMeta" tone="secondary" style={styles.archiveText}>
            {account.archivedAt === null
              ? 'Arquivar conta impede novos usos, mantém histórico.'
              : 'Conta arquivada: não recebe novos lançamentos, o histórico continua.'}
          </Text>
          <Pressable
            testID={account.archivedAt === null ? 'arquivar-conta' : 'desarquivar-conta'}
            accessibilityRole="button"
            accessibilityLabel={account.archivedAt === null ? 'Arquivar conta' : 'Reativar conta'}
            hitSlop={8}
            onPress={async () => {
              if (!accessToken || !household) return;
              setAccount(
                await api.archiveAccount(
                  accessToken,
                  household.id,
                  account.id,
                  account.archivedAt === null,
                ),
              );
            }}
          >
            <Text variant="rowMeta" tone={account.archivedAt === null ? 'danger' : 'brand'}>
              {account.archivedAt === null ? 'Arquivar' : 'Reativar'}
            </Text>
          </Pressable>
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
  extratoHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  archiveRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  archiveText: { flex: 1 },
  reversed: { textDecorationLine: 'line-through' },
});
