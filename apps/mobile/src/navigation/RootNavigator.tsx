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

import React, { useCallback, useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import {
  NavigationContainer,
  type LinkingOptions,
  type ParamListBase,
  type Theme as NavigationTheme,
} from '@react-navigation/native';
import {
  createNativeStackNavigator,
  type NativeStackNavigationProp,
} from '@react-navigation/native-stack';
import { useTheme } from '../design-system/theme';
import { LoginScreen } from '../features/auth/LoginScreen';
import { CreateAccountScreen } from '../features/auth/CreateAccountScreen';
import { NewPasswordScreen } from '../features/auth/NewPasswordScreen';
import { TokenLandingScreen } from '../features/auth/TokenLandingScreen';
import { SessionsScreen } from '../features/auth/SessionsScreen';
import { useSessionStore } from '../features/auth/session-store';
import { ApprovalsScreen } from '../features/household/ApprovalsScreen';
import { ActivityScreen } from '../features/household/ActivityScreen';
import { CreateHouseholdScreen } from '../features/household/CreateHouseholdScreen';
import { FamilyScreen } from '../features/household/FamilyScreen';
import { InvitationScreen } from '../features/household/InvitationScreen';
import { InviteMemberScreen } from '../features/household/InviteMemberScreen';
import { MemberPermissionsScreen } from '../features/household/MemberPermissionsScreen';
import { useHouseholdStore } from '../features/household/household-store';
import * as householdApi from '../features/household/household-api';
import { AccountsScreen } from '../features/account/AccountsScreen';
import { AccountFormScreen } from '../features/account/AccountFormScreen';
import { AccountDetailScreen } from '../features/account/AccountDetailScreen';
import { CategoriesScreen } from '../features/account/CategoriesScreen';
import * as accountApi from '../features/account/account-api';
import { useReferenceStore } from '../features/household/reference-store';
import { PlannedEntryFormScreen } from '../features/planning/PlannedEntryFormScreen';
import { PlannedEntryDetailScreen } from '../features/planning/PlannedEntryDetailScreen';
import { SettlementScreen } from '../features/planning/SettlementScreen';
import { TransactionDetailScreen } from '../features/transactions/TransactionDetailScreen';
import { TransferScreen } from '../features/transactions/TransferScreen';
import { CardStatementScreen } from '../features/card/CardStatementScreen';
import { CardPurchaseScreen } from '../features/card/CardPurchaseScreen';
import { ReportsScreen } from '../features/home/ReportsScreen';
import { NotificationsScreen } from '../features/notification/NotificationsScreen';
import { PhasePlaceholder } from '../components/PhasePlaceholder';
import { QuickEntryScreen } from '../features/quick-entry/QuickEntryScreen';
import { appConfig } from '../services/config';
import { captureLaunchIntent, subscribeToIntents, takeIntent, type Intent } from './pending-intent';
import { useSync } from '../offline/use-sync';
import { AppTabs } from './AppTabs';
import type { AppStackParamList, AuthStackParamList, OnboardingStackParamList } from './types';

/** Destinos que ainda não têm tela; cada entrada some quando a fase entrega. */
const UPCOMING: Record<string, { title: string; phase: string; screenshot: string }> = {
  Notificacoes: {
    title: 'Notificações',
    phase: 'Fase 8 — Experiência rápida',
    screenshot: 'design/screenshots/6d-notificacoes.png',
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

/**
 * Deep links do doc 12. `entrar?token=` (link mágico) e `verificar-email?token=`
 * chegam pela mesma tela de aterrissagem, que troca o token por uma sessão.
 * `senha-nova?token=` é diferente: ali o token não vira sessão sozinho, porque
 * ainda falta a pessoa escolher a senha.
 */
const linking: LinkingOptions<ParamListBase> = {
  prefixes: [`${appConfig.deepLinkScheme}://`],
  config: {
    screens: {
      Login: 'login',
      SenhaNova: 'senha-nova',
      CriarConta: 'criar-conta',
      Convite: 'convite',
      Familia: 'familia',
      Contas: 'contas',
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
      <AuthStack.Screen name="SenhaNova" component={NewPasswordScreen} />
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

/**
 * Retoma a intenção do atalho do ícone (docs/12 §2).
 *
 * Mora DENTRO da rota Tabs, e não no arranque, por um motivo prático: só aqui
 * já existe sessão e família. Tratado no arranque, o app tentaria abrir o
 * formulário por cima da tela de login — que é justamente o caso que o pacote
 * manda resolver ("sessão expirada → login → retoma a intenção").
 *
 * `takeIntent` consome de uma vez, então remontar a navegação não reabre o
 * mesmo formulário. Não desenha nada.
 */
function ShortcutIntent({
  navigation,
}: {
  readonly navigation: NativeStackNavigationProp<AppStackParamList, 'Tabs'>;
}): null {
  useEffect(() => {
    const abrir = (intent: Intent): void => {
      if (intent.kind === 'card-purchase') navigation.navigate('CompraCartao');
      else if (intent.kind === 'payable')
        navigation.navigate('NovaContaPrevista', { nature: 'PAYABLE' });
      else navigation.navigate('LancamentoRapido');
    };

    const guardada = takeIntent();
    if (guardada !== null) abrir(guardada);
    return subscribeToIntents(abrir);
  }, [navigation]);

  return null;
}

function AppFlow(): React.JSX.Element {
  const accessToken = useSessionStore((state) => state.accessToken);
  const activeId = useHouseholdStore((state) => state.activeId);
  const setActive = useHouseholdStore((state) => state.setActive);
  const reference = useReferenceStore();

  // Contas, categorias e membros alimentam todos os formulários de lançamento.
  useEffect(() => {
    if (accessToken !== null && activeId !== null) void reference.load(accessToken, activeId);
    // `reference.load` é estável no Zustand; depender do objeto inteiro geraria laço.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, activeId]);

  /** Permissões de conta do membro, para completar a tela 3b. */
  const loadPermissions = useCallback(
    async (memberId: string) => {
      if (!accessToken || activeId === null) return [];
      const permissions = await accountApi.listAccountPermissions(accessToken, activeId, memberId);
      return permissions.map((permission) => ({
        accountId: permission.accountId,
        accountName: permission.accountName,
        canView: permission.canView,
        canTransact: permission.canTransact,
        canEdit: permission.canEdit,
      }));
    },
    [accessToken, activeId],
  );

  return (
    <AppStack.Navigator screenOptions={{ headerShown: false }}>
      <AppStack.Screen name="Tabs">
        {({ navigation }) => (
          <>
            <ShortcutIntent navigation={navigation} />
            <AppTabs
              onQuickEntry={() => navigation.navigate('LancamentoRapido')}
              onNewPlannedEntry={(nature) => navigation.navigate('NovaContaPrevista', { nature })}
              onSettleEntry={(entry) => navigation.navigate('DarBaixa', { entry })}
              onOpenPlannedEntry={(entry) => navigation.navigate('DetalheContaPrevista', { entry })}
              onOpenPlanningTab={() => undefined}
              onOpenTransaction={(transaction) =>
                navigation.navigate('DetalheMovimentacao', { transaction })
              }
              onNavigate={(destination) => {
                if (destination === 'Familia') navigation.navigate('Familia');
                else if (destination === 'Sessoes') navigation.navigate('Sessoes');
                else if (destination === 'Contas') navigation.navigate('Contas');
                else if (destination === 'Categorias') navigation.navigate('Categorias');
                else if (destination === 'Relatorios') navigation.navigate('Relatorios');
                else if (destination === 'Notificacoes') navigation.navigate('Notificacoes');
                else navigation.navigate('EmConstrucao', { destination });
              }}
            />
          </>
        )}
      </AppStack.Screen>

      {/* O lançamento rápido é uma folha sobre a tela atual (1c): a rota é
          transparente para que o scrim mostre o que está atrás. */}
      <AppStack.Screen
        name="LancamentoRapido"
        options={{ presentation: 'transparentModal', animation: 'none' }}
      >
        {({ navigation }) => (
          <QuickEntryScreen
            onClose={() => navigation.goBack()}
            onNavigate={(destination) => {
              navigation.goBack();
              if (destination === 'ContaPagar') {
                navigation.navigate('NovaContaPrevista', { nature: 'PAYABLE' });
              } else if (destination === 'ContaReceber') {
                navigation.navigate('NovaContaPrevista', { nature: 'RECEIVABLE' });
              } else if (destination === 'CompraCartao') {
                navigation.navigate('CompraCartao');
              } else if (destination === 'Transferencia') {
                navigation.navigate('Transferencia');
              } else {
                navigation.navigate('Contas');
              }
            }}
          />
        )}
      </AppStack.Screen>

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
            loadAccounts={() => loadPermissions(route.params.member.id)}
            onBack={() => navigation.goBack()}
            onSave={async (input) => {
              if (!accessToken || activeId === null) return;
              await householdApi.updateMember(accessToken, activeId, route.params.member.id, {
                role: input.role === 'OWNER' ? 'ADMIN' : input.role,
                approvalMode: input.approvalMode,
                approvalThresholdMinor: input.approvalThresholdMinor,
                expectedVersion: route.params.member.version,
              });
              await accountApi.setAccountPermissions(
                accessToken,
                activeId,
                route.params.member.id,
                {
                  permissions: input.accounts.map((account) => ({
                    accountId: account.accountId,
                    canView: account.canView,
                    canTransact: account.canTransact,
                    canEdit: account.canEdit,
                  })),
                },
              );
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

      <AppStack.Screen name="Contas">
        {({ navigation }) => (
          <AccountsScreen
            onBack={() => navigation.goBack()}
            onNewAccount={() => navigation.navigate('NovaConta')}
            onOpenAccount={(account) =>
              account.accountType === 'CREDIT_CARD'
                ? navigation.navigate('Fatura', { card: account })
                : navigation.navigate('DetalheConta', { account })
            }
          />
        )}
      </AppStack.Screen>

      <AppStack.Screen name="NovaConta">
        {({ navigation }) => (
          <AccountFormScreen
            onBack={() => navigation.goBack()}
            onSaved={() => navigation.goBack()}
          />
        )}
      </AppStack.Screen>

      <AppStack.Screen name="DetalheConta">
        {({ navigation, route }) => (
          <AccountDetailScreen
            account={route.params.account}
            onBack={() => navigation.goBack()}
            // A TransferScreen existe desde a Fase 4; este botão ainda apontava
            // para o placeholder de "fase seguinte", deixando a tela inteira
            // inalcançável pelo caminho natural (2c → Transferir).
            onTransfer={() => navigation.navigate('Transferencia')}
            onPermissions={() => navigation.navigate('Familia')}
          />
        )}
      </AppStack.Screen>

      <AppStack.Screen name="Categorias">
        {({ navigation }) => <CategoriesScreen onBack={() => navigation.goBack()} />}
      </AppStack.Screen>

      <AppStack.Screen name="NovaContaPrevista">
        {({ navigation, route }) => (
          <PlannedEntryFormScreen
            nature={route.params.nature}
            accounts={reference.accounts}
            categories={reference.categories}
            members={reference.members}
            onBack={() => navigation.goBack()}
            onSaved={() => navigation.goBack()}
          />
        )}
      </AppStack.Screen>

      <AppStack.Screen name="DetalheContaPrevista">
        {({ navigation, route }) => (
          <PlannedEntryDetailScreen
            entry={route.params.entry}
            onBack={() => navigation.goBack()}
            onSettle={(entry) => navigation.navigate('DarBaixa', { entry })}
          />
        )}
      </AppStack.Screen>

      <AppStack.Screen name="DarBaixa">
        {({ navigation, route }) => (
          <SettlementScreen
            entry={route.params.entry}
            onBack={() => navigation.goBack()}
            onSettled={() => navigation.goBack()}
          />
        )}
      </AppStack.Screen>

      <AppStack.Screen name="DetalheMovimentacao">
        {({ navigation, route }) => (
          <TransactionDetailScreen
            transaction={route.params.transaction}
            onBack={() => navigation.goBack()}
          />
        )}
      </AppStack.Screen>

      <AppStack.Screen name="Transferencia">
        {({ navigation }) => (
          <TransferScreen onBack={() => navigation.goBack()} onSaved={() => navigation.goBack()} />
        )}
      </AppStack.Screen>

      <AppStack.Screen name="Fatura">
        {({ navigation, route }) => (
          <CardStatementScreen card={route.params.card} onBack={() => navigation.goBack()} />
        )}
      </AppStack.Screen>

      <AppStack.Screen name="CompraCartao">
        {({ navigation }) => (
          <CardPurchaseScreen
            onBack={() => navigation.goBack()}
            onSaved={() => navigation.goBack()}
          />
        )}
      </AppStack.Screen>

      <AppStack.Screen name="Relatorios">
        {({ navigation }) => <ReportsScreen onBack={() => navigation.goBack()} />}
      </AppStack.Screen>

      <AppStack.Screen name="Notificacoes">
        {({ navigation }) => (
          <NotificationsScreen
            onBack={() => navigation.goBack()}
            onOpen={(aviso) => {
              // O toque abre o CONTEXTO do aviso, não uma tela genérica
              // (docs/12 §6). Sem contexto conhecido, cai na lista da família.
              // Aprovação e fatura têm tela própria. Conta prevista volta às
              // abas, porque o planejamento É uma aba: abrir o detalhe exigiria
              // a entrada inteira, e o aviso só carrega o id. Registrado em
              // DECISIONS como o mais próximo do existente (regra 8).
              if (aviso.entityType === 'approval_request') navigation.navigate('Aprovacoes');
              else if (aviso.entityType === 'card_statement') navigation.navigate('Contas');
              else navigation.goBack();
            }}
          />
        )}
      </AppStack.Screen>

      <AppStack.Screen name="Aprovacoes">
        {({ navigation }) => <ApprovalsScreen onBack={() => navigation.goBack()} />}
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
    // Guarda a intenção do atalho ANTES de decidir qual navegador mostrar: com
    // o app fechado, a URL que o abriu é lida uma vez só, e ela precisa
    // sobreviver ao caminho pelo login (docs/12 §2).
    void captureLaunchIntent();
  }, [restore]);

  // Esvazia o outbox quando há sessão e família, e de novo a cada volta do
  // segundo plano (docs/11 §2).
  useSync();

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
