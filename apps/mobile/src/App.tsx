/**
 * Raiz do aplicativo.
 *
 * Ordem dos provedores: área segura → tema → cache de servidor → navegação.
 * A barra de status acompanha o tema (claro/escuro) — ver screenshot 5b.
 */

import React from 'react';
import { StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider, useTheme } from './design-system/theme';
import { RootNavigator } from './navigation/RootNavigator';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Dados financeiros não podem ficar velhos na tela sem aviso; 30 s é o
      // limite antes de revalidar em foco (docs/11 §Metas).
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: true,
    },
  },
});

function ThemedStatusBar(): React.JSX.Element {
  const { scheme, colors } = useTheme();
  return (
    <StatusBar
      barStyle={scheme === 'dark' ? 'light-content' : 'dark-content'}
      backgroundColor={colors.surface}
    />
  );
}

export default function App(): React.JSX.Element {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <ThemedStatusBar />
          <RootNavigator />
        </QueryClientProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
