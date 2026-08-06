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
import { bannerLineHeightRatio } from '../design-system/spec-values';
import { type as typeTokens } from '../design-system/tokens';

export type BannerKind = 'info' | 'warning' | 'error' | 'offline';

export type BannerProps = {
  readonly kind: BannerKind;
  readonly message: string;
  readonly onRetry?: (() => void) | undefined;
  readonly testID?: string | undefined;
};

export function Banner({ kind, message, onRetry, testID }: BannerProps): React.JSX.Element {
  const { colors, radius } = useTheme();

  const palette = {
    info: { background: colors.infoSoft, foreground: colors.info },
    offline: { background: colors.infoSoft, foreground: colors.info },
    warning: { background: colors.warningSoft, foreground: colors.warning },
    error: { background: colors.dangerSoft, foreground: colors.danger },
  }[kind];

  const text = kind === 'offline' ? `◌ ${message}` : message;

  return (
    <View
      testID={testID}
      accessibilityRole="alert"
      style={[styles.banner, { backgroundColor: palette.background, borderRadius: radius.md }]}
    >
      <Text variant="rowMeta" style={[styles.text, { color: palette.foreground }]}>
        {text}
      </Text>

      {kind === 'error' && onRetry !== undefined ? (
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
  text: {
    lineHeight: typeTokens.rowMeta.fontSize * bannerLineHeightRatio,
  },
  retry: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
});
