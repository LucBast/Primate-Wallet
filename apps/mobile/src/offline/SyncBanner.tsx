/**
 * Faixa de sincronização (docs/11 §4).
 *
 * Fica no topo das telas de lista e diz, em uma linha, em qual dos cinco
 * estados o aparelho está. O ◌ vem do COMPONENT-SPECS — "Aguardando
 * sincronização infoSoft/info com ◌" — e é o mesmo símbolo da movimentação
 * pendente na 1g, para que a pessoa reconheça o estado sem ler.
 *
 * Some quando não há nada pendente: banner permanente vira ruído e as pessoas
 * param de ler. O texto mora em `sync-copy`, que é onde ele é testado.
 */

import React from 'react';
import { View } from 'react-native';
import { Banner } from '../components/Banner';
import { useTheme } from '../design-system/theme';
import { useSyncStore } from './sync-store';
import { syncMessage } from './sync-copy';

export type SyncBannerProps = {
  readonly onRetry?: (() => void) | undefined;
};

export function SyncBanner({ onRetry }: SyncBannerProps): React.JSX.Element | null {
  const { spacing } = useTheme();
  const status = useSyncStore((state) => state.status);
  const pendentes = useSyncStore((state) => state.pendentes);
  const bloqueados = useSyncStore((state) => state.bloqueados);

  const message = syncMessage(status, pendentes, bloqueados.length);
  if (message.kind === 'nenhuma') return null;

  const atencao = message.kind === 'atencao';
  const podeTentar = onRetry !== undefined && message.kind !== 'sincronizando';

  return (
    <View style={{ marginBottom: spacing.md }}>
      <Banner
        kind={atencao ? 'error' : message.kind === 'falhou' ? 'warning' : 'offline'}
        testID={atencao ? 'sync-bloqueado' : 'sync-pendente'}
        message={message.text}
        {...(podeTentar ? { actionLabel: atencao ? 'Revisar' : 'Tentar', onRetry } : {})}
      />
    </View>
  );
}
