import type { LensPalette } from './lenses';
import type { ResourceStripPalette, TsldPalette } from './paint';

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
    // Same-lane time-overlap cue — the warning hue, drawn as a distinct stacked-squares shape (not the
    // conflict triangle), disambiguated by shape + legend, never colour alone (WCAG 1.4.1).
    laneOverlap: token('--color-warning', '#d29628'),
    // Label text: inside-bar text uses each fill's paired *-foreground token (so it contrasts on
    // that fill in both themes); beside-bar text uses the page foreground over the canvas ground.
    labelInside: token('--color-primary-foreground', '#ffffff'),
    labelInsideCritical: token('--color-destructive-foreground', '#ffffff'),
    labelInsideNearCritical: token('--color-warning-foreground', '#1a1a1a'),
    labelBeside: token('--color-foreground', '#e6e8ee'),
  };
}

/**
 * A light-forced painter palette for the **export & print** deliverables (spec
 * `docs/specs/export-print/`, behind `VITE_EXPORT_PRINT`). Extends {@link TsldPalette} (so it drops
 * straight into `paintScene`) with the three surface colours the off-screen export composites around
 * the diagram — the paper `ground`, the title `ink`, and the muted subtitle `mutedInk`.
 */
export interface PrintPalette extends TsldPalette {
  /** The white paper ground the export lays behind the diagram (token `--color-background`, light). */
  ground: string;
  /** Title-band foreground ink (token `--color-foreground`, light) — dark, legible on the paper. */
  ink: string;
  /** Muted subtitle / generated-at ink (token `--color-muted-foreground`, light). */
  mutedInk: string;
}

/**
 * Resolve a **LIGHT-forced** print palette from the SAME design tokens (ADR-0006) `resolveTsldPalette`
 * reads — so an exported / printed diagram is legible on white paper regardless of the user's current
 * light/dark/system theme (reports and paper want light). No hard-coded colours: the app applies dark
 * via a `.dark` class on the documentElement, so the light token values (the `:root` defaults) are read
 * by momentarily clearing that class — **synchronously**, so no paint happens between clear and restore
 * (no flash) — then restoring it. Falls back to sensible LIGHT values when the DOM/tokens are
 * unavailable (jsdom in unit tests), which is what makes the palette light there too.
 */
export function resolvePrintPalette(root: Element = document.documentElement): PrintPalette {
  const hadDark = root.classList.contains('dark');
  if (hadDark) root.classList.remove('dark');
  try {
    const styles = getComputedStyle(root);
    const token = (name: string, fallback: string): string => {
      const value = styles.getPropertyValue(name).trim();
      return value || fallback;
    };
    return {
      // Surface colours the export composites around the diagram (light fallbacks: white paper, near-
      // black ink, mid-grey muted) — token-derived so a themed token override still flows through.
      ground: token('--color-background', '#ffffff'),
      ink: token('--color-foreground', '#1a1a1a'),
      mutedInk: token('--color-muted-foreground', '#6b7280'),
      // The painter fields, mirroring `resolveTsldPalette` but with LIGHT fallbacks (grid a light grey,
      // ink near-black) so the diagram reads on white even when the tokens can't be read.
      gridLine: token('--color-border', '#e5e7eb'),
      edge: token('--color-muted-foreground', '#6b7280'),
      bar: token('--color-primary', '#2f62c4'),
      critical: token('--color-destructive', '#c2331f'),
      nearCritical: token('--color-warning', '#b58900'),
      outline: token('--color-foreground', '#1a1a1a'),
      selection: token('--color-ring', '#3b6fbf'),
      nonWorking: token('--color-muted', '#f0f0f0'),
      today: token('--color-destructive', '#c2331f'),
      conflict: token('--color-warning', '#b58900'),
      laneOverlap: token('--color-warning', '#b58900'),
      labelInside: token('--color-primary-foreground', '#ffffff'),
      labelInsideCritical: token('--color-destructive-foreground', '#ffffff'),
      labelInsideNearCritical: token('--color-warning-foreground', '#1a1a1a'),
      labelBeside: token('--color-foreground', '#1a1a1a'),
    };
  } finally {
    if (hadDark) root.classList.add('dark');
  }
}

/**
 * Resolve the **resource-strip** palette (Stage E, ADR-0049) from the same semantic design tokens
 * (ADR-0006) the painter reads, so the demand strip is theme-aware (light/dark) without hardcoding
 * colour. `bar` uses the primary hue (mirroring the shipped modal histogram's `bg-primary/70` bars),
 * `axis` the border token (the thin baseline rule), `tick` the muted-foreground (the max-tick label).
 * `TsldCanvas` calls this again on a `useThemeVersion` bump to repaint the strip in the new theme
 * (Canvas 2D `fillStyle` can't take a `var()`). Falls back to sensible values when the DOM/tokens are
 * unavailable (jsdom in unit tests).
 */
export function resolveResourceStripPalette(
  root: Element = document.documentElement,
): ResourceStripPalette {
  const styles = getComputedStyle(root);
  const token = (name: string, fallback: string): string => {
    const value = styles.getPropertyValue(name).trim();
    return value || fallback;
  };
  return {
    bar: token('--color-primary', '#3b6fbf'),
    axis: token('--color-border', '#2a2f3a'),
    tick: token('--color-muted-foreground', '#7a8090'),
  };
}

/**
 * Resolve the Colour-by **lens** palette (spec `docs/specs/canvas-lenses/`, behind
 * `VITE_CANVAS_LENSES`) from the same semantic design tokens (ADR-0006), so the recoloured bars stay
 * theme-aware without hardcoding colour. `critical`/`nearCritical`/`bar` mirror {@link resolveTsldPalette}
 * (same tokens + fallbacks), so Colour-by's **Criticality** mode is byte-identical to today's fills; the
 * float bands run destructive → warning → info → success (less → more slack); WBS groups cycle the five
 * chart tokens deterministically; `neutral` is the muted "uncomputed / ungrouped" colour. Call again on
 * a theme change to repaint. Falls back to sensible values when the DOM/tokens are unavailable (jsdom).
 */
export function resolveLensPalette(root: Element = document.documentElement): LensPalette {
  const styles = getComputedStyle(root);
  const token = (name: string, fallback: string): string => {
    const value = styles.getPropertyValue(name).trim();
    return value || fallback;
  };
  return {
    // Mirror the painter (same tokens + fallbacks) so Criticality mode paints byte-for-byte today's fills.
    critical: token('--color-destructive', '#c83c3c'),
    nearCritical: token('--color-warning', '#d29628'),
    bar: token('--color-primary', '#3b6fbf'),
    // The muted "uncomputed / ungrouped" fill — a null total float or a null WBS parent.
    neutral: token('--color-muted-foreground', '#7a8090'),
    // Total-float bands: less slack (red) → more slack (green), each a distinct semantic hue.
    floatCritical: token('--color-destructive', '#c83c3c'),
    floatLow: token('--color-warning', '#d29628'),
    floatMedium: token('--color-info', '#3b6fbf'),
    floatHigh: token('--color-success', '#2f9e44'),
    // WBS groups cycle the five chart tokens (a deterministic, distinguishable categorical ramp).
    wbsCycle: [
      token('--color-chart-1', '#3b6fbf'),
      token('--color-chart-2', '#2f9e44'),
      token('--color-chart-3', '#d29628'),
      token('--color-chart-4', '#9c5cc4'),
      token('--color-chart-5', '#c83c3c'),
    ],
    // Contrast-safe inside-bar label inks paired 1:1 with the fills above (WCAG 1.4.3, ≥ 4.5:1). Each
    // float band reuses its fill token's `*-foreground` (destructive/warning/info/success map 1:1); the
    // neutral ink is the page `--color-background` (white-on-grey in light, dark-on-grey in dark); the
    // WBS cycle pairs chart-1 with `primary-foreground` (theme-flipping, chart-1 mirrors `primary`) and
    // chart-2…5 with the stable-dark `warning-foreground` (0.205 in both themes). Contrast ratios
    // (computed from the oklch tokens in `styles/globals.css`, light / dark — see `lenses.test.ts`):
    //   float critical 4.56 / 5.87 · low 8.48 / 10.12 · medium 5.51 / 6.82 · high 4.87 / 7.03
    //   neutral 4.73 / 7.63 · wbs chart-1 4.72 / 5.50 · chart-2 5.01 / 7.21 · chart-3 4.82 / 7.03
    //   chart-4 8.48 / 10.12 (the 2.02:1 white-on-yellow case, now fixed) · chart-5 4.58 / 6.14
    neutralInk: token('--color-background', '#ffffff'),
    floatCriticalInk: token('--color-destructive-foreground', '#ffffff'),
    floatLowInk: token('--color-warning-foreground', '#1a1a1a'),
    floatMediumInk: token('--color-info-foreground', '#ffffff'),
    floatHighInk: token('--color-success-foreground', '#ffffff'),
    wbsInkCycle: [
      token('--color-primary-foreground', '#ffffff'),
      token('--color-warning-foreground', '#1a1a1a'),
      token('--color-warning-foreground', '#1a1a1a'),
      token('--color-warning-foreground', '#1a1a1a'),
      token('--color-warning-foreground', '#1a1a1a'),
    ],
  };
}

/**
 * The Colour-by **legend** palette expressed as raw CSS `var(--color-*)` references (not resolved
 * values). The on-canvas Legend swatches render as inline `background-color`, where a `var()` is
 * inherently theme-reactive — so the DOM legend re-colours on a light/dark switch with **zero JS** and
 * never goes theme-stale (unlike the canvas fills, which must resolve concrete colours for `fillStyle`).
 * The band order + WBS cycle length mirror {@link resolveLensPalette} exactly, so the legend key matches
 * the painted bars. Inks are canvas-only (the legend shows fills + text labels), so they are omitted here
 * via placeholder `var()`s that the legend never reads.
 */
export function lensLegendVarPalette(): LensPalette {
  const v = (name: string): string => `var(${name})`;
  return {
    critical: v('--color-destructive'),
    nearCritical: v('--color-warning'),
    bar: v('--color-primary'),
    neutral: v('--color-muted-foreground'),
    floatCritical: v('--color-destructive'),
    floatLow: v('--color-warning'),
    floatMedium: v('--color-info'),
    floatHigh: v('--color-success'),
    wbsCycle: [
      v('--color-chart-1'),
      v('--color-chart-2'),
      v('--color-chart-3'),
      v('--color-chart-4'),
      v('--color-chart-5'),
    ],
    // Inks are unused by the legend (it renders swatch fills + muted-foreground text), so mirror the
    // fill vars — never read.
    neutralInk: v('--color-background'),
    floatCriticalInk: v('--color-destructive-foreground'),
    floatLowInk: v('--color-warning-foreground'),
    floatMediumInk: v('--color-info-foreground'),
    floatHighInk: v('--color-success-foreground'),
    wbsInkCycle: [
      v('--color-primary-foreground'),
      v('--color-warning-foreground'),
      v('--color-warning-foreground'),
      v('--color-warning-foreground'),
      v('--color-warning-foreground'),
    ],
  };
}
