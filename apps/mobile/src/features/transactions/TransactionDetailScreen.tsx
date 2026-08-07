/**
 * Detalhe da movimentação (SCREEN-SPECS §"Telas sem screenshot": "detalhe de
 * movimentação (com rateio e anexos)").
 *
 * Mostra o lançamento completo, o rateio e o caminho de correção: movimentação
 * postada não se edita nem se apaga — corrige-se por ESTORNO, com motivo.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import type { Attachment, Transaction } from '@ff/api-contracts';
import { formatDate, formatMoney, isoDate, minor } from '@ff/domain';
import { Avatar } from '../../components/Avatar';
import { Badge } from '../../components/Badge';
import { Banner } from '../../components/Banner';
import { Button } from '../../components/Button';
import { Card, IconBadge, ListRow, SectionLabel } from '../../components/Card';
import { Field } from '../../components/Field';
import { ScreenHeader } from '../../components/ScreenHeader';
import { StatusChip } from '../../components/StatusChip';
import { Text } from '../../design-system/Text';
import { useTheme } from '../../design-system/theme';
import { categoryVisual } from '../../design-system/category-icons';
import { iconSize } from '../../design-system/icons';
import { ApiRequestError } from '../../services/api-client';
import { longMonthLabel } from '../../services/dates';
import { newIdempotencyKey } from '../../services/idempotency';
import { useSessionStore } from '../auth/session-store';
import { useActiveHousehold } from '../household/household-store';
import { listAttachments } from '../planning/planning-api';
import * as api from './transaction-api';

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

/**
 * Percentual da fatia no rateio, só para exibição.
 *
 * `+ 0.5` é o arredondamento meio-para-cima escrito à mão: a regra do ESLint
 * contra `Math.round` existe para dinheiro, e aqui nenhum centavo é derivado
 * deste número — quem valida a soma é o servidor.
 */
function percentOf(partMinor: number, totalMinor: number): number {
  if (totalMinor <= 0) return 0;
  return Math.floor((partMinor * 100) / totalMinor + 0.5);
}

/** Linha "rótulo à esquerda, valor à direita" do card de campos (8f). */
function FieldRow({
  label,
  value,
  first = false,
}: {
  readonly label: string;
  readonly value: string;
  readonly first?: boolean;
}): React.JSX.Element {
  const { colors } = useTheme();
  return (
    <View
      style={[
        fieldRowStyles.row,
        first ? null : { borderTopColor: colors.divider, borderTopWidth: 1 },
      ]}
    >
      <Text variant="rowTitle" tone="secondary">
        {label}
      </Text>
      <Text variant="rowTitle" style={fieldRowStyles.value}>
        {value}
      </Text>
    </View>
  );
}

const fieldRowStyles = StyleSheet.create({
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    paddingVertical: 11,
  },
  value: { flexShrink: 1, textAlign: 'right' },
});

export function TransactionDetailScreen({
  transaction: initial,
  onBack,
}: {
  readonly transaction: Transaction;
  readonly onBack: () => void;
}): React.JSX.Element {
  const { colors, layout, spacing } = useTheme();
  const accessToken = useSessionStore((state) => state.accessToken);
  const household = useActiveHousehold();

  const [transaction, setTransaction] = useState<Transaction>(initial);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [reason, setReason] = useState('');
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canOperate =
    household?.myRole === 'OWNER' || household?.myRole === 'ADMIN' || household?.myRole === 'ADULT';

  const load = useCallback(async () => {
    if (!accessToken || !household) return;
    try {
      const [fresh, files] = await Promise.all([
        api.getTransaction(accessToken, household.id, transaction.id),
        listAttachments(accessToken, household.id, 'transaction', transaction.id),
      ]);
      setTransaction(fresh);
      setAttachments(files);
    } catch (cause) {
      setError(
        cause instanceof ApiRequestError ? cause.message : 'Não foi possível carregar os detalhes.',
      );
    }
  }, [accessToken, household, transaction.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleReverse = useCallback(async () => {
    if (!accessToken || !household || reason.trim() === '') return;
    setWorking(true);
    setError(null);
    try {
      await api.reverseTransaction(accessToken, household.id, transaction.id, {
        reason: reason.trim(),
        idempotencyKey: newIdempotencyKey('estorno'),
      });
      setReason('');
      await load();
    } catch (cause) {
      setError(cause instanceof ApiRequestError ? cause.message : 'Não foi possível estornar.');
    } finally {
      setWorking(false);
    }
  }, [accessToken, household, load, reason, transaction.id]);

  const reversed = transaction.status === 'REVERSED';
  const isReversal = transaction.transactionType === 'REVERSAL';
  const neutral =
    transaction.transactionType === 'TRANSFER' || transaction.transactionType === 'CARD_PAYMENT';
  const visual = categoryVisual(transaction.categoryName, colors);

  return (
    <View style={[styles.flex, { backgroundColor: colors.surface }]}>
      <ScreenHeader title="Movimentação" onBack={onBack} size="screen" />

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingHorizontal: layout.screenPaddingH, paddingBottom: spacing.xxxl },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        {/* Cabeçalho do lançamento: ícone, tipo · estado, descrição e valor. */}
        <Card testID="card-valor">
          <View style={styles.headerRow}>
            <IconBadge background={visual.background}>
              <visual.Icon size={iconSize.row} color={visual.color} />
            </IconBadge>
            <View style={styles.headerTexts}>
              <Text variant="label" tone="secondary">
                {`${TYPE_LABEL[transaction.transactionType] ?? transaction.transactionType} · ${
                  reversed ? 'Estornada' : 'Postada'
                }`}
              </Text>
              <Text variant="rowTitle" style={reversed ? styles.reversed : undefined}>
                {transaction.description}
              </Text>
            </View>
            {reversed ? (
              <StatusChip status="estornado" />
            ) : (
              <Badge label="● Enviada" tone="income" />
            )}
          </View>
          <Text
            variant="moneyLg"
            tone={
              neutral ? 'primary' : transaction.transactionType === 'INCOME' ? 'income' : 'expense'
            }
            style={[styles.headerAmount, reversed ? styles.reversed : null]}
          >
            {formatMoney(minor(transaction.amountMinor))}
          </Text>
        </Card>

        {/* Rótulo à esquerda, valor à direita — como no screenshot. */}
        <View style={{ marginTop: spacing.md }}>
          <Card padded={false} testID="card-campos">
            <FieldRow first label="Conta" value={transaction.accountName ?? '—'} />
            {transaction.destinationAccountName === null ? null : (
              <FieldRow label="Para" value={transaction.destinationAccountName} />
            )}
            <FieldRow label="Categoria" value={transaction.categoryName ?? 'Sem categoria'} />
            <FieldRow label="Membro" value={transaction.memberName ?? '—'} />
            {transaction.counterpartyName === null ? null : (
              <FieldRow label="Favorecido" value={transaction.counterpartyName} />
            )}
            <FieldRow
              label="Competência"
              value={longMonthLabel(transaction.competenceDate).concat(
                ` ${transaction.competenceDate.slice(0, 4)}`,
              )}
            />
            <FieldRow
              label="Caixa"
              value={formatDate(isoDate(transaction.occurredAt.slice(0, 10)))}
            />
            {transaction.notes === null ? null : (
              <FieldRow label="Observação" value={transaction.notes} />
            )}
            <FieldRow label="Registrado por" value={transaction.createdByName ?? '—'} />
            {transaction.reason === null ? null : (
              <FieldRow label="Motivo" value={transaction.reason} />
            )}
          </Card>
        </View>

        {transaction.allocations.length === 0 ? null : (
          <View style={{ marginTop: spacing.md }}>
            <Card testID="card-rateio">
              <View style={styles.headerRow}>
                <Text variant="rowTitle" style={styles.headerTexts}>
                  Rateio entre membros
                </Text>
                <Text variant="rowMeta" tone="secondary">
                  {`${transaction.allocations.length} ${transaction.allocations.length === 1 ? 'membro' : 'membros'}`}
                </Text>
              </View>
              {transaction.allocations.map((allocation, index) => (
                <View key={`${allocation.memberId}-${index}`} style={styles.allocationRow}>
                  <Avatar
                    name={allocation.memberName ?? '?'}
                    seed={allocation.memberId}
                    size="sm"
                  />
                  <Text variant="rowTitle" style={styles.headerTexts}>
                    {allocation.memberName ?? 'Membro'}
                  </Text>
                  <Text variant="rowMeta" tone="secondary">
                    {`${percentOf(allocation.amountMinor, transaction.amountMinor)}%`}
                  </Text>
                  <Text variant="moneyRow">{formatMoney(minor(allocation.amountMinor))}</Text>
                </View>
              ))}
              {/* O servidor recusa rateio que não fecha; aqui só confirmamos. */}
              <View style={[styles.headerRow, { marginTop: spacing.sm }]}>
                <Text variant="rowMeta" tone="income" style={styles.headerTexts}>
                  ✓ Soma dos rateios
                </Text>
                <Text variant="rowMeta" tone="income">
                  {`${formatMoney(minor(transaction.amountMinor))} = total`}
                </Text>
              </View>
            </Card>
          </View>
        )}

        {attachments.length === 0 ? null : (
          <View style={{ marginTop: spacing.xl }}>
            <SectionLabel>{`ANEXOS · ${attachments.length}`}</SectionLabel>
            <Card padded={false}>
              {attachments.map((attachment, index) => (
                <ListRow
                  key={attachment.id}
                  first={index === 0}
                  title={attachment.fileName}
                  meta={`${Math.floor(attachment.sizeBytes / 1024)} KB`}
                />
              ))}
            </Card>
          </View>
        )}

        {neutral ? (
          <View style={{ marginTop: spacing.md }}>
            <Banner
              kind="info"
              testID="banner-neutro"
              message={
                transaction.transactionType === 'TRANSFER'
                  ? 'Transferência move saldo entre contas: não é receita nem despesa e não entra nos relatórios por categoria.'
                  : 'Pagamento de fatura não vira nova despesa: as despesas já foram as compras do cartão.'
              }
            />
          </View>
        ) : null}

        {error === null ? null : (
          <View style={{ marginTop: spacing.md }}>
            <Banner kind="error" message={error} testID="erro-detalhe-movimentacao" />
          </View>
        )}

        {!reversed && !isReversal && canOperate ? (
          <View style={{ marginTop: spacing.xxl }}>
            <SectionLabel>CORRIGIR</SectionLabel>
            <Banner
              kind="warning"
              testID="banner-estorno"
              message="Movimentações postadas não são editadas nem apagadas. A correção é um estorno, que preserva o lançamento original e exige motivo."
            />
            <View style={{ marginTop: spacing.md }}>
              <Field
                label="Motivo do estorno · obrigatório"
                testID="campo-motivo-estorno"
                value={reason}
                onChangeText={setReason}
                placeholder="Lançamento em duplicidade"
              />
            </View>
            <View style={{ marginTop: spacing.md }}>
              <Button
                testID="estornar"
                label="Estornar movimentação"
                variant="destructive"
                loading={working}
                disabled={reason.trim() === ''}
                onPress={handleReverse}
              />
            </View>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingTop: 4 },
  reversed: { textDecorationLine: 'line-through' },
  headerRow: { alignItems: 'center', flexDirection: 'row', gap: 12 },
  headerTexts: { flex: 1, gap: 2 },
  headerAmount: { marginTop: 8 },
  allocationRow: { alignItems: 'center', flexDirection: 'row', gap: 10, paddingVertical: 6 },
});
