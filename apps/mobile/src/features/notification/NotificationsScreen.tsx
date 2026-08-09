/**
 * Tela 6d — Notificações (screenshots/6d-notificacoes.png).
 *
 * Ordem dos blocos, conferida contra o screenshot:
 *   1. Header "‹ Notificações" + ação "Preferências ⚙" à direita
 *   2. "HOJE" + card com uma linha por aviso; o de aprovação traz
 *      "Revisar" e "Depois" na própria linha
 *   3. "PREFERÊNCIAS" + card com quatro linhas de toggle
 *   4. Banner infoSoft sobre validação de sessão, cancelamento e fuso
 *
 * O texto do aviso vem PRONTO do servidor. Se a tela remontasse a frase a
 * partir do tipo, o push e a central diriam coisas diferentes sobre o mesmo
 * fato — e a pessoa desconfiaria dos dois.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import type { Notification, NotificationPreferences } from '@ff/api-contracts';
import { formatMoney, minor } from '@ff/domain';
import { Banner } from '../../components/Banner';
import { Button } from '../../components/Button';
import { Card, IconBadge, ListRow, SectionLabel } from '../../components/Card';
import { ScreenHeader } from '../../components/ScreenHeader';
import { Toggle } from '../../components/Toggle';
import { EmptyState, RecoverableError, SkeletonList } from '../../components/states';
import { Text } from '../../design-system/Text';
import { useTheme } from '../../design-system/theme';
import { icons, iconSize } from '../../design-system/icons';
import { withAlpha } from '../../design-system/spec-values';
import { ApiRequestError } from '../../services/api-client';
import { useSessionStore } from '../auth/session-store';
import { useActiveHousehold } from '../household/household-store';
import * as api from './notification-api';

export type NotificationsScreenProps = {
  readonly onBack: () => void;
  /** Abre o contexto do aviso — aprovação, conta prevista ou fatura. */
  readonly onOpen: (notification: Notification) => void;
};

/** "há 20 min" · "há 3 h" · "ontem" — como no screenshot. */
function relativo(iso: string): string {
  const minutos = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutos < 1) return 'agora';
  if (minutos < 60) return `há ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `há ${horas} h`;
  const dias = Math.floor(horas / 24);
  return dias === 1 ? 'ontem' : `há ${dias} dias`;
}

/** Cada tipo tem o seu par de cor e ícone (COMPONENT-SPECS §Ícones). */
function visual(kind: Notification['kind']): {
  readonly icon: keyof typeof icons;
  readonly tone: 'pending' | 'danger' | 'info' | 'warning';
} {
  switch (kind) {
    case 'APPROVAL_REQUESTED':
      return { icon: 'inicio', tone: 'pending' };
    case 'OVERDUE':
      return { icon: 'energia', tone: 'danger' };
    case 'DUE_SOON':
      return { icon: 'planejamento', tone: 'warning' };
    case 'STATEMENT_CLOSING':
    case 'STATEMENT_DUE':
    case 'CARD_LIMIT':
      return { icon: 'cartao', tone: 'info' };
    default:
      return { icon: 'notificacao', tone: 'info' };
  }
}

export function NotificationsScreen({
  onBack,
  onOpen,
}: NotificationsScreenProps): React.JSX.Element {
  const { colors, layout, spacing } = useTheme();
  const accessToken = useSessionStore((state) => state.accessToken);
  const household = useActiveHousehold();

  const [items, setItems] = useState<Notification[] | null>(null);
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!accessToken || !household) return;
    setError(null);
    try {
      const [lista, preferencias] = await Promise.all([
        api.listNotifications(accessToken, household.id),
        api.getPreferences(accessToken, household.id),
      ]);
      setItems([...lista.items]);
      setPrefs(preferencias);
    } catch (cause) {
      setError(
        cause instanceof ApiRequestError
          ? cause.message
          : 'Não foi possível carregar as notificações agora.',
      );
    }
  }, [accessToken, household]);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * Liga e desliga com atualização otimista.
   *
   * Um toggle que espera a rede para mexer parece quebrado. Se o servidor
   * recusar, o estado volta e o erro aparece — e a `expectedVersion` garante que
   * duas pessoas mexendo ao mesmo tempo não se sobrescrevam em silêncio.
   */
  const alternar = useCallback(
    async (campo: keyof NotificationPreferences, valor: boolean) => {
      if (!accessToken || !household || prefs === null) return;
      const anterior = prefs;
      setPrefs({ ...prefs, [campo]: valor });
      try {
        setPrefs(
          await api.updatePreferences(accessToken, household.id, {
            [campo]: valor,
            expectedVersion: anterior.version,
          }),
        );
      } catch (cause) {
        setPrefs(anterior);
        setError(
          cause instanceof ApiRequestError
            ? cause.message
            : 'Não foi possível salvar a preferência agora.',
        );
      }
    },
    [accessToken, household, prefs],
  );

  const decidir = useCallback(
    async (item: Notification, acao: 'abrir' | 'depois') => {
      if (!accessToken || !household) return;
      if (acao === 'depois') {
        await api.dismiss(accessToken, household.id, item.id).catch(() => undefined);
        await load();
        return;
      }
      await api.markRead(accessToken, household.id, item.id).catch(() => undefined);
      onOpen(item);
    },
    [accessToken, household, load, onOpen],
  );

  const Sino = icons.notificacao;

  return (
    <View style={[styles.flex, { backgroundColor: colors.surface }]}>
      <ScreenHeader
        title="Notificações"
        onBack={onBack}
        right={
          <Text variant="rowTitle" tone="brand">
            Preferências ⚙
          </Text>
        }
      />

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
            <RecoverableError message={error} onRetry={() => void load()} testID="erro-avisos" />
          </View>
        )}

        {items === null ? (
          <SkeletonList rows={3} />
        ) : items.length === 0 ? (
          <EmptyState
            icon={<Sino size={iconSize.action} color={colors.brand} />}
            title="Nenhum aviso por aqui"
            subtitle="Vencimentos, faturas e pedidos de aprovação aparecem nesta tela."
          />
        ) : (
          <>
            <SectionLabel>HOJE</SectionLabel>
            <Card padded={false} testID="card-avisos">
              {items.map((item, index) => {
                const { icon, tone } = visual(item.kind);
                const Icone = icons[icon];
                const cor = colors[tone];
                const aprovacao = item.kind === 'APPROVAL_REQUESTED';
                return (
                  <ListRow
                    key={item.id}
                    first={index === 0}
                    testID={`aviso-${item.id}`}
                    title={
                      item.amountMinor === null
                        ? item.title
                        : `${item.title} · ${formatMoney(minor(item.amountMinor))}`
                    }
                    meta={`${item.body ?? ''}${item.body === null ? '' : ' · '}${relativo(item.createdAt)}`}
                    metaTone="secondary"
                    left={
                      <IconBadge background={withAlpha(cor, 0.14)}>
                        <Icone size={iconSize.row} color={cor} />
                      </IconBadge>
                    }
                    // A aprovação decide na própria linha; os demais abrem o
                    // contexto no toque, como manda a 6d.
                    {...(aprovacao ? {} : { onPress: () => void decidir(item, 'abrir') })}
                    showChevron={!aprovacao}
                    below={
                      aprovacao ? (
                        <View style={styles.acoes}>
                          <Button
                            size="sm"
                            label="Revisar"
                            style={styles.acao}
                            testID={`revisar-${item.id}`}
                            onPress={() => void decidir(item, 'abrir')}
                          />
                          <Button
                            size="sm"
                            variant="secondary"
                            label="Depois"
                            style={styles.acao}
                            testID={`depois-${item.id}`}
                            onPress={() => void decidir(item, 'depois')}
                          />
                        </View>
                      ) : undefined
                    }
                  />
                );
              })}
            </Card>
          </>
        )}

        {prefs === null ? null : (
          <View style={{ marginTop: spacing.xl }}>
            <SectionLabel>PREFERÊNCIAS</SectionLabel>
            <Card padded={false} testID="card-preferencias">
              <PreferenceRow
                first
                title="Vencimentos"
                subtitle={`avisar ${prefs.dueDaysBefore} dias antes, às ${prefs.dueHour}h`}
                value={prefs.dueEnabled}
                testID="pref-vencimentos"
                onChange={(valor) => void alternar('dueEnabled', valor)}
              />
              <PreferenceRow
                title="Faturas e limite do cartão"
                subtitle="fechamento, vencimento e 80% do limite"
                value={prefs.statementEnabled}
                testID="pref-faturas"
                onChange={(valor) => void alternar('statementEnabled', valor)}
              />
              <PreferenceRow
                title="Aprovações"
                subtitle="alerta imediato"
                value={prefs.approvalEnabled}
                testID="pref-aprovacoes"
                onChange={(valor) => void alternar('approvalEnabled', valor)}
              />
              <PreferenceRow
                title="Resumo diário"
                subtitle={`silencioso, às ${prefs.dailySummaryHour}h`}
                value={prefs.dailySummaryEnabled}
                testID="pref-resumo"
                onChange={(valor) => void alternar('dailySummaryEnabled', valor)}
              />
            </Card>
          </View>
        )}

        <View style={{ marginTop: spacing.md }}>
          <Banner
            kind="info"
            testID="banner-avisos"
            message="Tocar numa notificação valida sessão e permissão e abre o contexto certo; itens pagos ou cancelados têm avisos cancelados automaticamente. Horários seguem o fuso da família."
          />
        </View>
      </ScrollView>
    </View>
  );
}

function PreferenceRow({
  title,
  subtitle,
  value,
  onChange,
  first = false,
  testID,
}: {
  readonly title: string;
  readonly subtitle: string;
  readonly value: boolean;
  readonly onChange: (value: boolean) => void;
  readonly first?: boolean;
  readonly testID: string;
}): React.JSX.Element {
  return (
    <ListRow
      first={first}
      title={title}
      meta={subtitle}
      metaTone="secondary"
      right={
        <Toggle value={value} onValueChange={onChange} accessibilityLabel={title} testID={testID} />
      }
    />
  );
}

const styles = StyleSheet.create({
  // Os dois botões dividem a largura da coluna de texto. Sem o `flexShrink`, o
  // `Button` ocupa a linha inteira e o "Depois" sai da tela — foi o que a
  // captura da 6d mostrou.
  acao: { flexGrow: 0, flexShrink: 1 },
  acoes: { flexDirection: 'row', gap: 8, marginTop: 8 },
  content: { paddingTop: 4 },
  flex: { flex: 1 },
});
