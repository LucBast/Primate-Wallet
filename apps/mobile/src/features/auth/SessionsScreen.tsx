/**
 * Tela 8c — Dispositivos e sessões (screenshots/8c-dispositivos-sessoes.png).
 *
 * Blocos, na ordem do screenshot:
 *   1. Título + subtítulo explicando o que revogar faz
 *   2. "ESTE APARELHO": a sessão atual, num card com borda brand, chip ● Atual
 *      e SEM botão Revogar — revogar a própria sessão é "Sair da conta"
 *   3. "OUTRAS SESSÕES · N": uma linha por aparelho, com Revogar
 *   4. Banner infoSoft
 *   5. "Revogar todas as outras sessões" + microcopy
 *
 * "◌ Inativa há mais de 30 dias" é derivado de `lastSeenAt` na leitura, nunca
 * armazenado (design/CLARIFICATIONS-02 item 1).
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { sessionListSchema, type SessionListItem } from '@ff/api-contracts';
import { Badge } from '../../components/Badge';
import { Banner } from '../../components/Banner';
import { Button } from '../../components/Button';
import { Card, IconBadge, ListRow, SectionLabel } from '../../components/Card';
import { ScreenHeader } from '../../components/ScreenHeader';
import { RecoverableError, SkeletonList } from '../../components/states';
import { Text } from '../../design-system/Text';
import { useTheme } from '../../design-system/theme';
import { icons, iconSize } from '../../design-system/icons';
import { ApiRequestError, request } from '../../services/api-client';
import { useSessionStore } from './session-store';

/** Sistema por plataforma, como no screenshot: "iOS 18.4", "Android 15". */
const PLATFORM_LABEL: Record<SessionListItem['platform'], string> = {
  ios: 'iOS',
  android: 'Android',
  web: 'Navegador',
};

const MILLIS_PER_DAY = 86_400_000;

/** "agora", "há 2 horas", "ontem, 21:14", "há 38 dias" — o tempo do screenshot. */
function lastSeen(iso: string): string {
  const elapsed = Date.now() - Date.parse(iso);
  if (elapsed < 5 * 60_000) return 'agora';
  const hours = Math.trunc(elapsed / 3_600_000);
  if (hours < 1) return `há ${Math.trunc(elapsed / 60_000)} minutos`;
  if (hours < 24) return `há ${hours} ${hours === 1 ? 'hora' : 'horas'}`;
  const days = Math.trunc(elapsed / MILLIS_PER_DAY);
  if (days === 1) return 'ontem';
  return `há ${days} dias`;
}

/** Derivado na leitura: sessão parada há mais de 30 dias. */
function isStale(iso: string): boolean {
  return Date.now() - Date.parse(iso) > 30 * MILLIS_PER_DAY;
}

export function SessionsScreen({ onBack }: { readonly onBack: () => void }): React.JSX.Element {
  const { colors, layout, radius, spacing } = useTheme();
  const accessToken = useSessionStore((state) => state.accessToken);

  const [items, setItems] = useState<SessionListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revoking, setRevoking] = useState(false);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setError(null);
    try {
      const body = await request('/auth/sessions', { accessToken });
      setItems([...sessionListSchema.parse(body).items]);
    } catch (cause) {
      setError(
        cause instanceof ApiRequestError
          ? cause.message
          : 'Não foi possível carregar as sessões agora.',
      );
    }
  }, [accessToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const revoke = useCallback(
    async (sessionId: string) => {
      if (!accessToken) return;
      await request(`/auth/sessions/${sessionId}`, { method: 'DELETE', accessToken });
      await load();
    },
    [accessToken, load],
  );

  const current = useMemo(() => (items ?? []).find((item) => item.current) ?? null, [items]);
  const others = useMemo(() => (items ?? []).filter((item) => !item.current), [items]);

  /** Conveniência sobre o mesmo endpoint, em lote (CLARIFICATIONS-02). */
  const revokeAll = useCallback(async () => {
    setRevoking(true);
    try {
      for (const item of others) await revoke(item.id);
    } finally {
      setRevoking(false);
    }
  }, [others, revoke]);

  const Aparelho = icons.aparelho;

  const deviceRow = (item: SessionListItem, index: number): React.JSX.Element => {
    const stale = isStale(item.lastSeenAt);
    return (
      <ListRow
        key={item.id}
        first={index === 0}
        testID={`sessao-${item.id}`}
        title={item.name}
        left={
          <IconBadge background={stale ? colors.warningSoft : colors.infoSoft}>
            <Aparelho size={iconSize.row} color={stale ? colors.warning : colors.info} />
          </IconBadge>
        }
        meta={`${PLATFORM_LABEL[item.platform]} · app ${item.appVersion} · ${lastSeen(item.lastSeenAt)}`}
        below={
          stale ? (
            <Text variant="rowMeta" tone="warning">
              ◌ Inativa há mais de 30 dias
            </Text>
          ) : undefined
        }
        right={
          <Button
            testID={`revogar-${item.id}`}
            label="Revogar"
            variant="destructive"
            size="sm"
            style={styles.revoke}
            onPress={() => revoke(item.id)}
          />
        }
      />
    );
  };

  return (
    <View style={[styles.flex, { backgroundColor: colors.surface }]}>
      <ScreenHeader title="Dispositivos e sessões" onBack={onBack} size="screen" />

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingHorizontal: layout.screenPaddingH, paddingBottom: spacing.xxxl },
        ]}
      >
        <Text variant="rowMeta" tone="secondary">
          Aparelhos com sessão ativa na sua conta. Revogar desconecta o aparelho na próxima ação.
        </Text>

        {error !== null ? (
          <View style={{ marginTop: spacing.md }}>
            <RecoverableError message={error} onRetry={() => void load()} testID="erro-sessoes" />
          </View>
        ) : items === null ? (
          <View style={{ marginTop: spacing.md }}>
            <SkeletonList rows={3} />
          </View>
        ) : (
          <>
            {current === null ? null : (
              <View style={{ marginTop: spacing.md }}>
                <SectionLabel>ESTE APARELHO</SectionLabel>
                {/* Borda brand e sem Revogar: sair daqui é "Sair da conta". */}
                <View
                  testID="sessao-atual"
                  style={[
                    styles.currentCard,
                    {
                      backgroundColor: colors.surfaceElevated,
                      borderColor: colors.brand,
                      borderRadius: radius.xl,
                    },
                  ]}
                >
                  <IconBadge background={colors.brandSoft}>
                    <Aparelho size={iconSize.row} color={colors.brand} />
                  </IconBadge>
                  <View style={styles.currentTexts}>
                    <Text variant="rowTitle">{current.name}</Text>
                    <Text variant="rowMeta" tone="secondary">
                      {`${PLATFORM_LABEL[current.platform]} · app ${current.appVersion} · ${lastSeen(current.lastSeenAt)}`}
                    </Text>
                  </View>
                  <Badge label="● Atual" tone="income" testID="chip-atual" />
                </View>
              </View>
            )}

            {others.length === 0 ? null : (
              <View style={{ marginTop: spacing.md }}>
                <SectionLabel>{`OUTRAS SESSÕES · ${others.length}`}</SectionLabel>
                <Card padded={false} testID="card-outras-sessoes">
                  {others.map(deviceRow)}
                </Card>
              </View>
            )}

            <View style={{ marginTop: spacing.md }}>
              <Banner
                kind="info"
                testID="banner-sessoes"
                message="Revogações ficam registradas na atividade da família. A sessão atual não pode ser revogada aqui — para sair deste aparelho use Sair da conta."
              />
            </View>

            {others.length === 0 ? null : (
              <View style={{ marginTop: spacing.xxl }}>
                <Button
                  testID="revogar-todas"
                  label="Revogar todas as outras sessões"
                  variant="destructive"
                  loading={revoking}
                  onPress={revokeAll}
                />
                <Text variant="rowMeta" tone="secondary" style={styles.microcopy}>
                  Você continua conectado neste aparelho.
                </Text>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingTop: 4 },
  revoke: { width: 88 },
  currentCard: {
    alignItems: 'center',
    borderWidth: 1.5,
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  currentTexts: { flex: 1, gap: 2 },
  microcopy: { marginTop: 8, textAlign: 'center' },
});
