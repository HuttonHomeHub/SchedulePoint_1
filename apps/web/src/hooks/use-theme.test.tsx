import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { ThemeToggle } from '@/components/theme-toggle';
import { THEME_STORAGE_KEY } from '@/config/env';
import { ThemeProvider, useTheme } from '@/hooks/use-theme';

/**
 * The theme picker gained a fourth entry — `corporate`, the navy + amber brand skin. Because the
 * token blocks are sibling CSS rules, exactly ONE theme class may sit on `<html>` at a time: a
 * stale `.dark` left behind while `.corporate` is applied would resolve tokens from whichever rule
 * won the cascade rather than from the chosen theme. These tests pin that invariant, the light
 * baseline (which stamps no class at all), and the persistence round-trip.
 */

function ThemeProbe(): React.ReactElement {
  const { theme, resolvedTheme } = useTheme();
  return <span data-testid="probe">{`${theme}|${resolvedTheme}`}</span>;
}

function renderWithProvider(): void {
  render(
    <ThemeProvider>
      <ThemeToggle />
      <ThemeProbe />
    </ThemeProvider>,
  );
}

function classes(): string[] {
  return [...document.documentElement.classList];
}

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.className = '';
  // jsdom ships no `matchMedia`; the provider reads it for `system`. A light-preferring
  // stub keeps these tests about the class-stamping rule rather than OS preference.
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  });
});

describe('theme switching', () => {
  it('stamps exactly one theme class, and none for light', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    renderWithProvider();
    expect(classes()).toContain('dark');

    // dark → corporate must not leave `.dark` behind.
    act(() => screen.getByRole('button').click()); // dark → system
    act(() => screen.getByRole('button').click()); // system → corporate
    expect(classes()).toContain('corporate');
    expect(classes()).not.toContain('dark');

    // corporate → light stamps nothing: light is the `:root` baseline.
    act(() => screen.getByRole('button').click());
    expect(classes()).not.toContain('corporate');
    expect(classes()).not.toContain('dark');
  });

  it('resolves corporate as a LIGHT colour scheme (its content surfaces are light)', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'corporate');
    renderWithProvider();
    expect(screen.getByTestId('probe')).toHaveTextContent('corporate|light');
    expect(classes()).toContain('corporate');
  });

  it('persists the choice and names both states on the control (WCAG 4.1.2)', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'system');
    renderWithProvider();
    act(() => screen.getByRole('button').click());
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('corporate');
    expect(screen.getByRole('button')).toHaveAccessibleName('Theme: Corporate. Switch to Light.');
  });

  it('ignores an unrecognised stored value rather than stamping it', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'neon');
    renderWithProvider();
    expect(screen.getByTestId('probe')).toHaveTextContent(/^system\|/);
    expect(classes()).not.toContain('neon');
  });
});
