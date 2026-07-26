import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { THEME_STORAGE_KEY } from '@/config/env';

/**
 * The themes offered in the picker. `light`/`dark`/`system` are colour SCHEMES;
 * `corporate` is a brand skin (navy chrome, amber primary) that resolves as a light
 * scheme — see the `.corporate` token block in `styles/globals.css`.
 */
export type Theme = 'light' | 'dark' | 'system' | 'corporate';

/** The themes applied by stamping a class of the same name on `<html>`. */
const CLASS_THEMES = ['dark', 'corporate'] as const;

interface ThemeContextValue {
  theme: Theme;
  /**
   * The colour SCHEME in effect (`system` resolved). `corporate` resolves to `light`,
   * because its content surfaces are light — native form controls and scrollbars
   * should follow suit.
   */
  resolvedTheme: 'light' | 'dark';
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function prefersDark(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function readStoredTheme(): Theme {
  if (typeof window === 'undefined') return 'system';
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  return stored === 'light' || stored === 'dark' || stored === 'system' || stored === 'corporate'
    ? stored
    : 'system';
}

/**
 * Provides theme state and stamps the matching class on `<html>` (`.dark`, `.corporate`,
 * or neither for light). `system` follows `prefers-color-scheme` live. The initial class
 * is set by an inline script in `index.html` to avoid a flash of the wrong theme; this
 * provider keeps it in sync thereafter (docs/FRONTEND_ARCHITECTURE.md).
 */
export function ThemeProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [theme, setThemeState] = useState<Theme>(readStoredTheme);
  const [systemDark, setSystemDark] = useState<boolean>(prefersDark);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (event: MediaQueryListEvent): void => setSystemDark(event.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  const resolvedTheme: 'light' | 'dark' =
    theme === 'system' ? (systemDark ? 'dark' : 'light') : theme === 'corporate' ? 'light' : theme;

  useEffect(() => {
    // One class at a time: the token blocks are siblings, so leaving a stale one on the
    // root would resolve tokens from whichever rule wins the cascade rather than the
    // chosen theme. `light` stamps nothing — it is the `:root` baseline.
    const applied = theme === 'corporate' ? 'corporate' : resolvedTheme === 'dark' ? 'dark' : null;
    for (const name of CLASS_THEMES) {
      document.documentElement.classList.toggle(name, name === applied);
    }
  }, [theme, resolvedTheme]);

  const setTheme = useCallback((next: Theme): void => {
    setThemeState(next);
    window.localStorage.setItem(THEME_STORAGE_KEY, next);
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, resolvedTheme, setTheme }),
    [theme, resolvedTheme, setTheme],
  );

  return <ThemeContext value={value}>{children}</ThemeContext>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
