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
    background: token('--color-background', '#0b0d12'),
    gridLine: token('--color-border', '#2a2f3a'),
    axisText: token('--color-muted-foreground', '#9aa0ac'),
    edge: token('--color-muted-foreground', '#7a8090'),
    bar: token('--color-primary', '#3b6fbf'),
    barText: token('--color-primary-foreground', '#ffffff'),
    critical: token('--color-destructive', '#c83c3c'),
    nearCritical: token('--color-warning', '#d29628'),
    selection: token('--color-ring', '#6ea8fe'),
  };
}
