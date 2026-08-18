import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { ThemeProvider, useTheme } from './use-theme';

import { THEME_STORAGE_KEY } from '@/config/env';

function Probe(): React.ReactElement {
  const { theme } = useTheme();
  return <span data-testid="theme">{theme}</span>;
}

function renderProvider(): void {
  render(
    <ThemeProvider>
      <Probe />
    </ThemeProvider>,
  );
}

/**
 * **What this suite proves is an absence, and the absence is the guarantee** (ADR-0097).
 *
 * The old arrangement stamped `.dark` or `.corporate` on `<html>`, which meant
 * `public/theme-boot.js` and this provider each had an opinion about what to paint and a
 * window in which they could disagree — a flash of the wrong theme. `:root` is now the
 * theme block, so neither paints, and the cases below are written the way they are because
 * "no class, ever, whatever is in storage" is the whole contract. A test asserting the
 * happy path alone would pass equally against a provider that stamped a class for one
 * stored value out of five.
 */
describe('ThemeProvider', () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.className = '';
  });

  it('reports the one theme', () => {
    renderProvider();
    expect(screen.getByTestId('theme')).toHaveTextContent('corporate');
  });

  it.each([
    ['dark', 'the preference a reader actually chose before the collapse'],
    ['light', 'the same, one value along'],
    ['system', 'the old default, which was never written explicitly by most readers'],
    ['corporate', 'the value that survives — and still stamps nothing'],
    ['nonsense', 'a value no version of this product ever wrote'],
    ['', 'an empty string, which is neither absent nor valid'],
  ])('stamps no class for a stored %s (%s)', async (stored) => {
    window.localStorage.setItem(THEME_STORAGE_KEY, stored);

    renderProvider();

    // Not "the right class" — NO class. There is nothing for a boot script to race.
    expect(document.documentElement.className).toBe('');
    await waitFor(() => expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBeNull());
  });

  it('clears a stale preference rather than ignoring it', async () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'dark');

    renderProvider();

    // Removed, not left in place. Leaving it would resurrect a 2026 preference on the day a
    // new dark design ships — a change nobody asked for, arriving as a surprise.
    await waitFor(() => expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBeNull());
  });

  it('renders when localStorage throws', () => {
    const original = window.localStorage.removeItem;
    window.localStorage.removeItem = () => {
      throw new Error('private mode');
    };
    try {
      renderProvider();
      // A store we cannot write to changes nothing about what is painted, so it must not
      // take the app down. There is no fallback to choose between.
      expect(screen.getByTestId('theme')).toHaveTextContent('corporate');
      expect(document.documentElement.className).toBe('');
    } finally {
      window.localStorage.removeItem = original;
    }
  });

  it('throws when used outside the provider', () => {
    expect(() => render(<Probe />)).toThrow(/must be used within a ThemeProvider/);
  });
});
