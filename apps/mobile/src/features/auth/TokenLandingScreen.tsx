/**
 * Aterrissagem de deep link com token: confirmação de e-mail e link mágico.
 *
 * Troca o token de uso único por uma sessão. Se o token já foi usado ou
 * expirou, mostra o erro do servidor e devolve a pessoa ao login — sem
 * inventar mensagem própria.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Banner } from '../../components/Banner';
import { Button } from '../../components/Button';
import { Text } from '../../design-system/Text';
import { useTheme } from '../../design-system/theme';
import { ApiRequestError } from '../../services/api-client';
import type { AuthStackParamList } from '../../navigation/types';
import * as authApi from './auth-api';
import { describeDevice } from './session-storage';
import { useSessionStore } from './session-store';

export type TokenLandingScreenProps = NativeStackScreenProps<AuthStackParamList, 'Token'>;

export function TokenLandingScreen({
  route,
  navigation,
}: TokenLandingScreenProps): React.JSX.Element {
  const { colors, layout, spacing } = useTheme();
  const signIn = useSessionStore((state) => state.signIn);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(true);

  const { token, purpose } = route.params;

  const consume = useCallback(async () => {
    setWorking(true);
    setError(null);
    try {
      const device = await describeDevice('Este aparelho');
      const session =
        purpose === 'EMAIL_VERIFICATION'
          ? await authApi.verifyEmail(token, device)
          : await authApi.consumeMagicLink(token, device);
      await signIn(session);
    } catch (cause) {
      setError(
        cause instanceof ApiRequestError
          ? cause.message
          : 'Não foi possível concluir agora. Tente de novo.',
      );
    } finally {
      setWorking(false);
    }
  }, [purpose, signIn, token]);

  useEffect(() => {
    void consume();
  }, [consume]);

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: colors.surface, paddingHorizontal: layout.screenPaddingH },
      ]}
    >
      {working ? (
        <ActivityIndicator color={colors.brand} accessibilityLabel="Carregando" />
      ) : (
        <>
          <Text variant="screenTitle" style={styles.centered}>
            {purpose === 'EMAIL_VERIFICATION' ? 'Confirmação de e-mail' : 'Entrar com link mágico'}
          </Text>
          {error === null ? null : (
            <View style={{ marginTop: spacing.md, width: '100%' }}>
              <Banner kind="error" message={error} onRetry={() => void consume()} />
            </View>
          )}
          <View style={{ marginTop: spacing.lg, width: '100%' }}>
            <Button
              label="Voltar ao login"
              variant="secondary"
              onPress={() => navigation.navigate('Login')}
            />
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  centered: { textAlign: 'center' },
});
