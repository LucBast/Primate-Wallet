/**
 * Tela 3d — Atividade / auditoria (screenshots/3d-atividade.png).
 *
 * Lista agrupada por dia. Cada item é uma frase legível
 * "{Autor} {ação} {objeto}" + hora, e, quando existe, a linha "antes → depois".
 * Banner infoSoft explica o que é registrado e quem enxerga.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import type { AuditEntry } from '@ff/api-contracts';
import { formatDate, isoDate } from '@ff/domain';
import { Banner } from '../../components/Banner';
import { Card, SectionLabel } from '../../components/Card';
import { ScreenHeader } from '../../components/ScreenHeader';
import { EmptyState, RecoverableError, SkeletonList } from '../../components/states';
import { Text } from '../../design-system/Text';
import { useTheme } from '../../design-system/theme';
import { ApiRequestError } from '../../services/api-client';
import { useSessionStore } from '../auth/session-store';
import * as api from './household-api';
import { useActiveHousehold } from './household-store';

/** Frases em pt-BR para cada ação auditada. */
const ACTION_PHRASE: Record<string, string> = {
  HOUSEHOLD_CREATED: 'criou a família',
  HOUSEHOLD_UPDATED: 'alterou os dados da família',
  MEMBER_INVITED: 'convidou um membro',
  INVITATION_ACCEPTED: 'entrou na família',
  INVITATION_REVOKED: 'revogou um convite',
  MEMBER_UPDATED: 'alterou permissões de um membro',
  OWNERSHIP_TRANSFERRED: 'transferiu a propriedade da família',
  ACCOUNT_CREATED: 'criou uma conta',
  ACCOUNT_UPDATED: 'alterou uma conta',
  ACCOUNT_ARCHIVED: 'arquivou uma conta',
  BALANCE_ADJUSTED: 'ajustou o saldo de uma conta',
  CATEGORY_CREATED: 'criou uma categoria',
  CATEGORY_UPDATED: 'alterou uma categoria',
  PLANNED_ENTRY_CREATED: 'criou uma conta prevista',
  PLANNED_ENTRY_SETTLED: 'deu baixa em uma conta prevista',
  TRANSACTION_CREATED: 'registrou uma movimentação',
  TRANSACTION_REVERSED: 'estornou uma movimentação',
  TRANSFER_CREATED: 'registrou uma transferência',
  CARD_PURCHASE_CREATED: 'registrou uma compra no cartão',
  CARD_STATEMENT_PAID: 'pagou uma fatura',
  APPROVAL_APPROVED: 'aprovou um lançamento',
  APPROVAL_REJECTED: 'recusou um lançamento',
  EXPORT_REQUESTED: 'exportou dados da família',
};

function phraseFor(entry: AuditEntry): string {
  const actor = entry.actorName ?? 'Alguém';
  return `${actor} ${ACTION_PHRASE[entry.action] ?? entry.action.toLowerCase().replace(/_/g, ' ')}`;
}

/** "antes → depois" só quando o registro guardou os dois lados. */
function changeLine(entry: AuditEntry): string | null {
  if (!entry.beforeData || !entry.afterData) return null;
  const changed = Object.keys(entry.afterData).filter(
    (key) => JSON.stringify(entry.afterData?.[key]) !== JSON.stringify(entry.beforeData?.[key]),
  );
  if (changed.length === 0) return null;
  return changed
    .map(
      (key) =>
        `${key}: ${String(entry.beforeData?.[key] ?? '—')} → ${String(entry.afterData?.[key] ?? '—')}`,
    )
    .join(' · ');
}

const TIME_FORMAT = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });

export function ActivityScreen({ onBack }: { readonly onBack: () => void }): React.JSX.Element {
  const { colors, layout, spacing } = useTheme();
  const accessToken = useSessionStore((state) => state.accessToken);
  const household = useActiveHousehold();

  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!accessToken || !household) return;
    setError(null);
    try {
      setEntries(await api.listAudit(accessToken, household.id));
    } catch (cause) {
      setError(
        cause instanceof ApiRequestError
          ? cause.message
          : 'Não foi possível carregar a atividade agora.',
      );
    }
  }, [accessToken, household]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Agrupa por dia, preservando a ordem decrescente vinda do servidor. */
  const days = useMemo(() => {
    if (entries === null) return [];
    const groups = new Map<string, AuditEntry[]>();
    for (const entry of entries) {
      const day = entry.createdAt.slice(0, 10);
      const bucket = groups.get(day);
      if (bucket) bucket.push(entry);
      else groups.set(day, [entry]);
    }
    return [...groups.entries()];
  }, [entries]);

  return (
    <View style={[styles.flex, { backgroundColor: colors.surface }]}>
      <ScreenHeader title="Atividade da família" onBack={onBack} size="screen" />

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingHorizontal: layout.screenPaddingH, paddingBottom: spacing.xxxl },
        ]}
      >
        <Banner
          kind="info"
          testID="banner-auditoria"
          message="Registramos toda criação, alteração, baixa, estorno, aprovação e mudança de permissão. Esta lista é visível ao proprietário e aos administradores."
        />

        {error !== null ? (
          <View style={{ marginTop: spacing.md }}>
            <RecoverableError message={error} onRetry={() => void load()} testID="erro-atividade" />
          </View>
        ) : entries === null ? (
          <View style={{ marginTop: spacing.md }}>
            <SkeletonList rows={5} />
          </View>
        ) : entries.length === 0 ? (
          <EmptyState
            title="Nada por aqui ainda"
            subtitle="Assim que a família começar a usar o aplicativo, a atividade aparece aqui."
          />
        ) : (
          days.map(([day, items]) => (
            <View key={day} style={{ marginTop: spacing.xl }}>
              <SectionLabel>{formatDate(isoDate(day)).toUpperCase()}</SectionLabel>
              <Card padded={false}>
                {items.map((entry, index) => {
                  const change = changeLine(entry);
                  return (
                    <View
                      key={entry.id}
                      testID={`atividade-${entry.id}`}
                      style={[
                        styles.entry,
                        index > 0 && { borderTopColor: colors.divider, borderTopWidth: 1 },
                      ]}
                    >
                      <View style={styles.entryHeader}>
                        <Text variant="rowTitle" style={styles.entryTitle}>
                          {phraseFor(entry)}
                        </Text>
                        <Text variant="rowMeta" tone="secondary">
                          {TIME_FORMAT.format(new Date(entry.createdAt))}
                        </Text>
                      </View>
                      {change === null ? null : (
                        <Text variant="rowMeta" tone="secondary">
                          {change}
                        </Text>
                      )}
                      {typeof entry.metadata?.['reason'] === 'string' ? (
                        <Text variant="rowMeta" tone="secondary">
                          {`Motivo: ${entry.metadata['reason']}`}
                        </Text>
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

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingTop: 4 },
  entry: { gap: 3, paddingVertical: 11 },
  entryHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
  },
  entryTitle: { flex: 1 },
});
