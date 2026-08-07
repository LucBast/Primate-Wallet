/**
 * Cabeçalho de tela: ‹ voltar + título + subtítulo (+ ação à direita).
 * Padrão visto em 3a, 3b, 1e, 1f, 2c.
 */

import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '../design-system/Text';
import { useTheme } from '../design-system/theme';
import { icons, iconSize } from '../design-system/icons';

export type ScreenHeaderProps = {
  readonly title: string;
  /**
   * Texto ou linha própria — a 1f põe "Cartão Azul • • • • 4412 · ‹ jul · ago ·
   * set ›" aqui, com os meses tocáveis.
   */
  readonly subtitle?: string | React.ReactNode | undefined;
  readonly onBack?: (() => void) | undefined;
  readonly left?: React.ReactNode | undefined;
  readonly right?: React.ReactNode | undefined;
  /** Torna o subtítulo tocável — é o seletor "Família Souza ▾" do Início. */
  readonly onPressSubtitle?: (() => void) | undefined;
  /** `pageTitle` (22) nas telas de topo; `screenTitle` (17) nas internas. */
  readonly size?: 'page' | 'screen' | undefined;
};

export function ScreenHeader({
  title,
  subtitle,
  onBack,
  left,
  right,
  onPressSubtitle,
  size = 'page',
}: ScreenHeaderProps): React.JSX.Element {
  const { colors, spacing, layout } = useTheme();
  const insets = useSafeAreaInsets();
  const Back = icons.anterior;

  return (
    <View
      style={[
        styles.container,
        { paddingHorizontal: layout.screenPaddingH, paddingTop: insets.top + spacing.md },
      ]}
    >
      {onBack === undefined ? null : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Voltar"
          onPress={onBack}
          hitSlop={12}
          style={styles.back}
        >
          <Back size={iconSize.action} color={colors.textPrimary} strokeWidth={2} />
        </Pressable>
      )}

      {left}

      <View style={styles.texts}>
        <Text variant={size === 'page' ? 'pageTitle' : 'screenTitle'}>{title}</Text>
        {subtitle === undefined ? null : typeof subtitle !== 'string' ? (
          subtitle
        ) : onPressSubtitle === undefined ? (
          <Text variant="rowMeta" tone="secondary">
            {subtitle}
          </Text>
        ) : (
          <Pressable
            testID="trocar-familia"
            accessibilityRole="button"
            accessibilityLabel="Trocar de família"
            onPress={onPressSubtitle}
            hitSlop={8}
          >
            <Text variant="rowMeta" tone="secondary">
              {subtitle}
            </Text>
          </Pressable>
        )}
      </View>

      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    paddingBottom: 12,
  },
  back: { paddingRight: 2 },
  texts: { flex: 1, gap: 2 },
});
