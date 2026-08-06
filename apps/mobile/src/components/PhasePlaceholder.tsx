/**
 * Placeholder honesto para telas ainda não implementadas.
 *
 * A navegação base existe desde a Fase 0, mas as telas de conteúdo chegam nas
 * fases seguintes. Em vez de uma tela em branco (ou pior, uma tela "quase certa"
 * que passaria despercebida no gate visual), cada aba diz explicitamente qual
 * fase a implementa e contra qual screenshot ela será validada.
 *
 * Este componente deve DESAPARECER do produto final (nenhum botão sem
 * implementação — docs/19 §Regras obrigatórias, item 23).
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '../design-system/Text';
import { useTheme } from '../design-system/theme';

export type PhasePlaceholderProps = {
  readonly title: string;
  readonly phase: string;
  readonly screenshot: string;
};

export function PhasePlaceholder({
  title,
  phase,
  screenshot,
}: PhasePlaceholderProps): React.JSX.Element {
  const { colors, layout, spacing, radius } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.surface,
          paddingHorizontal: layout.screenPaddingH,
          paddingTop: insets.top + spacing.xl,
        },
      ]}
    >
      <Text variant="pageTitle">{title}</Text>

      <View
        style={[
          styles.card,
          {
            backgroundColor: colors.infoSoft,
            borderRadius: radius.md,
            marginTop: spacing.lg,
            padding: spacing.md,
          },
        ]}
      >
        <Text variant="rowMeta" tone="info">
          {`Tela prevista para a ${phase}. Critério de aceite: ${screenshot}.`}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  card: { width: '100%' },
});
