/**
 * Banners informativos (design/COMPONENT-SPECS.md §Banners).
 *
 * Raio 12, padding 9×14, texto Bold 10.5 com line-height 1.5.
 * Info: infoSoft/info · Aviso: warningSoft/warning · Erro: dangerSoft/danger
 * com botão "Tentar novamente" · Offline: infoSoft/info com ◌.
 */

import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../design-system/Text';
import { useTheme } from '../design-system/theme';

/** `brand` é o brandSoft/brand do "Total que sai da conta" (1e) e da 2e. */
export type BannerKind = 'info' | 'warning' | 'error' | 'offline' | 'brand';

export type BannerProps = {
  readonly kind: BannerKind;
  readonly message: string;
  readonly onRetry?: (() => void) | undefined;
  /**
   * Ação alinhada à direita, na mesma linha da mensagem — o "Resolver ›" do
   * banner de vencidas em 1b-inicio.png. Diferente de `onRetry`, que é o botão
   * com borda embaixo do texto.
   */
  readonly actionLabel?: string | undefined;
  readonly testID?: string | undefined;
};

export function Banner({
  kind,
  message,
  onRetry,
  actionLabel,
  testID,
}: BannerProps): React.JSX.Element {
  const { colors, radius } = useTheme();

  const palette = {
    info: { background: colors.infoSoft, foreground: colors.info },
    offline: { background: colors.infoSoft, foreground: colors.info },
    warning: { background: colors.warningSoft, foreground: colors.warning },
    error: { background: colors.dangerSoft, foreground: colors.danger },
    brand: { background: colors.brandSoft, foreground: colors.brand },
  }[kind];

  const text = kind === 'offline' ? `◌ ${message}` : message;

  return (
    <View
      testID={testID}
      accessibilityRole="alert"
      style={[styles.banner, { backgroundColor: palette.background, borderRadius: radius.md }]}
    >
      <View style={styles.line}>
        {/* `flexShrink` na mensagem: sem ele, uma mensagem longa empurra a ação
            para fora e as duas se sobrepõem — o que acontecia com a faixa de
            sincronização, cujo texto varia com a contagem. */}
        <Text variant="banner" style={[styles.message, { color: palette.foreground }]}>
          {text}
        </Text>
        {actionLabel === undefined ? null : onRetry === undefined ? (
          // Sem `onRetry` o rótulo é decorativo: quem trata o toque é o chamador,
          // que embrulha a faixa inteira num Pressable (é o "Resolver ›" da 1b).
          <Text variant="banner" style={{ color: palette.foreground }}>
            {actionLabel}
          </Text>
        ) : (
          <Pressable accessibilityRole="button" onPress={onRetry} hitSlop={10}>
            <Text variant="banner" style={{ color: palette.foreground }}>
              {actionLabel}
            </Text>
          </Pressable>
        )}
      </View>

      {kind === 'error' && onRetry !== undefined && actionLabel === undefined ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Tentar novamente"
          onPress={onRetry}
          hitSlop={12}
          style={[styles.retry, { borderColor: colors.danger, borderRadius: radius.sm }]}
        >
          <Text variant="rowMeta" tone="danger">
            Tentar novamente
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  line: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  message: { flexShrink: 1 },
  retry: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
});
