/**
 * Aprovações pendentes — a lista que o link da 3a abre.
 *
 * O pacote só desenha a FOLHA de decisão (3c). A lista não tem screenshot, e
 * pela regra 8 do CLAUDE.md ela é montada com o que já existe e foi conferido
 * em outras telas: SectionLabel + Card de ListRow, como a 3a e a 3d. Tocar em
 * uma linha abre a 3c, que é onde a decisão acontece. Registrado em DECISIONS.
 *
 * Os decididos continuam na lista, abaixo dos pendentes: recusar não apaga
 * nada (docs/04 §16), e quem pediu precisa poder ver o desfecho e o motivo.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import type { ApprovalRequest } from '@ff/api-contracts';
import { formatMoney, minor } from '@ff/domain';
import { Avatar } from '../../components/Avatar';
import { Card, ListRow, SectionLabel } from '../../components/Card';
import { ScreenHeader } from '../../components/ScreenHeader';
import { EmptyState, RecoverableError, SkeletonList } from '../../components/states';
import { Text } from '../../design-system/Text';
import { useTheme } from '../../design-system/theme';
import { icons, iconSize } from '../../design-system/icons';
import { ApiRequestError } from '../../services/api-client';
import { useSessionStore } from '../auth/session-store';
import { useActiveHousehold } from './household-store';
import * as api from './approval-api';
import { ApprovalSheet } from './ApprovalSheet';
import { requestedAtLabel } from './approval-copy';

export type ApprovalsScreenProps = {
  readonly onBack: () => void;
};

/**
 * "● Recusada por Ana · Passou do combinado" — o desfecho, legível.
 *
 * O ● vem junto do texto, como na linha de convite pendente da 3a: o estado
 * nunca é só cor (CLAUDE.md item 6). Um chip separado repetiria a mesma
 * informação duas vezes na linha.
 */
function decisionLine(request: ApprovalRequest): string {
  const verb = request.status === 'APPROVED' ? '● Aprovada' : '● Recusada';
  const by = request.decidedByName === null ? '' : ` por ${request.decidedByName}`;
  const why = request.decisionMessage === null ? '' : ` · ${request.decisionMessage}`;
  return `${verb}${by}${why}`;
}

export function ApprovalsScreen({ onBack }: ApprovalsScreenProps): React.JSX.Element {
  const { colors, layout, spacing } = useTheme();
  const accessToken = useSessionStore((state) => state.accessToken);
  const household = useActiveHousehold();

  const [items, setItems] = useState<ApprovalRequest[] | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [open, setOpen] = useState<ApprovalRequest | null>(null);
  const [sheetError, setSheetError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!accessToken || !household) return;
    setError(null);
    try {
      const list = await api.listApprovals(accessToken, household.id);
      setItems(list.items);
      setPendingCount(list.pendingCount);
    } catch (cause) {
      setError(
        cause instanceof ApiRequestError
          ? cause.message
          : 'Não foi possível carregar as aprovações agora.',
      );
    }
  }, [accessToken, household]);

  useEffect(() => {
    void load();
  }, [load]);

  const decide = useCallback(
    async (action: 'approve' | 'reject', message: string | undefined) => {
      if (!accessToken || !household || open === null) return;
      setSheetError(null);
      try {
        const input = {
          expectedVersion: open.version,
          ...(message === undefined ? {} : { message }),
        };
        await (action === 'approve'
          ? api.approve(accessToken, household.id, open.id, input)
          : api.reject(accessToken, household.id, open.id, input));
        setOpen(null);
        await load();
      } catch (cause) {
        setSheetError(
          cause instanceof ApiRequestError ? cause.message : 'Não foi possível decidir agora.',
        );
        // Conflito de versão: outra pessoa decidiu antes. Recarrega para que a
        // lista pare de oferecer uma decisão que já não existe.
        if (cause instanceof ApiRequestError && cause.code === 'VERSION_CONFLICT') await load();
      }
    },
    [accessToken, household, load, open],
  );

  const pendentes = items?.filter((item) => item.status === 'PENDING') ?? [];
  const decididos = items?.filter((item) => item.status !== 'PENDING') ?? [];
  const Check = icons.confirmado;

  return (
    <View style={[styles.flex, { backgroundColor: colors.surface }]}>
      <ScreenHeader title="Aprovações pendentes" onBack={onBack} />

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
        {error === null ? null : (
          <View style={{ marginBottom: spacing.md }}>
            <RecoverableError
              message={error}
              onRetry={() => void load()}
              testID="erro-aprovacoes"
            />
          </View>
        )}

        {items === null ? (
          <SkeletonList rows={3} />
        ) : items.length === 0 ? (
          <EmptyState
            icon={<Check size={iconSize.action} color={colors.brand} />}
            title="Nenhuma aprovação pendente"
            subtitle="Quando alguém supervisionado lançar acima da regra, aparece aqui."
          />
        ) : (
          <>
            {pendentes.length === 0 ? null : (
              <>
                <SectionLabel>{`AGUARDANDO · ${pendingCount}`}</SectionLabel>
                <Card padded={false} testID="card-pendentes">
                  {pendentes.map((item, index) => (
                    <ListRow
                      key={item.id}
                      first={index === 0}
                      testID={`aprovacao-${item.id}`}
                      title={item.transaction.description}
                      meta={`${item.requestedByName} · ${requestedAtLabel(item.createdAt)}`}
                      metaTone="secondary"
                      left={<Avatar name={item.requestedByName} seed={item.requestedByMemberId} />}
                      right={
                        <Text variant="moneyRow" tone="expense">
                          {formatMoney(minor(item.transaction.amountMinor))}
                        </Text>
                      }
                      onPress={() => {
                        setSheetError(null);
                        setOpen(item);
                      }}
                      showChevron
                    />
                  ))}
                </Card>
              </>
            )}

            {decididos.length === 0 ? null : (
              <View style={{ marginTop: spacing.xl }}>
                <SectionLabel>DECIDIDAS</SectionLabel>
                <Card padded={false} testID="card-decididas">
                  {decididos.map((item, index) => (
                    <ListRow
                      key={item.id}
                      first={index === 0}
                      testID={`decidida-${item.id}`}
                      title={item.transaction.description}
                      meta={decisionLine(item)}
                      metaTone={item.status === 'APPROVED' ? 'income' : 'danger'}
                      left={
                        <Avatar
                          name={item.requestedByName}
                          seed={item.requestedByMemberId}
                          tone="neutral"
                        />
                      }
                      right={
                        <Text variant="moneyRow" tone="tertiary">
                          {formatMoney(minor(item.transaction.amountMinor))}
                        </Text>
                      }
                    />
                  ))}
                </Card>
              </View>
            )}
          </>
        )}

        {items !== null && items.length > 0 && pendentes.length === 0 ? (
          <View style={{ marginTop: spacing.md }}>
            <Text variant="rowMeta" tone="secondary">
              Nenhuma aprovação aguardando decisão.
            </Text>
          </View>
        ) : null}
      </ScrollView>

      <ApprovalSheet
        request={open}
        error={sheetError}
        onClose={() => setOpen(null)}
        onApprove={(message) => decide('approve', message)}
        onReject={(message) => decide('reject', message)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: 4 },
  flex: { flex: 1 },
});
