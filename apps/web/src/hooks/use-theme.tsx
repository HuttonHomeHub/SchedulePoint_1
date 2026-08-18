import { createContext, useContext, useEffect, useMemo } from 'react';

import { THEME_STORAGE_KEY } from '@/config/env';

/**
 * The themes this product offers. **One** — and it is a union rather than a bare string
 * because the mechanism is kept alive, not because it currently distinguishes anything
 * (ADR-0097).
 *
 * A second member is what "add dark back" costs at this layer: one entry here, one entry
 * in `THEME_SELECTORS`, and a block of values. The expensive half is choosing the values,
 * and the canvas's plot separations have to be **re-derived** rather than re-tinted,
 * because on the diagram colour carries meaning.
 */
export type Theme = 'corporate';

interface ThemeContextValue {
  theme: Theme;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const VALUE: ThemeContextValue = { theme: 'corporate' };

/**
 * Provides the theme and stamps **nothing** on `<html>`.
 *
 * That is the whole design (ADR-0097): `:root` **is** the theme block, so there is no
 * class to apply and therefore no window in which the wrong one could be applied. A flash
 * of the wrong theme is not avoided here, it is **unrepresentable** — `public/theme-boot.js`
 * and this provider cannot disagree about what to paint, because neither of them paints.
 *
 * The one side effect is cleaning up after the old arrangement: a reader who chose `dark`
 * in 2026 still has that key in `localStorage`, and it is **removed rather than ignored**.
 * Leaving it would resurrect a preference nobody has been offered for months on the day a
 * new dark design ships — a change no user asked for, arriving as a surprise. It is done
 * here and never in `theme-boot.js`, which must stay side-effect-free before first paint.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  useEffect(() => {
    try {
      window.localStorage.removeItem(THEME_STORAGE_KEY);
    } catch {
      // A `localStorage` that throws (private mode, a hostile embedder) is not a reason to
      // fail a render. There is nothing to fall back to and nothing to repair: with one
      // theme, a key we cannot delete changes nothing about what is painted.
    }
  }, []);

  const value = useMemo(() => VALUE, []);

  return <ThemeContext value={value}>{children}</ThemeContext>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
