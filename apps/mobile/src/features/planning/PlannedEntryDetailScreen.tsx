/**
 * Detalhe da conta prevista.
 *
 * Sem screenshot dedicado; reúne o que a especificação já define em 1d e 1e:
 * o resumo do valor (original / já pago / falta), o status como chip com ponto,
 * o histórico de baixas, os anexos e as ações. Nenhum padrão visual novo.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import type { Attachment, PlannedEntry, Settlement } from '@ff/api-contracts';
import { formatMoney, minor } from '@ff/domain';
import { Badge } from '../../components/Badge';
import { Banner } from '../../components/Banner';
import { Button } from '../../components/Button';
import { Card, IconBadge } from '../../components/Card';
import { Field } from '../../components/Field';
import { ProgressBar } from '../../components/ProgressBar';
import { ScreenHeader } from '../../components/ScreenHeader';
import { Text, type TextTone } from '../../design-system/Text';
import { useTheme } from '../../design-system/theme';
import { icons, iconSize } from '../../design-system/icons';
import { ApiRequestError } from '../../services/api-client';
import { dayMonth, longMonthLabel } from '../../services/dates';
import { useSessionStore } from '../auth/session-store';
import { useActiveHousehold } from '../household/household-store';
import * as api from './planning-api';
import * as settlementApi from './settlement-api';

/** Badge do formato do anexo: "PDF", "JPG" (8g). */
function formatOf(mimeType: string): string {
  const subtype = mimeType.split('/')[1] ?? 'arq';
  return (subtype === 'jpeg' ? 'jpg' : subtype).toUpperCase();
}

/** Linha "rótulo à esquerda, valor à direita" do card de campos (8g). */
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

/** "● Vencido · há 4 dias" — o estado como texto, na cor do estado. */
function statusOf(entry: PlannedEntry): { readonly text: string; readonly tone: TextTone } {
  if (entry.status === 'CANCELED') return { text: '◌ Cancelada', tone: 'secondary' };
  if (entry.status === 'SETTLED') {
    return { text: entry.nature === 'PAYABLE' ? '● Paga' : '● Recebida', tone: 'income' };
  }
  if (entry.status === 'PARTIAL') return { text: '● Parcial', tone: 'warning' };
  if (entry.overdue) {
    return {
      text: `● Vencido · há ${entry.overdueDays} ${entry.overdueDays === 1 ? 'dia' : 'dias'}`,
      tone: 'danger',
    };
  }
  return { text: '● Aberta', tone: 'secondary' };
}

export function PlannedEntryDetailScreen({
  entry: initial,
  onBack,
  onSettle,
}: {
  readonly entry: PlannedEntry;
  readonly onBack: () => void;
  readonly onSettle: (entry: PlannedEntry) => void;
}): React.JSX.Element {
  const { colors, layout, radius, spacing } = useTheme();
  const accessToken = useSessionStore((state) => state.accessToken);
  const household = useActiveHousehold();

  const [entry, setEntry] = useState<PlannedEntry>(initial);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [cancelReason, setCancelReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  const canOperate =
    household?.myRole === 'OWNER' || household?.myRole === 'ADMIN' || household?.myRole === 'ADULT';

  const load = useCallback(async () => {
    if (!accessToken || !household) return;
    try {
      const [fresh, files, baixas] = await Promise.all([
        api.getPlannedEntry(accessToken, household.id, entry.id),
        api.listAttachments(accessToken, household.id, 'planned_entry', entry.id),
        settlementApi.listSettlements(accessToken, household.id, entry.id),
      ]);
      setEntry(fresh);
      setAttachments(files);
      setSettlements([...baixas]);
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
  const status = statusOf(entry);

  return (
    <View style={[styles.flex, { backgroundColor: colors.surface }]}>
      <ScreenHeader title={entry.description} onBack={onBack} size="screen" />

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
            {/* Status como texto inline, com o ponto na cor do estado. */}
            <Text variant="rowMeta" tone="secondary" style={{ marginTop: spacing.sm }}>
              {`${entry.settledPercent}% ${entry.nature === 'PAYABLE' ? 'pago' : 'recebido'} · status: `}
              <Text variant="rowMeta" tone={status.tone}>
                {status.text}
              </Text>
            </Text>
          </View>
        </Card>

        <View style={{ marginTop: spacing.md }}>
          <Card padded={false} testID="card-campos">
            <FieldRow first label="Categoria" value={entry.categoryName ?? 'Sem categoria'} />
            <FieldRow label="Membro" value={entry.memberName ?? '—'} />
            <FieldRow label="Conta prevista" value={entry.expectedAccountName ?? 'Não definida'} />
            <FieldRow
              label="Competência"
              value={`${longMonthLabel(entry.competenceDate)} ${entry.competenceDate.slice(0, 4)} · vence ${dayMonth(entry.dueDate)}`}
            />
            {entry.installmentTotal === null ? null : (
              <FieldRow
                label="Parcela"
                value={`${String(entry.installmentNumber).padStart(2, '0')}/${String(entry.installmentTotal).padStart(2, '0')}`}
              />
            )}
            {entry.reminderDaysBefore === null ? null : (
              <FieldRow
                label="Lembrete"
                value={`${entry.reminderDaysBefore} ${entry.reminderDaysBefore === 1 ? 'dia' : 'dias'} antes`}
              />
            )}
          </Card>
        </View>

        {/* O CTA vem logo depois dos campos, não no fim da tela. */}
        {active && canOperate ? (
          <View style={{ marginTop: spacing.md }}>
            <Button
              testID="dar-baixa"
              label={
                entry.status === 'PARTIAL'
                  ? 'Completar baixa'
                  : entry.nature === 'PAYABLE'
                    ? 'Dar baixa'
                    : 'Registrar recebimento'
              }
              onPress={() => onSettle(entry)}
            />
          </View>
        ) : null}

        {/* Histórico de baixas — mesma linha da 1e; estornada não conta. */}
        {settlements.length === 0 ? null : (
          <View style={{ marginTop: spacing.md }}>
            <Card testID="card-historico">
              <View style={styles.cardHeader}>
                <Text variant="rowTitle">Histórico de baixas</Text>
                <Text variant="rowMeta" tone="secondary">
                  {`${settlements.length} ${settlements.length === 1 ? 'registro' : 'registros'}`}
                </Text>
              </View>
              {settlements.map((settlement) => {
                const estornada = settlement.reversedAt !== null;
                const Marca = estornada ? icons.estorno : icons.confirmado;
                return (
                  <View key={settlement.id} style={styles.settlementRow}>
                    <IconBadge background={estornada ? colors.chipNeutral : colors.incomeSoft}>
                      <Marca
                        size={iconSize.row}
                        color={estornada ? colors.textSecondary : colors.income}
                      />
                    </IconBadge>
                    <View style={styles.settlementTexts}>
                      <Text
                        variant="rowTitle"
                        style={
                          estornada
                            ? { ...styles.reversed, color: colors.textSecondary }
                            : undefined
                        }
                      >
                        {`${formatMoney(minor(settlement.netAmountMinor))}${
                          settlement.accountName === null ? '' : ` · ${settlement.accountName}`
                        }`}
                      </Text>
                      <Text variant="rowMeta" tone={estornada ? 'danger' : 'secondary'}>
                        {[
                          `${dayMonth(settlement.settledAt.slice(0, 10))}`,
                          settlement.createdByName === null
                            ? null
                            : `por ${settlement.createdByName}`,
                          estornada
                            ? `● Estornada${settlement.reversalReason === null ? '' : ` — ${settlement.reversalReason}`}`
                            : null,
                        ]
                          .filter((part): part is string => Boolean(part))
                          .join(' · ')}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </Card>
          </View>
        )}

        {/* Anexos: chip por arquivo com badge do formato + área "+ Foto". */}
        <View style={{ marginTop: spacing.md }}>
          <Card testID="card-anexos">
            <View style={styles.cardHeader}>
              <Text variant="rowTitle">Anexos</Text>
              <Text variant="rowMeta" tone="brand">
                + Adicionar
              </Text>
            </View>
            <View style={[styles.attachments, { marginTop: spacing.sm }]}>
              {attachments.map((attachment) => (
                <View
                  key={attachment.id}
                  testID={`anexo-${attachment.id}`}
                  style={[
                    styles.attachment,
                    { borderColor: colors.border, borderRadius: radius.md },
                  ]}
                >
                  <Badge label={formatOf(attachment.mimeType)} tone="warning" />
                  <View style={styles.settlementTexts}>
                    <Text variant="rowMeta">{attachment.fileName}</Text>
                    <Text variant="rowMeta" tone="secondary">
                      {`${Math.floor(attachment.sizeBytes / 1024)} KB`}
                    </Text>
                  </View>
                </View>
              ))}
              <View
                style={[styles.photoSlot, { borderColor: colors.border, borderRadius: radius.md }]}
              >
                <Text variant="rowMeta" tone="secondary">
                  + Foto
                </Text>
              </View>
            </View>
          </Card>
        </View>

        {error === null ? null : (
          <View style={{ marginTop: spacing.md }}>
            <Banner kind="error" message={error} testID="erro-detalhe" />
          </View>
        )}

        {active && canOperate ? (
          <>
            {/* O bloco CANCELAR é um card só, como no screenshot. */}
            <View style={{ marginTop: spacing.md }}>
              <Card testID="card-cancelar">
                <Text variant="label" tone="secondary">
                  Cancelar
                </Text>
                <View style={{ marginTop: spacing.sm }}>
                  <Field
                    label="Motivo · obrigatório"
                    testID="campo-motivo-cancelamento"
                    value={cancelReason}
                    onChangeText={setCancelReason}
                    placeholder="Ex.: serviço cancelado com a operadora"
                  />
                </View>
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
              </Card>
            </View>

            <View style={{ marginTop: spacing.md }}>
              <Banner
                kind="warning"
                testID="banner-cancelamento"
                message="Cancelar não apaga o registro: a conta fica ◌ Cancelada, some do previsto do mês e continua no histórico com o motivo e o autor."
              />
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
  cardHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  settlementRow: { alignItems: 'center', flexDirection: 'row', gap: 12, paddingTop: 10 },
  settlementTexts: { flex: 1, gap: 2 },
  reversed: { textDecorationLine: 'line-through' },
  attachments: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  attachment: {
    alignItems: 'center',
    borderWidth: 1,
    flexDirection: 'row',
    flexGrow: 1,
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  photoSlot: {
    alignItems: 'center',
    borderStyle: 'dashed',
    borderWidth: 1.5,
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
});
