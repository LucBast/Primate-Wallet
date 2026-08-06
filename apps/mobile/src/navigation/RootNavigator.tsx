/**
 * Navegador raiz: decide entre o fluxo de autenticação e o app, a partir do
 * estado da sessão. Também trata os deep links `familyfinance://` (doc 12).
 */

import React, { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import {
  NavigationContainer,
  type LinkingOptions,
  type ParamListBase,
  type Theme as NavigationTheme,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useTheme } from '../design-system/theme';
import { LoginScreen } from '../features/auth/LoginScreen';
import { CreateAccountScreen } from '../features/auth/CreateAccountScreen';
import { TokenLandingScreen } from '../features/auth/TokenLandingScreen';
import { useSessionStore } from '../features/auth/session-store';
import { appConfig } from '../services/config';
import { AppTabs } from './AppTabs';
import { QuickEntryScreen } from '../features/quick-entry/QuickEntryScreen';
import type { AppStackParamList, AuthStackParamList } from './types';

const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const AppStack = createNativeStackNavigator<AppStackParamList>();

/**
 * Deep links do doc 12. `entrar?token=` (link mágico) e `verificar-email?token=`
 * chegam pela mesma tela de aterrissagem, que troca o token por uma sessão.
 */
const linking: LinkingOptions<ParamListBase> = {
  prefixes: [`${appConfig.deepLinkScheme}://`],
  config: {
    screens: {
      Login: 'login',
      CriarConta: 'criar-conta',
      Token: {
        path: ':purposePath',
        parse: { purposePath: (value: string) => value },
      },
    },
  },
};

function AuthFlow(): React.JSX.Element {
  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false }}>
      <AuthStack.Screen name="Login">
        {({ navigation }) => (
          <LoginScreen onCreateAccount={() => navigation.navigate('CriarConta')} />
        )}
      </AuthStack.Screen>
      <AuthStack.Screen name="CriarConta">
        {({ navigation }) => <CreateAccountScreen onBack={() => navigation.goBack()} />}
      </AuthStack.Screen>
      <AuthStack.Screen name="Token" component={TokenLandingScreen} />
    </AuthStack.Navigator>
  );
}

function AppFlow(): React.JSX.Element {
  return (
    <AppStack.Navigator screenOptions={{ headerShown: false }}>
      <AppStack.Screen name="Tabs">
        {({ navigation }) => (
          <AppTabs onQuickEntry={() => navigation.navigate('LancamentoRapido')} />
        )}
      </AppStack.Screen>
      <AppStack.Screen
        name="LancamentoRapido"
        component={QuickEntryScreen}
        options={{ presentation: 'modal' }}
      />
    </AppStack.Navigator>
  );
}

export function RootNavigator(): React.JSX.Element {
  const { colors, scheme } = useTheme();
  const status = useSessionStore((state) => state.status);
  const restore = useSessionStore((state) => state.restore);

  useEffect(() => {
    void restore();
  }, [restore]);

  const navigationTheme: NavigationTheme = {
    dark: scheme === 'dark',
    colors: {
      primary: colors.brand,
      background: colors.surface,
      card: colors.surfaceElevated,
      text: colors.textPrimary,
      border: colors.border,
      notification: colors.danger,
    },
    fonts: {
      regular: { fontFamily: 'Manrope-Regular', fontWeight: '400' },
      medium: { fontFamily: 'Manrope-Medium', fontWeight: '500' },
      bold: { fontFamily: 'Manrope-Bold', fontWeight: '700' },
      heavy: { fontFamily: 'Manrope-ExtraBold', fontWeight: '800' },
    },
  };

  if (status === 'carregando') {
    return (
      <View style={[styles.loading, { backgroundColor: colors.surface }]}>
        <ActivityIndicator color={colors.brand} accessibilityLabel="Carregando" />
      </View>
    );
  }

  return (
    <NavigationContainer theme={navigationTheme} linking={linking}>
      {status === 'autenticado' ? <AppFlow /> : <AuthFlow />}
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  loading: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
});
