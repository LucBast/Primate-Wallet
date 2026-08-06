/**
 * Detalhe da conta prevista.
 *
 * Sem screenshot dedicado; reúne o que a especificação já define em 1d e 1e:
 * o resumo do valor (original / já pago / falta), o status como chip com ponto,
 * o histórico de baixas, os anexos e as ações. Nenhum padrão visual novo.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import type { Attachment, PlannedEntry } from '@ff/api-contracts';
import { formatDate, formatMoney, isoDate, minor } from '@ff/domain';
import { Banner } from '../../components/Banner';
import { Button } from '../../components/Button';
import { Card, ListRow, SectionLabel } from '../../components/Card';
import { Field } from '../../components/Field';
import { ProgressBar } from '../../components/ProgressBar';
import { ScreenHeader } from '../../components/ScreenHeader';
import { StatusChip } from '../../components/StatusChip';
import { Text } from '../../design-system/Text';
import { useTheme } from '../../design-system/theme';
import { ApiRequestError } from '../../services/api-client';
import { useSessionStore } from '../auth/session-store';
import { useActiveHousehold } from '../household/household-store';
import * as api from './planning-api';

export function PlannedEntryDetailScreen({
  entry: initial,
  onBack,
  onSettle,
}: {
  readonly entry: PlannedEntry;
  readonly onBack: () => void;
  readonly onSettle: (entry: PlannedEntry) => void;
}): React.JSX.Element {
  const { colors, layout, spacing } = useTheme();
  const accessToken = useSessionStore((state) => state.accessToken);
  const household = useActiveHousehold();

  const [entry, setEntry] = useState<PlannedEntry>(initial);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [cancelReason, setCancelReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  const canOperate =
    household?.myRole === 'OWNER' || household?.myRole === 'ADMIN' || household?.myRole === 'ADULT';

  const load = useCallback(async () => {
    if (!accessToken || !household) return;
    try {
      const [fresh, files] = await Promise.all([
        api.getPlannedEntry(accessToken, household.id, entry.id),
        api.listAttachments(accessToken, household.id, 'planned_entry', entry.id),
      ]);
      setEntry(fresh);
      setAttachments(files);
    } catch (cause) {
      setError(
        cause instanceof ApiRequestError ? cause.message : 'Não foi possível carregar os detalhes.',
      );
    }
  }, [accessToken, entry.id, household]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleCancel = useCallback(async () => {
    if (!accessToken || !household || cancelReason.trim() === '') return;
    setWorking(true);
    setError(null);
    try {
      setEntry(
        await api.cancelPlannedEntry(accessToken, household.id, entry.id, {
          reason: cancelReason.trim(),
          expectedVersion: entry.version,
        }),
      );
      setCancelReason('');
    } catch (cause) {
      setError(cause instanceof ApiRequestError ? cause.message : 'Não foi possível cancelar.');
    } finally {
      setWorking(false);
    }
  }, [accessToken, cancelReason, entry.id, entry.version, household]);

  const active = entry.status !== 'SETTLED' && entry.status !== 'CANCELED';

  return (
    <View style={[styles.flex, { backgroundColor: colors.surface }]}>
      <ScreenHeader
        title={entry.description}
        subtitle={`vence ${formatDate(isoDate(entry.dueDate))}`}
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
        <Card testID="card-resumo">
          <View style={styles.row}>
            <Text variant="rowMeta" tone="secondary">
              Valor original
            </Text>
            <Text variant="moneyRow">{formatMoney(minor(entry.originalAmountMinor))}</Text>
          </View>
          <View style={styles.row}>
            <Text variant="rowMeta" tone="secondary">
              {entry.nature === 'PAYABLE' ? 'Já pago' : 'Já recebido'}
            </Text>
            <Text variant="moneyRow" tone="income">
              {formatMoney(minor(entry.settledMinor))}
            </Text>
          </View>
          <View style={styles.row}>
            <Text variant="rowMeta" tone="secondary">
              {entry.nature === 'PAYABLE' ? 'Falta pagar' : 'Falta receber'}
            </Text>
            <Text variant="moneyRow" tone="warning">
              {formatMoney(minor(Math.max(0, entry.outstandingMinor)))}
            </Text>
          </View>

          <View style={{ marginTop: spacing.md }}>
            <ProgressBar
              percent={entry.settledPercent}
              tone={entry.status === 'SETTLED' ? 'income' : 'warning'}
              height={8}
              accessibilityLabel={`${entry.settledPercent}% pago`}
            />
            <View style={[styles.statusLine, { marginTop: spacing.sm }]}>
              <Text variant="rowMeta" tone="secondary">
                {`${entry.settledPercent}% pago · status:`}
              </Text>
              <StatusChip
                status={
                  entry.status === 'CANCELED'
                    ? 'estornado'
                    : entry.status === 'SETTLED'
                      ? entry.nature === 'PAYABLE'
                        ? 'pago'
                        : 'recebido'
                      : entry.overdue
                        ? 'vencido'
                        : entry.status === 'PARTIAL'
                          ? 'parcial'
                          : 'aberto'
                }
                {...(entry.overdue
                  ? {
                      detail: `há ${entry.overdueDays} ${entry.overdueDays === 1 ? 'dia' : 'dias'}`,
                    }
                  : {})}
              />
            </View>
          </View>
        </Card>

        <View style={{ marginTop: spacing.md }}>
          <Card padded={false}>
            <ListRow first title="Categoria" meta={entry.categoryName ?? 'Sem categoria'} />
            <ListRow title="Membro" meta={entry.memberName ?? '—'} />
            <ListRow title="Conta prevista" meta={entry.expectedAccountName ?? 'Não definida'} />
            <ListRow title="Competência" meta={formatDate(isoDate(entry.competenceDate))} />
            {entry.installmentTotal === null ? null : (
              <ListRow
                title="Parcela"
                meta={`${String(entry.installmentNumber).padStart(2, '0')}/${String(entry.installmentTotal).padStart(2, '0')}`}
              />
            )}
            {entry.reminderDaysBefore === null ? null : (
              <ListRow
                title="Lembrete"
                meta={`${entry.reminderDaysBefore} ${entry.reminderDaysBefore === 1 ? 'dia' : 'dias'} antes do vencimento`}
              />
            )}
          </Card>
        </View>

        {attachments.length === 0 ? null : (
          <View style={{ marginTop: spacing.xl }}>
            <SectionLabel>{`ANEXOS · ${attachments.length}`}</SectionLabel>
            <Card padded={false}>
              {attachments.map((attachment, index) => (
                <ListRow
                  key={attachment.id}
                  first={index === 0}
                  title={attachment.fileName}
                  meta={`${Math.floor(attachment.sizeBytes / 1024)} KB · ${formatDate(isoDate(attachment.createdAt.slice(0, 10)))}`}
                />
              ))}
            </Card>
          </View>
        )}

        {error === null ? null : (
          <View style={{ marginTop: spacing.md }}>
            <Banner kind="error" message={error} testID="erro-detalhe" />
          </View>
        )}

        {active && canOperate ? (
          <>
            <View style={{ marginTop: spacing.xl }}>
              <Button
                testID="dar-baixa"
                label={
                  entry.status === 'PARTIAL'
                    ? `Completar ${formatMoney(minor(entry.outstandingMinor))}`
                    : 'Dar baixa'
                }
                onPress={() => onSettle(entry)}
              />
            </View>

            <View style={{ marginTop: spacing.xxl }}>
              <SectionLabel>CANCELAR</SectionLabel>
              <Field
                label="Motivo · obrigatório"
                testID="campo-motivo-cancelamento"
                value={cancelReason}
                onChangeText={setCancelReason}
                placeholder="Cobrança indevida"
              />
              <View style={{ marginTop: spacing.md }}>
                <Button
                  testID="cancelar-conta-prevista"
                  label="Cancelar conta prevista"
                  variant="destructive"
                  loading={working}
                  disabled={cancelReason.trim() === ''}
                  onPress={handleCancel}
                />
              </View>
              <View style={{ marginTop: spacing.sm }}>
                <Banner
                  kind="warning"
                  testID="banner-cancelamento"
                  message="Cancelar não apaga o registro: ele fica no histórico com o motivo. Contas com baixa registrada precisam ter a baixa estornada antes."
                />
              </View>
            </View>
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingTop: 4 },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  statusLine: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
