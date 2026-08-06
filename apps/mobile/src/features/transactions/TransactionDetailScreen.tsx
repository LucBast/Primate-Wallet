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
import { Banner } from '../../components/Banner';
import { Button } from '../../components/Button';
import { Card, ListRow, SectionLabel } from '../../components/Card';
import { Field } from '../../components/Field';
import { ScreenHeader } from '../../components/ScreenHeader';
import { StatusChip } from '../../components/StatusChip';
import { Text } from '../../design-system/Text';
import { useTheme } from '../../design-system/theme';
import { ApiRequestError } from '../../services/api-client';
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

  return (
    <View style={[styles.flex, { backgroundColor: colors.surface }]}>
      <ScreenHeader
        title={transaction.description}
        subtitle={TYPE_LABEL[transaction.transactionType] ?? transaction.transactionType}
        onBack={onBack}
        size="screen"
      />

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingHorizontal: layout.screenPaddingH, paddingBottom: spacing.xxxl },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <Card testID="card-valor">
          <Text variant="sectionCaps" tone="secondary">
            VALOR
          </Text>
          <Text
            variant="moneyLg"
            tone={
              neutral ? 'primary' : transaction.transactionType === 'INCOME' ? 'income' : 'expense'
            }
            style={reversed ? styles.reversed : undefined}
          >
            {formatMoney(minor(transaction.amountMinor))}
          </Text>
          {reversed ? (
            <View style={{ marginTop: spacing.sm }}>
              <StatusChip status="estornado" />
            </View>
          ) : null}
        </Card>

        <View style={{ marginTop: spacing.md }}>
          <Card padded={false}>
            <ListRow first title="Conta" meta={transaction.accountName ?? '—'} />
            {transaction.destinationAccountName === null ? null : (
              <ListRow title="Para" meta={transaction.destinationAccountName} />
            )}
            <ListRow title="Categoria" meta={transaction.categoryName ?? 'Sem categoria'} />
            <ListRow title="Membro" meta={transaction.memberName ?? '—'} />
            {transaction.counterpartyName === null ? null : (
              <ListRow title="Favorecido" meta={transaction.counterpartyName} />
            )}
            <ListRow
              title="Ocorrido em"
              meta={formatDate(isoDate(transaction.occurredAt.slice(0, 10)))}
            />
            <ListRow title="Competência" meta={formatDate(isoDate(transaction.competenceDate))} />
            <ListRow title="Registrado por" meta={transaction.createdByName ?? '—'} />
            {transaction.reason === null ? null : (
              <ListRow title="Motivo" meta={transaction.reason} />
            )}
          </Card>
        </View>

        {transaction.allocations.length === 0 ? null : (
          <View style={{ marginTop: spacing.xl }}>
            <SectionLabel>{`RATEIO · ${transaction.allocations.length}`}</SectionLabel>
            <Card padded={false} testID="card-rateio">
              {transaction.allocations.map((allocation, index) => (
                <ListRow
                  key={`${allocation.memberId}-${index}`}
                  first={index === 0}
                  title={allocation.memberName ?? 'Membro'}
                  meta={allocation.categoryName ?? undefined}
                  right={
                    <Text variant="moneyRow">{formatMoney(minor(allocation.amountMinor))}</Text>
                  }
                />
              ))}
            </Card>
            <Text variant="rowMeta" tone="income" style={{ marginTop: spacing.sm }}>
              ✓ Soma dos rateios = valor total (validado pelo servidor)
            </Text>
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
});
