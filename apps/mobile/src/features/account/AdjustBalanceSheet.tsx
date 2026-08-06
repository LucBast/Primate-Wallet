/**
 * Tela 2d — Ajuste de saldo (screenshots/2d-ajuste-saldo.png).
 *
 * BottomSheet com:
 *   1. Card comparativo: Saldo no aplicativo / Saldo real (informado) /
 *      Ajuste a criar (income quando credita, expense quando debita)
 *   2. MoneyInput "Novo saldo"
 *   3. Field "Motivo · obrigatório"
 *   4. Banner infoSoft: "O ajuste vira uma movimentação própria no extrato, com
 *      autor e motivo. O histórico anterior não é alterado."
 *   5. CTA "Confirmar ajuste de + R$ 12,75" + Cancelar
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { Account } from '@ff/api-contracts';
import { formatMoney, minor, subtract } from '@ff/domain';
import { Banner } from '../../components/Banner';
import { BottomSheet } from '../../components/BottomSheet';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Field } from '../../components/Field';
import { MoneyInput } from '../../components/MoneyInput';
import { Text } from '../../design-system/Text';
import { useTheme } from '../../design-system/theme';
import { ApiRequestError } from '../../services/api-client';
import { newIdempotencyKey } from '../../services/idempotency';
import { useSessionStore } from '../auth/session-store';
import { useActiveHousehold } from '../household/household-store';
import * as api from './account-api';

export function AdjustBalanceSheet({
  visible,
  account,
  onClose,
  onAdjusted,
}: {
  readonly visible: boolean;
  readonly account: Account;
  readonly onClose: () => void;
  readonly onAdjusted: (account: Account) => void;
}): React.JSX.Element {
  const { spacing } = useTheme();
  const accessToken = useSessionStore((state) => state.accessToken);
  const household = useActiveHousehold();

  const [newBalanceMinor, setNewBalanceMinor] = useState(account.balanceMinor);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A chave nasce com o sheet: reabrir gera uma nova, tocar duas vezes não.
  const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey);

  useEffect(() => {
    if (visible) {
      setNewBalanceMinor(account.balanceMinor);
      setReason('');
      setError(null);
      setIdempotencyKey(newIdempotencyKey());
    }
  }, [account.balanceMinor, visible]);

  const difference = useMemo(
    () => subtract(minor(newBalanceMinor), minor(account.balanceMinor)),
    [account.balanceMinor, newBalanceMinor],
  );

  const handleConfirm = useCallback(async () => {
    if (!accessToken || !household) return;
    setError(null);
    setSaving(true);
    try {
      const result = await api.adjustBalance(accessToken, household.id, account.id, {
        newBalanceMinor,
        reason: reason.trim(),
        idempotencyKey,
        expectedVersion: account.version,
      });
      onAdjusted(result.account);
    } catch (cause) {
      setError(
        cause instanceof ApiRequestError ? cause.message : 'Não foi possível ajustar agora.',
      );
    } finally {
      setSaving(false);
    }
  }, [
    accessToken,
    account.id,
    account.version,
    household,
    idempotencyKey,
    newBalanceMinor,
    onAdjusted,
    reason,
  ]);

  const canConfirm = difference !== 0 && reason.trim() !== '' && !saving;

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title="Ajustar saldo"
      testID="sheet-ajuste"
      footer={
        <View style={{ gap: spacing.sm }}>
          <Button
            testID="confirmar-ajuste"
            label={`Confirmar ajuste de ${formatMoney(difference, { signDisplay: 'always' })}`}
            loading={saving}
            disabled={!canConfirm}
            onPress={handleConfirm}
          />
          <Button testID="cancelar-ajuste" label="Cancelar" variant="secondary" onPress={onClose} />
        </View>
      }
    >
      <Card testID="card-comparativo">
        <View style={styles.row}>
          <Text variant="rowMeta" tone="secondary">
            Saldo no aplicativo
          </Text>
          <Text variant="moneyRow">{formatMoney(minor(account.balanceMinor))}</Text>
        </View>
        <View style={styles.row}>
          <Text variant="rowMeta" tone="secondary">
            Saldo real (informado)
          </Text>
          <Text variant="moneyRow">{formatMoney(minor(newBalanceMinor))}</Text>
        </View>
        <View style={styles.row}>
          <Text variant="rowMeta" tone="secondary">
            Ajuste a criar
          </Text>
          <Text variant="moneyRow" tone={difference < 0 ? 'expense' : 'income'}>
            {formatMoney(difference, { signDisplay: 'always' })}
          </Text>
        </View>
      </Card>

      <View style={{ marginTop: spacing.md }}>
        <MoneyInput
          label="NOVO SALDO"
          testID="campo-novo-saldo"
          valueMinor={newBalanceMinor}
          onChangeMinor={setNewBalanceMinor}
          size={28}
        />
      </View>

      <View style={{ marginTop: spacing.md }}>
        <Field
          label="Motivo · obrigatório"
          testID="campo-motivo"
          value={reason}
          onChangeText={setReason}
          placeholder="Conferência com o extrato do banco"
        />
      </View>

      <View style={{ marginTop: spacing.md }}>
        <Banner
          kind="info"
          testID="banner-ajuste"
          message="O ajuste vira uma movimentação própria no extrato, com autor e motivo. O histórico anterior não é alterado."
        />
      </View>

      {error === null ? null : (
        <View style={{ marginTop: spacing.md }}>
          <Banner kind="error" message={error} testID="erro-ajuste" />
        </View>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
});
