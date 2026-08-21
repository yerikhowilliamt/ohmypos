'use client';

import * as React from 'react';
import type { Theme } from './theme';

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
  enableDarkMode: boolean;
}

const ThemeContext = React.createContext<ThemeContextValue | null>(null);

export function ThemeProvider({
  theme,
  toggleTheme,
  enableDarkMode,
  children,
}: {
  theme: Theme;
  toggleTheme: () => void;
  enableDarkMode: boolean;
  children: React.ReactNode;
}) {
  const value = React.useMemo(
    () => ({ theme, toggleTheme, enableDarkMode }),
    [theme, toggleTheme, enableDarkMode],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const context = React.useContext(ThemeContext);
  if (!context) {
    return {
      theme: 'light',
      toggleTheme: () => {},
      enableDarkMode: false,
    };
  }
  return context;
}
