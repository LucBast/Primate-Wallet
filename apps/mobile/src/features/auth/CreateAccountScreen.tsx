/**
 * Criar conta nova — destino do botão secundário da tela 6a.
 *
 * Não há screenshot dedicado no pacote; a tela segue os mesmos componentes e
 * espaçamentos de 6a (design/UI-FIDELITY-RULES.md: sem screenshot → seguir
 * COMPONENT-SPECS).
 *
 * O servidor responde SEMPRE de forma neutra, exista ou não o e-mail
 * (anti-enumeração, docs/10 §2) — por isso a tela mostra a mesma mensagem em
 * ambos os casos e manda a pessoa conferir a caixa de entrada.
 */

import React, { useCallback, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { registerRequestSchema } from '@ff/api-contracts';
import { Banner } from '../../components/Banner';
import { Button } from '../../components/Button';
import { Field } from '../../components/Field';
import { Text } from '../../design-system/Text';
import { useTheme } from '../../design-system/theme';
import { ApiRequestError } from '../../services/api-client';
import * as authApi from './auth-api';

export type CreateAccountScreenProps = {
  readonly onBack: () => void;
};

export function CreateAccountScreen({ onBack }: CreateAccountScreenProps): React.JSX.Element {
  const { colors, spacing, layout } = useTheme();
  const insets = useSafeAreaInsets();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<{ kind: 'info' | 'error' | 'offline'; text: string } | null>(
    null,
  );

  const handleSubmit = useCallback(async () => {
    setBanner(null);
    const parsed = registerRequestSchema.safeParse({
      email,
      password,
      displayName: name,
    });

    if (!parsed.success) {
      const errors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? '');
        errors[key] ??= issue.message;
      }
      setFieldErrors(errors);
      return;
    }

    setFieldErrors({});
    setSubmitting(true);
    try {
      const result = await authApi.register(parsed.data);
      setBanner({ kind: 'info', text: result.message });
    } catch (cause) {
      const offline = cause instanceof ApiRequestError && cause.isOffline;
      setBanner({
        kind: offline ? 'offline' : 'error',
        text:
          cause instanceof ApiRequestError
            ? cause.message
            : 'Não foi possível concluir agora. Tente de novo.',
      });
    } finally {
      setSubmitting(false);
    }
  }, [email, name, password]);

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
            paddingTop: insets.top + spacing.xl,
            paddingBottom: insets.bottom + spacing.lg,
          },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <Text variant="pageTitle">Criar conta nova</Text>
        <Text variant="body" tone="secondary" style={styles.subtitle}>
          Depois você cria ou entra na sua família.
        </Text>

        <View style={[styles.fields, { gap: spacing.md, marginTop: spacing.xl }]}>
          <Field
            label="Nome"
            testID="campo-nome"
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
            autoComplete="name"
            {...(fieldErrors['displayName'] === undefined
              ? {}
              : { error: fieldErrors['displayName'] })}
          />
          <Field
            label="E-mail"
            testID="campo-email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            {...(fieldErrors['email'] === undefined ? {} : { error: fieldErrors['email'] })}
          />
          <Field
            label="Senha"
            testID="campo-senha"
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPassword}
            autoCapitalize="none"
            autoComplete="new-password"
            actionLabel={showPassword ? 'ocultar' : 'mostrar'}
            onActionPress={() => setShowPassword((current) => !current)}
            {...(fieldErrors['password'] === undefined ? {} : { error: fieldErrors['password'] })}
          />
        </View>

        {banner === null ? null : (
          <View style={{ marginTop: spacing.md }}>
            <Banner testID="banner-cadastro" kind={banner.kind} message={banner.text} />
          </View>
        )}

        <View style={{ marginTop: spacing.lg }}>
          <Button
            testID="botao-criar"
            label="Criar conta"
            onPress={handleSubmit}
            loading={submitting}
          />
        </View>

        <View style={{ marginTop: spacing.md }}>
          <Button testID="botao-voltar" label="Voltar" variant="secondary" onPress={onBack} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { flexGrow: 1 },
  subtitle: { marginTop: 4 },
  fields: { width: '100%' },
});
