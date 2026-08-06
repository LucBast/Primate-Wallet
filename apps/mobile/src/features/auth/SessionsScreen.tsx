/**
 * Dispositivos e sessões — destino do link da tela 3a.
 *
 * Lista as sessões ativas do próprio usuário e permite revogar as demais.
 * A sessão atual não pode ser revogada aqui: para sair deste aparelho existe
 * o "Sair", que também limpa o Keychain.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { z } from 'zod';
import { sessionListItemSchema, type SessionListItem } from '@ff/api-contracts';
import { formatDate, isoDate } from '@ff/domain';
import { Button } from '../../components/Button';
import { Card, ListRow } from '../../components/Card';
import { ScreenHeader } from '../../components/ScreenHeader';
import { RecoverableError, SkeletonList } from '../../components/states';
import { Banner } from '../../components/Banner';
import { useTheme } from '../../design-system/theme';
import { ApiRequestError, request } from '../../services/api-client';
import { useSessionStore } from './session-store';

const listSchema = z.object({ items: z.array(sessionListItemSchema) });

const PLATFORM_LABEL: Record<SessionListItem['platform'], string> = {
  ios: 'iPhone/iPad',
  android: 'Android',
  web: 'Navegador',
};

export function SessionsScreen({ onBack }: { readonly onBack: () => void }): React.JSX.Element {
  const { colors, layout, spacing } = useTheme();
  const accessToken = useSessionStore((state) => state.accessToken);

  const [items, setItems] = useState<SessionListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setError(null);
    try {
      const body = await request('/auth/sessions', { accessToken });
      setItems(listSchema.parse(body).items);
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

  return (
    <View style={[styles.flex, { backgroundColor: colors.surface }]}>
      <ScreenHeader title="Dispositivos e sessões" onBack={onBack} size="screen" />

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingHorizontal: layout.screenPaddingH, paddingBottom: spacing.xxxl },
        ]}
      >
        <Banner
          kind="info"
          testID="banner-sessoes"
          message="Revogar uma sessão encerra o acesso naquele aparelho imediatamente, mesmo que ele esteja aberto."
        />

        {error !== null ? (
          <View style={{ marginTop: spacing.md }}>
            <RecoverableError message={error} onRetry={() => void load()} testID="erro-sessoes" />
          </View>
        ) : items === null ? (
          <View style={{ marginTop: spacing.md }}>
            <SkeletonList rows={3} />
          </View>
        ) : (
          <View style={{ marginTop: spacing.md }}>
            <Card padded={false}>
              {items.map((item, index) => (
                <ListRow
                  key={item.id}
                  first={index === 0}
                  testID={`sessao-${item.id}`}
                  title={item.current ? `${item.name} · este aparelho` : item.name}
                  meta={`${PLATFORM_LABEL[item.platform]} · versão ${item.appVersion} · desde ${formatDate(isoDate(item.createdAt.slice(0, 10)))}`}
                  metaTone={item.current ? 'brand' : 'secondary'}
                  right={
                    item.current ? undefined : (
                      <Button
                        testID={`revogar-${item.id}`}
                        label="Revogar"
                        variant="destructive"
                        size="sm"
                        style={styles.revoke}
                        onPress={() => revoke(item.id)}
                      />
                    )
                  }
                />
              ))}
            </Card>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingTop: 4 },
  revoke: { width: 88 },
});
