import { useEffect, useState } from 'react';

/**
 * A monotonically-increasing counter that **bumps whenever the app theme changes** — i.e. whenever the
 * `class` or `data-theme` attribute on `document.documentElement` mutates (the light/dark/system switch
 * stamps those). It watches the root with a single `MutationObserver`, so any consumer that resolves
 * colour from `getComputedStyle` design tokens (ADR-0006) can key a memo on this value and re-resolve on
 * a theme switch — the shared source of truth for "the tokens may have changed", extracted from the TSLD
 * canvas's inline observer so the canvas painter and the Colour-by lens maps / legend can't drift.
 *
 * SSR-safe: on the server (or before mount) there is no `document`, so it starts at `0` and only wires
 * the observer in an effect. Consumers that paint from concrete resolved colours (the Canvas 2D
 * `fillStyle` can't take a `var()`) need this; consumers that render inline `var(--color-*)` styles are
 * theme-reactive already and don't.
 */
export function useThemeVersion(): number {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    if (typeof MutationObserver === 'undefined' || typeof document === 'undefined') return;
    const observer = new MutationObserver(() => setVersion((v) => v + 1));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-theme'],
    });
    return () => observer.disconnect();
  }, []);
  return version;
}
