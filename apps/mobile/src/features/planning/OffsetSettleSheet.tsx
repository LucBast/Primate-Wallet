/**
 * Abater a conta prevista com lançamentos que já existem.
 *
 * O caso que originou a tela: consertos no apartamento que eram obrigação do
 * proprietário, abatidos do aluguel. O dinheiro do conserto já saiu quando ele
 * foi pago — por isso aqui NÃO se digita valor nem se escolhe conta: escolhe-se
 * quais lançamentos entram no encontro de contas, e o valor é o deles.
 *
 * Sem screenshot dedicado. Reaproveita o BottomSheet com card, lista de linhas
 * selecionáveis e rodapé fixo, como 2d — nenhum padrão visual novo
 * (COMPONENT-SPECS §BottomSheet, §Card; docs/21 D-105).
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import type { OffsetCandidate, PlannedEntry } from '@ff/api-contracts';
import { formatMoney, minor } from '@ff/domain';
import { Banner } from '../../components/Banner';
import { BottomSheet } from '../../components/BottomSheet';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Text } from '../../design-system/Text';
import { useTheme } from '../../design-system/theme';
import { ApiRequestError } from '../../services/api-client';
import { newIdempotencyKey } from '../../services/idempotency';
import { dayMonth } from '../../services/dates';
import { useSessionStore } from '../auth/session-store';
import { useActiveHousehold } from '../household/household-store';
import * as api from './planning-api';

/** Uma movimentação da lista, com o quadrado de seleção à esquerda. */
function CandidateRow({
  candidate,
  selected,
  disabled,
  onToggle,
  first,
}: {
  readonly candidate: OffsetCandidate;
  readonly selected: boolean;
  readonly disabled: boolean;
  readonly onToggle: () => void;
  readonly first: boolean;
}): React.JSX.Element {
  const { colors, radius, spacing } = useTheme();

  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected, disabled }}
      accessibilityLabel={`${candidate.description}, ${formatMoney(minor(candidate.amountMinor))}`}
      testID={`candidato-${candidate.transactionId}`}
      onPress={disabled ? undefined : onToggle}
      style={[
        styles.row,
        { paddingVertical: spacing.md, opacity: disabled && !selected ? 0.4 : 1 },
        first ? null : { borderTopColor: colors.divider, borderTopWidth: 1 },
      ]}
    >
      <View
        style={[
          styles.box,
          {
            borderRadius: radius.sm,
            borderColor: selected ? colors.brand : colors.borderStrong,
            backgroundColor: selected ? colors.brand : 'transparent',
          },
        ]}
      >
        {selected ? (
          <Text variant="rowMeta" style={{ color: colors.surfaceElevated }}>
            ✓
          </Text>
        ) : null}
      </View>

      <View style={styles.grow}>
        <Text variant="rowTitle" numberOfLines={1}>
          {candidate.description}
        </Text>
        <Text variant="rowMeta" tone="secondary">
          {[dayMonth(candidate.occurredAt), candidate.categoryName, candidate.accountName]
            .filter((part): part is string => Boolean(part))
            .join(' · ')}
        </Text>
      </View>

      <Text variant="moneyRow">{formatMoney(minor(candidate.amountMinor))}</Text>
    </Pressable>
  );
}

export function OffsetSettleSheet({
  visible,
  entry,
  onClose,
  onSettled,
}: {
  readonly visible: boolean;
  readonly entry: PlannedEntry;
  readonly onClose: () => void;
  readonly onSettled: (entry: PlannedEntry) => void;
}): React.JSX.Element {
  const { spacing } = useTheme();
  const accessToken = useSessionStore((state) => state.accessToken);
  const household = useActiveHousehold();

  const [candidates, setCandidates] = useState<OffsetCandidate[]>([]);
  const [selected, setSelected] = useState<readonly string[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible || !accessToken || !household) return;
    setLoading(true);
    setError(null);
    setSelected([]);
    api
      .listOffsetCandidates(accessToken, household.id, entry.id)
      .then(setCandidates)
      .catch((cause: unknown) =>
        setError(
          cause instanceof ApiRequestError
            ? cause.message
            : 'Não foi possível carregar os lançamentos.',
        ),
      )
      .finally(() => setLoading(false));
  }, [accessToken, entry.id, household, visible]);

  const total = useMemo(
    () =>
      candidates
        .filter((c) => selected.includes(c.transactionId))
        .reduce((soma, c) => soma + c.amountMinor, 0),
    [candidates, selected],
  );

  const outstanding = Math.max(0, entry.outstandingMinor);

  const toggle = useCallback((id: string) => {
    setSelected((atual) =>
      atual.includes(id) ? atual.filter((item) => item !== id) : [...atual, id],
    );
  }, []);

  const handleConfirm = useCallback(async () => {
    if (!accessToken || !household || selected.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      const resultado = await api.settleWithOffset(accessToken, household.id, entry.id, {
        transactionIds: [...selected],
        settledAt: new Date().toISOString().slice(0, 10),
        idempotencyKey: newIdempotencyKey(),
        expectedVersion: entry.version,
      });
      onSettled(resultado.plannedEntry);
      onClose();
    } catch (cause) {
      setError(cause instanceof ApiRequestError ? cause.message : 'Não foi possível abater agora.');
    } finally {
      setSaving(false);
    }
  }, [accessToken, entry.id, entry.version, household, onClose, onSettled, selected]);

  const excede = total > outstanding;
  const canConfirm = selected.length > 0 && !excede && !saving;

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title="Abater com lançamentos"
      subtitle={entry.description}
      testID="sheet-compensacao"
      footer={
        <View style={{ gap: spacing.sm }}>
          <Button
            testID="confirmar-compensacao"
            label={
              selected.length === 0
                ? 'Escolha os lançamentos'
                : `Abater ${formatMoney(minor(total))}`
            }
            loading={saving}
            disabled={!canConfirm}
            onPress={handleConfirm}
          />
          <Pressable
            testID="cancelar-compensacao"
            accessibilityRole="button"
            accessibilityLabel="Cancelar"
            hitSlop={10}
            onPress={onClose}
            style={{ paddingVertical: spacing.sm }}
          >
            <Text variant="rowTitle" tone="secondary" style={styles.centered}>
              Cancelar
            </Text>
          </Pressable>
        </View>
      }
    >
      <Card testID="card-compensacao-resumo">
        <View style={styles.summaryRow}>
          <Text variant="rowMeta" tone="secondary">
            {entry.nature === 'PAYABLE' ? 'Falta pagar' : 'Falta receber'}
          </Text>
          <Text variant="moneyRow">{formatMoney(minor(outstanding))}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text variant="rowMeta" tone="secondary">
            Selecionado
          </Text>
          <Text variant="moneyRow" tone={excede ? 'danger' : 'income'}>
            {formatMoney(minor(total))}
          </Text>
        </View>
        <View style={styles.summaryRow}>
          <Text variant="rowMeta" tone="secondary">
            Sobra em aberto
          </Text>
          <Text variant="moneyRow" tone="warning">
            {formatMoney(minor(Math.max(0, outstanding - total)))}
          </Text>
        </View>
      </Card>

      <View style={{ marginTop: spacing.md }}>
        <Banner
          kind="info"
          testID="banner-compensacao"
          message="O dinheiro destes lançamentos já saiu quando eles foram pagos. Abater não cria movimentação nova nem muda a categoria deles — só encontra as contas."
        />
      </View>

      {error === null ? null : (
        <View style={{ marginTop: spacing.md }}>
          <Banner kind="error" message={error} testID="erro-compensacao" />
        </View>
      )}

      <View style={{ marginTop: spacing.md }}>
        <Card testID="card-candidatos">
          {loading ? (
            <Text variant="rowMeta" tone="secondary">
              Carregando lançamentos…
            </Text>
          ) : candidates.length === 0 ? (
            <Text variant="rowMeta" tone="secondary">
              {entry.nature === 'PAYABLE'
                ? 'Nenhuma despesa disponível para abater. Lançamentos já usados em outra baixa, estornados ou nascidos de uma baixa não aparecem aqui.'
                : 'Nenhuma receita disponível para abater.'}
            </Text>
          ) : (
            <ScrollView style={styles.list} nestedScrollEnabled>
              {candidates.map((candidate, indice) => {
                const marcado = selected.includes(candidate.transactionId);
                return (
                  <CandidateRow
                    key={candidate.transactionId}
                    candidate={candidate}
                    selected={marcado}
                    // Trava a seleção quando somar mais que o saldo: é mais
                    // honesto do que deixar escolher e recusar no servidor.
                    disabled={!marcado && total + candidate.amountMinor > outstanding}
                    onToggle={() => toggle(candidate.transactionId)}
                    first={indice === 0}
                  />
                );
              })}
            </ScrollView>
          )}
        </Card>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  box: {
    width: 22,
    height: 22,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  grow: { flex: 1 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  centered: { textAlign: 'center' },
  list: { maxHeight: 280 },
});
