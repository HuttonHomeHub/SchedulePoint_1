import type { TsldPalette } from './paint';

/**
 * Resolve the TSLD painter palette from the app's semantic design tokens (ADR-0006),
 * so the canvas is theme-aware (light/dark) without hardcoding colour — the tokens stay
 * the single source of truth and the canvas is just another consumer. Reads the computed
 * `--color-*` custom properties off the document root; call again on a theme change to
 * repaint with the new values. Falls back to sensible values when the DOM/tokens are
 * unavailable (e.g. jsdom in unit tests).
 */
export function resolveTsldPalette(root: Element = document.documentElement): TsldPalette {
  const styles = getComputedStyle(root);
  const token = (name: string, fallback: string): string => {
    const value = styles.getPropertyValue(name).trim();
    return value || fallback;
  };
  return {
    gridLine: token('--color-border', '#2a2f3a'),
    edge: token('--color-muted-foreground', '#7a8090'),
    bar: token('--color-primary', '#3b6fbf'),
    critical: token('--color-destructive', '#c83c3c'),
    nearCritical: token('--color-warning', '#d29628'),
    // A foreground-contrast stroke used to outline critical/near-critical bars, so
    // criticality is never conveyed by fill colour alone (WCAG 1.4.1).
    outline: token('--color-foreground', '#e6e8ee'),
    selection: token('--color-ring', '#6ea8fe'),
    // A muted wash for non-working columns and the destructive hue for the today marker.
    nonWorking: token('--color-muted', '#20242d'),
    today: token('--color-destructive', '#c83c3c'),
    // Visual-Planning conflict cue — the warning hue, drawn as a distinct triangle shape so it never
    // relies on colour alone (WCAG 1.4.1); shares the token with near-critical but a different shape.
    conflict: token('--color-warning', '#d29628'),
    // Label text: inside-bar text uses each fill's paired *-foreground token (so it contrasts on
    // that fill in both themes); beside-bar text uses the page foreground over the canvas ground.
    labelInside: token('--color-primary-foreground', '#ffffff'),
    labelInsideCritical: token('--color-destructive-foreground', '#ffffff'),
    labelInsideNearCritical: token('--color-warning-foreground', '#1a1a1a'),
    labelBeside: token('--color-foreground', '#e6e8ee'),
  };
}
