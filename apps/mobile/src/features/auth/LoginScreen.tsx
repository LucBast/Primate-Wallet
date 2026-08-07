/**
 * Tela de login — design/SCREEN-SPECS.md §6a, screenshot 6a-login.png.
 *
 * Ordem dos blocos, verificada contra o screenshot:
 *   1. Logo (quadrado brand raio 20 com "F")
 *   2. "Family Finance" + tagline "As finanças da família, num lugar só."
 *   3. Field E-MAIL
 *   4. Field SENHA com ação "mostrar"
 *   5. CTA primário "Entrar"
 *   6. Links "Entrar com link mágico" (esq.) e "Esqueci a senha" (dir.)
 *   7. Divisor "ou"
 *   8. Botão secundário "Criar conta nova"
 *   9. Card de biometria: "Desbloqueio por biometria" +
 *      "opcional, ativado em Segurança após o login" + Toggle
 *  10. Microcopy: "Sessões podem ser revogadas em Família › Dispositivos e sessões."
 *
 * Toda a copy pt-BR é verbatim da especificação (CLAUDE.md item 5).
 */

import React, { useCallback, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text as RNText,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Banner } from '../../components/Banner';
import { Button } from '../../components/Button';
import { Field } from '../../components/Field';
import { Toggle } from '../../components/Toggle';
import { Fingerprint } from 'lucide-react-native';
import { Text } from '../../design-system/Text';
import { useTheme } from '../../design-system/theme';
import { loginLogo } from '../../design-system/spec-values';
import { ApiRequestError } from '../../services/api-client';
import * as authApi from './auth-api';
import { describeDevice } from './session-storage';
import { useSessionStore } from './session-store';

export type LoginScreenProps = {
  readonly onCreateAccount: () => void;
};

export function LoginScreen({ onCreateAccount }: LoginScreenProps): React.JSX.Element {
  const { colors, radius, spacing, layout } = useTheme();
  const insets = useSafeAreaInsets();
  const signIn = useSessionStore((state) => state.signIn);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<{ kind: 'error' | 'offline'; message: string } | null>(null);
  const [magicLinkSent, setMagicLinkSent] = useState<string | null>(null);
  const [biometrics, setBiometrics] = useState(false);

  const handleError = useCallback((cause: unknown) => {
    if (cause instanceof ApiRequestError) {
      setError({ kind: cause.isOffline ? 'offline' : 'error', message: cause.message });
      return;
    }
    setError({ kind: 'error', message: 'Não foi possível concluir agora. Tente de novo.' });
  }, []);

  const handleSignIn = useCallback(async () => {
    setError(null);
    setMagicLinkSent(null);
    setSubmitting(true);
    try {
      const device = await describeDevice('Aparelho de ' + (email.split('@')[0] ?? 'usuário'));
      const session = await authApi.login({ email: email.trim(), password, device });
      await signIn(session);
    } catch (cause) {
      handleError(cause);
    } finally {
      setSubmitting(false);
    }
  }, [email, handleError, password, signIn]);

  const handleMagicLink = useCallback(async () => {
    setError(null);
    try {
      const result = await authApi.requestMagicLink(email.trim());
      setMagicLinkSent(result.message);
    } catch (cause) {
      handleError(cause);
    }
  }, [email, handleError]);

  const canSubmit = email.trim() !== '' && password !== '' && !submitting;

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: colors.surface }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingHorizontal: layout.screenPaddingH,
            paddingTop: insets.top + spacing.xxxl,
            paddingBottom: insets.bottom + spacing.lg,
          },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        {/* 1. Logo */}
        <View
          accessible
          accessibilityRole="image"
          accessibilityLabel="Family Finance"
          style={[
            styles.logo,
            {
              backgroundColor: colors.brand,
              // "quadrado brand raio 20" (SCREEN-SPECS §6a) = radius.xxl.
              borderRadius: radius.xxl,
              height: loginLogo.size,
              width: loginLogo.size,
            },
          ]}
        >
          <RNText style={[loginLogo.glyph, { color: colors.surfaceElevated }]}>F</RNText>
        </View>

        {/* 2. Nome e tagline */}
        <Text variant="pageTitle" style={styles.centered}>
          Family Finance
        </Text>
        <Text variant="body" tone="secondary" style={[styles.centered, styles.tagline]}>
          As finanças da família, num lugar só.
        </Text>

        {/* 3–4. Campos */}
        {/* Gap 16 entre os campos, medido em 6a-login.png (spacing.md daria 12). */}
        <View style={[styles.fields, { gap: spacing.lg, marginTop: spacing.xxl }]}>
          <Field
            label="E-mail"
            testID="campo-email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            textContentType="emailAddress"
            placeholder="ana@email.com"
            returnKeyType="next"
          />
          <Field
            label="Senha"
            testID="campo-senha"
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPassword}
            autoCapitalize="none"
            autoComplete="password"
            textContentType="password"
            returnKeyType="go"
            onSubmitEditing={() => void handleSignIn()}
            actionLabel={showPassword ? 'ocultar' : 'mostrar'}
            onActionPress={() => setShowPassword((current) => !current)}
          />
        </View>

        {error === null ? null : (
          <View style={{ marginTop: spacing.md }}>
            <Banner
              testID="banner-erro"
              kind={error.kind}
              message={error.message}
              {...(error.kind === 'error' ? { onRetry: () => void handleSignIn() } : {})}
            />
          </View>
        )}

        {magicLinkSent === null ? null : (
          <View style={{ marginTop: spacing.md }}>
            <Banner kind="info" message={magicLinkSent} testID="banner-link-magico" />
          </View>
        )}

        {/* 5. CTA */}
        <View style={{ marginTop: spacing.lg }}>
          <Button
            testID="botao-entrar"
            label="Entrar"
            onPress={handleSignIn}
            disabled={!canSubmit}
            loading={submitting}
          />
        </View>

        {/* 6. Links */}
        <View style={[styles.links, { marginTop: spacing.lg }]}>
          <Pressable
            accessibilityRole="link"
            onPress={() => void handleMagicLink()}
            hitSlop={12}
            testID="link-magico"
          >
            <Text variant="rowTitle" tone="brand">
              Entrar com link mágico
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="link"
            onPress={() => void handleMagicLink()}
            hitSlop={12}
            testID="link-esqueci-senha"
          >
            <Text variant="rowTitle" tone="brand">
              Esqueci a senha
            </Text>
          </Pressable>
        </View>

        {/* 7. Divisor "ou" */}
        <View style={[styles.divider, { marginTop: spacing.lg }]}>
          <View style={[styles.dividerLine, { backgroundColor: colors.divider }]} />
          <Text variant="rowMeta" tone="secondary" style={styles.dividerLabel}>
            ou
          </Text>
          <View style={[styles.dividerLine, { backgroundColor: colors.divider }]} />
        </View>

        {/* 8. Criar conta */}
        <View style={{ marginTop: spacing.lg }}>
          <Button
            testID="botao-criar-conta"
            label="Criar conta nova"
            variant="secondary"
            onPress={onCreateAccount}
          />
        </View>

        <View style={styles.flexSpacer} />

        {/* 9. Card de biometria */}
        <View
          style={[
            styles.biometricCard,
            {
              backgroundColor: colors.surfaceElevated,
              borderColor: colors.border,
              borderRadius: radius.xl,
              paddingHorizontal: layout.cardPaddingH,
              paddingVertical: layout.cardPaddingV,
              marginTop: spacing.xxl,
            },
          ]}
        >
          {/* CLARIFICATIONS-02 item 2a: fingerprint, brand sobre brandSoft,
              quadrado 34 raio 12 com ícone 18. */}
          <View
            style={[
              styles.biometricIcon,
              { backgroundColor: colors.brandSoft, borderRadius: radius.md },
            ]}
          >
            <Fingerprint size={18} color={colors.brand} />
          </View>

          <View style={styles.biometricTexts}>
            <Text variant="rowTitle">Desbloqueio por biometria</Text>
            <Text variant="rowMeta" tone="secondary">
              opcional, ativado em Segurança após o login
            </Text>
          </View>

          <Toggle
            testID="toggle-biometria"
            value={biometrics}
            onValueChange={setBiometrics}
            accessibilityLabel="Desbloqueio por biometria"
          />
        </View>

        {/* 10. Microcopy */}
        <Text
          variant="rowMeta"
          tone="secondary"
          style={[styles.centered, { marginTop: spacing.md }]}
        >
          Sessões podem ser revogadas em Família › Dispositivos e sessões.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { flexGrow: 1 },
  logo: {
    alignItems: 'center',
    alignSelf: 'center',
    justifyContent: 'center',
  },
  centered: { textAlign: 'center' },
  tagline: { marginTop: 4 },
  fields: { width: '100%' },
  links: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  divider: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  dividerLine: { flex: 1, height: 1 },
  dividerLabel: { marginHorizontal: 12 },
  flexSpacer: { flexGrow: 1, minHeight: 24 },
  biometricCard: {
    alignItems: 'center',
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
  },
  biometricIcon: {
    alignItems: 'center',
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  biometricTexts: { flex: 1, gap: 2 },
});
