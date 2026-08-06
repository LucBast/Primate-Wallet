/**
 * Navegador raiz.
 *
 * Três fluxos, escolhidos pelo estado da sessão e pela existência de família:
 *   anônimo          → login / cadastro / aterrissagem de token
 *   sem família      → criar família ou aceitar convite
 *   com família      → abas + telas internas
 *
 * Deep links `familyfinance://` (doc 12) entram pelos três fluxos.
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
import { SessionsScreen } from '../features/auth/SessionsScreen';
import { useSessionStore } from '../features/auth/session-store';
import { ActivityScreen } from '../features/household/ActivityScreen';
import { CreateHouseholdScreen } from '../features/household/CreateHouseholdScreen';
import { FamilyScreen } from '../features/household/FamilyScreen';
import { InvitationScreen } from '../features/household/InvitationScreen';
import { InviteMemberScreen } from '../features/household/InviteMemberScreen';
import { MemberPermissionsScreen } from '../features/household/MemberPermissionsScreen';
import { useHouseholdStore } from '../features/household/household-store';
import * as householdApi from '../features/household/household-api';
import { PhasePlaceholder } from '../components/PhasePlaceholder';
import { QuickEntryScreen } from '../features/quick-entry/QuickEntryScreen';
import { appConfig } from '../services/config';
import { AppTabs } from './AppTabs';
import type { AppStackParamList, AuthStackParamList, OnboardingStackParamList } from './types';

/** Destinos que ainda não têm tela; cada entrada some quando a fase entrega. */
const UPCOMING: Record<string, { title: string; phase: string; screenshot: string }> = {
  Contas: {
    title: 'Contas e cartões',
    phase: 'Fase 2 — Contas e categorias',
    screenshot: 'design/screenshots/2a-contas.png',
  },
  Categorias: {
    title: 'Categorias',
    phase: 'Fase 2 — Contas e categorias',
    screenshot: 'design/screenshots/2a-contas.png',
  },
  Relatorios: {
    title: 'Relatórios',
    phase: 'Fase 7 — Dashboard e relatórios',
    screenshot: 'design/screenshots/4a-relatorios.png',
  },
  Configuracoes: {
    title: 'Configurações',
    phase: 'Fase 11 — Qualidade e hardening',
    screenshot: 'design/screenshots/6d-notificacoes.png',
  },
};

const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const AppStack = createNativeStackNavigator<AppStackParamList>();
const OnboardingStack = createNativeStackNavigator<OnboardingStackParamList>();

const linking: LinkingOptions<ParamListBase> = {
  prefixes: [`${appConfig.deepLinkScheme}://`],
  config: {
    screens: {
      Login: 'login',
      CriarConta: 'criar-conta',
      Convite: 'convite',
      Familia: 'familia',
      LancamentoRapido: 'novo',
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

/** Quem entrou e ainda não pertence a nenhuma família. */
function OnboardingFlow(): React.JSX.Element {
  const setActive = useHouseholdStore((state) => state.setActive);

  return (
    <OnboardingStack.Navigator screenOptions={{ headerShown: false }}>
      <OnboardingStack.Screen name="CriarFamilia">
        {() => <CreateHouseholdScreen onCreated={setActive} />}
      </OnboardingStack.Screen>
      <OnboardingStack.Screen name="Convite">
        {({ route, navigation }) => (
          <InvitationScreen
            token={route.params.token}
            onAccepted={setActive}
            onDeclined={() => navigation.navigate('CriarFamilia')}
          />
        )}
      </OnboardingStack.Screen>
    </OnboardingStack.Navigator>
  );
}

function AppFlow(): React.JSX.Element {
  const accessToken = useSessionStore((state) => state.accessToken);
  const activeId = useHouseholdStore((state) => state.activeId);
  const setActive = useHouseholdStore((state) => state.setActive);

  return (
    <AppStack.Navigator screenOptions={{ headerShown: false }}>
      <AppStack.Screen name="Tabs">
        {({ navigation }) => (
          <AppTabs
            onQuickEntry={() => navigation.navigate('LancamentoRapido')}
            onNavigate={(destination) => {
              if (destination === 'Familia') navigation.navigate('Familia');
              else if (destination === 'Sessoes') navigation.navigate('Sessoes');
              else navigation.navigate('EmConstrucao', { destination });
            }}
          />
        )}
      </AppStack.Screen>

      <AppStack.Screen
        name="LancamentoRapido"
        component={QuickEntryScreen}
        options={{ presentation: 'modal' }}
      />

      <AppStack.Screen name="Familia">
        {({ navigation }) => (
          <FamilyScreen
            onBack={() => navigation.goBack()}
            onOpenMember={(member) => navigation.navigate('MembroPermissoes', { member })}
            onInvite={() => navigation.navigate('ConvidarMembro')}
            onOpenActivity={() => navigation.navigate('Atividade')}
            onOpenApprovals={() => navigation.navigate('Aprovacoes')}
            onOpenSessions={() => navigation.navigate('Sessoes')}
            onEditHousehold={() => navigation.navigate('EditarFamilia')}
          />
        )}
      </AppStack.Screen>

      <AppStack.Screen name="MembroPermissoes">
        {({ navigation, route }) => (
          <MemberPermissionsScreen
            member={route.params.member}
            onBack={() => navigation.goBack()}
            onSave={async (input) => {
              if (!accessToken || activeId === null) return;
              await householdApi.updateMember(accessToken, activeId, route.params.member.id, {
                role: input.role === 'OWNER' ? 'ADMIN' : input.role,
                approvalMode: input.approvalMode,
                approvalThresholdMinor: input.approvalThresholdMinor,
                expectedVersion: route.params.member.version,
              });
              navigation.goBack();
            }}
            onSuspend={async () => {
              if (!accessToken || activeId === null) return;
              await householdApi.updateMember(accessToken, activeId, route.params.member.id, {
                status: 'SUSPENDED',
                expectedVersion: route.params.member.version,
              });
              navigation.goBack();
            }}
          />
        )}
      </AppStack.Screen>

      <AppStack.Screen name="ConvidarMembro">
        {({ navigation }) => (
          <InviteMemberScreen
            onBack={() => navigation.goBack()}
            onInvited={() => navigation.goBack()}
          />
        )}
      </AppStack.Screen>

      <AppStack.Screen name="Atividade">
        {({ navigation }) => <ActivityScreen onBack={() => navigation.goBack()} />}
      </AppStack.Screen>

      <AppStack.Screen name="Sessoes">
        {({ navigation }) => <SessionsScreen onBack={() => navigation.goBack()} />}
      </AppStack.Screen>

      <AppStack.Screen name="Aprovacoes">
        {() => (
          <PhasePlaceholder
            title="Aprovações pendentes"
            phase="Fase 9 — Supervisão familiar"
            screenshot="design/screenshots/3c-aprovacao.png"
          />
        )}
      </AppStack.Screen>

      <AppStack.Screen name="EditarFamilia">
        {() => (
          <PhasePlaceholder
            title="Configurações da família"
            phase="Fase 11 — Qualidade e hardening"
            screenshot="design/screenshots/3a-familia.png"
          />
        )}
      </AppStack.Screen>

      <AppStack.Screen name="Convite">
        {({ navigation, route }) => (
          <InvitationScreen
            token={route.params.token}
            onAccepted={(householdId) => {
              setActive(householdId);
              navigation.navigate('Tabs');
            }}
            onDeclined={() => navigation.navigate('Tabs')}
          />
        )}
      </AppStack.Screen>

      <AppStack.Screen name="EmConstrucao">
        {({ route }) => {
          const plan = UPCOMING[route.params.destination] ?? {
            title: route.params.destination,
            phase: 'fase seguinte',
            screenshot: 'design/screenshots/',
          };
          return (
            <PhasePlaceholder title={plan.title} phase={plan.phase} screenshot={plan.screenshot} />
          );
        }}
      </AppStack.Screen>
    </AppStack.Navigator>
  );
}

export function RootNavigator(): React.JSX.Element {
  const { colors, scheme } = useTheme();
  const status = useSessionStore((state) => state.status);
  const accessToken = useSessionStore((state) => state.accessToken);
  const restore = useSessionStore((state) => state.restore);
  const households = useHouseholdStore((state) => state.households);
  const householdsLoading = useHouseholdStore((state) => state.loading);
  const loadHouseholds = useHouseholdStore((state) => state.load);
  const resetHouseholds = useHouseholdStore((state) => state.reset);

  useEffect(() => {
    void restore();
  }, [restore]);

  // A lista de famílias é carregada assim que existe sessão, e descartada no
  // logout: nenhum dado familiar sobra na memória de quem saiu.
  useEffect(() => {
    if (status === 'autenticado' && accessToken !== null) void loadHouseholds(accessToken);
    if (status === 'anonimo') resetHouseholds();
  }, [accessToken, loadHouseholds, resetHouseholds, status]);

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

  const loading =
    status === 'carregando' ||
    (status === 'autenticado' && householdsLoading && households.length === 0);

  if (loading) {
    return (
      <View style={[styles.loading, { backgroundColor: colors.surface }]}>
        <ActivityIndicator color={colors.brand} accessibilityLabel="Carregando" />
      </View>
    );
  }

  return (
    <NavigationContainer theme={navigationTheme} linking={linking}>
      {status !== 'autenticado' ? (
        <AuthFlow />
      ) : households.length === 0 ? (
        <OnboardingFlow />
      ) : (
        <AppFlow />
      )}
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
