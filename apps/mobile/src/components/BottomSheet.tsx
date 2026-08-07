/**
 * BottomSheet (design/COMPONENT-SPECS.md §BottomSheet).
 *
 * Raio superior 28, fundo surface, handle 40×4 centrado, scrim escuro.
 * Usado em 1c (lançamento rápido), 2d (ajuste de saldo), 3c (aprovação) e
 * 4d (exportação).
 */

import React from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '../design-system/Text';
import { useTheme } from '../design-system/theme';

export type BottomSheetProps = {
  readonly visible: boolean;
  readonly onClose: () => void;
  readonly title?: string | undefined;
  /** Linha de contexto abaixo do título — "Conta Corrente · Banco Andar" (2d). */
  readonly subtitle?: string | undefined;
  readonly children: React.ReactNode;
  /** Rodapé fixo, fora da rolagem (CTAs). */
  readonly footer?: React.ReactNode | undefined;
  /**
   * A folha já está dentro de uma rota `transparentModal`: dispensa o `Modal`
   * do React Native. Aninhar os dois faz o container parar antes da barra de
   * navegação do Android e o rodapé some.
   */
  readonly embedded?: boolean | undefined;
  readonly testID?: string | undefined;
};

export function BottomSheet({
  visible,
  onClose,
  title,
  subtitle,
  children,
  footer,
  embedded = false,
  testID,
}: BottomSheetProps): React.JSX.Element {
  const { colors, layout, radius, spacing } = useTheme();
  const insets = useSafeAreaInsets();

  const conteudo = (
    <View style={styles.root} testID={testID}>
      {/* Scrim rgba(28,27,26,0.45) = token textPrimary do tema claro a 45%. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Fechar"
        onPress={onClose}
        style={[styles.scrim, { backgroundColor: colors.textPrimary }]}
      />

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: colors.surface,
              borderTopLeftRadius: radius.sheet,
              borderTopRightRadius: radius.sheet,
              paddingBottom: Math.max(spacing.lg, insets.bottom),
            },
          ]}
        >
          <View style={[styles.handle, { backgroundColor: colors.border }]} />

          {title === undefined ? null : (
            <View
              style={{ marginBottom: spacing.md, paddingHorizontal: layout.screenPaddingH, gap: 2 }}
            >
              <Text variant="screenTitle">{title}</Text>
              {subtitle === undefined ? null : (
                <Text variant="rowMeta" tone="secondary">
                  {subtitle}
                </Text>
              )}
            </View>
          )}

          <ScrollView
            // Sem encolher, um conteúdo mais alto que os 88% da folha empurra
            // o rodapé para fora da tela e os CTAs somem.
            style={styles.scroll}
            contentContainerStyle={{ paddingHorizontal: layout.screenPaddingH }}
            keyboardShouldPersistTaps="handled"
          >
            {children}
          </ScrollView>

          {footer === undefined ? null : (
            <View style={{ marginTop: spacing.md, paddingHorizontal: layout.screenPaddingH }}>
              {footer}
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </View>
  );

  if (embedded) return visible ? conteudo : <View />;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {conteudo}
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  scrim: { flex: 1, opacity: 0.45 },
  sheet: { maxHeight: '88%', paddingTop: 10 },
  scroll: { flexShrink: 1 },
  handle: {
    alignSelf: 'center',
    borderRadius: 2,
    height: 4,
    marginBottom: 14,
    width: 40,
  },
});
