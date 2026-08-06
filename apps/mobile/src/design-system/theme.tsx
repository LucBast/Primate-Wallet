/**
 * Tema (claro/escuro/sistema).
 *
 * `tokens.ts` é a cópia verbatim de design/design-tokens.ts e a ÚNICA fonte de
 * cor, tipografia, espaçamento e raio. Este arquivo apenas escolhe entre as
 * paletas `light` e `dark` e distribui via contexto.
 */

import React, { createContext, useContext, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import { dark, layout, light, motion, radius, spacing, type as typeTokens } from './tokens';

export type Palette = typeof light;
export type ThemePreference = 'light' | 'dark' | 'system';

export type Theme = {
  readonly colors: Palette;
  readonly scheme: 'light' | 'dark';
  readonly spacing: typeof spacing;
  readonly radius: typeof radius;
  readonly layout: typeof layout;
  readonly motion: typeof motion;
  readonly type: typeof typeTokens;
};

type ThemeContextValue = Theme & {
  readonly preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({
  children,
  initialPreference = 'system',
}: {
  children: React.ReactNode;
  initialPreference?: ThemePreference;
}): React.JSX.Element {
  const systemScheme = useColorScheme();
  const [preference, setPreference] = useState<ThemePreference>(initialPreference);

  const value = useMemo<ThemeContextValue>(() => {
    const scheme: 'light' | 'dark' =
      preference === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : preference;

    return {
      colors: scheme === 'dark' ? dark : light,
      scheme,
      spacing,
      radius,
      layout,
      motion,
      type: typeTokens,
      preference,
      setPreference,
    };
  }, [preference, systemScheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const theme = useContext(ThemeContext);
  if (!theme) {
    throw new Error('useTheme precisa estar dentro de <ThemeProvider>.');
  }
  return theme;
}
