/**
 * Recuperação de acesso — criar uma senha nova (docs/07 §3, tela obrigatória).
 *
 * Chega pelo deep link `familyfinance://senha-nova?token=…`. Não existe
 * screenshot para ela no pacote; pela regra 8 do CLAUDE.md, é montada com os
 * mesmos blocos da 6a — logo, título, tagline, `Field` e `Button` —, para que
 * a pessoa reconheça de onde veio. Registrado em DECISIONS.
 *
 * Duas decisões de segurança visíveis na tela:
 *  - a senha é digitada UMA vez, com "mostrar": confirmar em dois campos faz a
 *    pessoa colar o mesmo erro duas vezes, enquanto poder ver o que digitou
 *    resolve de verdade;
 *  - o aviso de que as outras sessões vão cair é dito ANTES, não depois.
 */

import React, { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Banner } from '../../components/Banner';
import { Button } from '../../components/Button';
import { Field } from '../../components/Field';
import { Text } from '../../design-system/Text';
import { useTheme } from '../../design-system/theme';
import { ApiRequestError } from '../../services/api-client';
import type { AuthStackParamList } from '../../navigation/types';
import * as authApi from './auth-api';
import { describeDevice } from './session-storage';
import { useSessionStore } from './session-store';

export type NewPasswordScreenProps = NativeStackScreenProps<AuthStackParamList, 'SenhaNova'>;

export function NewPasswordScreen({ route }: NewPasswordScreenProps): React.JSX.Element {
  const { colors, layout, spacing } = useTheme();
  const signIn = useSessionStore((state) => state.signIn);

  const [password, setPassword] = useState('');
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState<{ kind: 'error' | 'offline'; message: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const { token } = route.params;

  const salvar = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      const device = await describeDevice('Este aparelho');
      await signIn(await authApi.consumePasswordReset(token, password, device));
    } catch (cause) {
      setError({
        kind: cause instanceof ApiRequestError && cause.isOffline ? 'offline' : 'error',
        message:
          cause instanceof ApiRequestError
            ? cause.message
            : 'Não foi possível concluir agora. Tente de novo.',
      });
    } finally {
      setSaving(false);
    }
  }, [password, signIn, token]);

  return (
    <ScrollView
      contentContainerStyle={[
        styles.content,
        { backgroundColor: colors.surface, paddingHorizontal: layout.screenPaddingH },
      ]}
      keyboardShouldPersistTaps="handled"
    >
      <Text variant="pageTitle">Criar uma senha nova</Text>
      <Text variant="body" tone="secondary" style={{ marginTop: spacing.xs }}>
        Escolha uma senha que só você saiba. Ao salvar, as sessões abertas em outros aparelhos serão
        encerradas.
      </Text>

      {error === null ? null : (
        <View style={{ marginTop: spacing.md }}>
          <Banner kind={error.kind} message={error.message} testID="erro-senha-nova" />
        </View>
      )}

      <View style={{ marginTop: spacing.lg }}>
        <Field
          testID="campo-senha-nova"
          label="Nova senha"
          value={password}
          onChangeText={setPassword}
          secureTextEntry={!visible}
          autoCapitalize="none"
          autoComplete="new-password"
          textContentType="newPassword"
          actionLabel={visible ? 'ocultar' : 'mostrar'}
          onActionPress={() => setVisible((atual) => !atual)}
        />
      </View>

      <View style={{ marginTop: spacing.lg }}>
        <Button
          testID="salvar-senha-nova"
          label="Salvar senha e entrar"
          onPress={() => void salvar()}
          disabled={password.length < 8 || saving}
          loading={saving}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, paddingTop: 48 },
});
