import { act, renderHook, waitFor } from '@testing-library/react';
import { useMemo } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { useThemeVersion } from './use-theme-version';

afterEach(() => {
  document.documentElement.className = '';
  document.documentElement.removeAttribute('data-theme');
});

describe('useThemeVersion', () => {
  it('starts at 0 and bumps when the documentElement `class` mutates (theme switch)', async () => {
    const { result } = renderHook(() => useThemeVersion());
    expect(result.current).toBe(0);
    act(() => {
      document.documentElement.classList.add('dark');
    });
    await waitFor(() => expect(result.current).toBe(1));
  });

  it('bumps on a `data-theme` mutation too', async () => {
    const { result } = renderHook(() => useThemeVersion());
    act(() => {
      document.documentElement.setAttribute('data-theme', 'light');
    });
    await waitFor(() => expect(result.current).toBe(1));
  });

  it('re-resolves a memo keyed on it — a bumped version re-runs the resolver (colour map / legend)', async () => {
    let resolves = 0;
    const { result } = renderHook(() => {
      const version = useThemeVersion();
      // Mirrors the TsldPanel `barFill` / workspace `lensLegend` pattern: a token-resolving memo keyed
      // on the theme version, so a theme switch re-resolves the palette-derived colour map / legend.
      return useMemo(() => {
        resolves += 1;
        return version;
      }, [version]);
    });
    expect(resolves).toBe(1);
    act(() => {
      document.documentElement.classList.add('dark');
    });
    await waitFor(() => expect(result.current).toBe(1));
    // The memo re-resolved exactly once more on the theme bump (no theme-stale colour map).
    expect(resolves).toBe(2);
  });
});
