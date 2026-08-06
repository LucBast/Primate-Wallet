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
  readonly children: React.ReactNode;
  /** Rodapé fixo, fora da rolagem (CTAs). */
  readonly footer?: React.ReactNode | undefined;
  readonly testID?: string | undefined;
};

export function BottomSheet({
  visible,
  onClose,
  title,
  children,
  footer,
  testID,
}: BottomSheetProps): React.JSX.Element {
  const { colors, layout, radius, spacing } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
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
              <Text
                variant="screenTitle"
                style={{ marginBottom: spacing.md, paddingHorizontal: layout.screenPaddingH }}
              >
                {title}
              </Text>
            )}

            <ScrollView
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
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  scrim: { flex: 1, opacity: 0.45 },
  sheet: { maxHeight: '88%', paddingTop: 10 },
  handle: {
    alignSelf: 'center',
    borderRadius: 2,
    height: 4,
    marginBottom: 14,
    width: 40,
  },
});
