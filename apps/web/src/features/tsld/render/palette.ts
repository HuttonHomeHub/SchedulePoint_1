import type { LensPalette } from './lenses';
import type { ResourceStripPalette, TsldPalette, WbsBandPalette } from './paint';

/**
 * The categorical WBS ramp, declared ONCE — the fill token, its jsdom fallback, and the ink token
 * that is legible on it.
 *
 * It is one list because three call sites consume it (the painter's fills, the painter's inks and
 * the legend's swatches) and they were three hand-written arrays that had to be kept the same
 * length and the same order. Going 5 → 12 for the light theme is exactly the edit that would have
 * left one of them behind — and a legend one swatch short of the diagram is a defect nobody
 * notices until they are counting phases.
 *
 * **The ink alternates because the ramp does.** A twelve-member categorical ramp spans too much
 * lightness for one label colour to clear 4.5:1 on all of it, so the ramp alternates two lightness
 * bands and the ink alternates with it: white on the darker members, the diagram's dark ink on the
 * lighter ones. Both tokens already exist and are already gated as a pair with their own fills.
 */
const WHITE_INK = '--destructive-foreground';
const DARK_INK = '--primary-foreground';
const WBS_CYCLE_TOKENS: ReadonlyArray<readonly [fill: string, fallback: string, ink: string]> = [
  ['--chart-1', '#4d43a8', WHITE_INK],
  ['--chart-2', '#5f9a3f', DARK_INK],
  ['--chart-3', '#8e3a86', WHITE_INK],
  ['--chart-4', '#3f9c6a', DARK_INK],
  ['--chart-5', '#a83550', WHITE_INK],
  ['--chart-6', '#3f9a95', DARK_INK],
  ['--chart-7', '#6c3ea3', WHITE_INK],
  ['--chart-8', '#529a45', DARK_INK],
  ['--chart-9', '#a3376c', WHITE_INK],
  ['--chart-10', '#3d9a83', DARK_INK],
  ['--chart-11', '#20707f', WHITE_INK],
  ['--chart-12', '#3f92ad', DARK_INK],
];

/**
 * Resolve the TSLD painter palette from the app's semantic design tokens (ADR-0006), so the canvas
 * takes its colour from the design system rather than hardcoding it — the tokens stay the single
 * source of truth and the canvas is just another consumer. Reads the computed `--color-*` custom
 * properties off the element it is given; call again when those values change to repaint. Falls back
 * to sensible values when the DOM/tokens are unavailable (e.g. jsdom in unit tests).
 *
 * This used to say "theme-aware (light/dark)". ADR-0097 collapsed the product to ONE theme, so
 * there is no light/dark axis for this to be aware of; what the indirection buys now is that a
 * re-valued token repaints the diagram with no change here at all, which is what the light-corporate
 * epic is about to collect on.
 *
 * **`root` is REQUIRED, and that is the guard** (ADR-0097 Landing E). It defaulted to
 * `document.documentElement` and every one of the nine production call sites took the default — so
 * all 88 token reads below resolved against the PAGE, on a ground that is not the page. A default
 * makes that failure silent: the diagram paints plausible colours and nothing anywhere reports it.
 * Removing the default turns a missed call site into a compile error, which is the ADR-0070
 * `hoursPerDay` precedent adopted for the same class of bug — a value that is wrong rather than
 * absent, and therefore invisible.
 *
 * **That guard was necessary and was NOT sufficient, which is why these reads are unprefixed.**
 * Landing E made the caller pass the canvas element and stopped there; the reads still named the
 * `--color-*` aliases, and a `@theme inline` alias is declared at `:root` as `--color-primary:
 * var(--primary)`, so its `var()` is substituted **on `:root`** and the already-substituted value is
 * what inherits. A surface-scope rebind of `--primary` therefore cannot reach it — verified in
 * Chromium on a four-line page, not reasoned from the spec. So passing the canvas element changed
 * which element was asked and not one value that came back: the painter had never once used the
 * canvas surface scope.
 *
 * It was invisible while the page and plot families held near-identical values, and it surfaced the
 * moment they diverged — the light corporate theme made `--page-primary` navy while `--plot-primary`
 * is a mid blue, and every non-critical bar painted navy. Reading the unprefixed names is the fix,
 * because those DO follow the rebind. Tailwind utilities were never affected: `inline` is exactly
 * what makes `bg-primary` compile to `var(--primary)` rather than to the frozen alias, which is why
 * every DOM surface has been correct throughout and only the canvas was wrong.
 *
 * The contrast matrix could not report it either: `token-contrast.test.ts` resolves a scope by
 * reading the CSS text and following the rebind itself, so it asserted the mapping the browser does
 * not perform. It was right about what the values SHOULD be and silent about what the painter got.
 */
export function resolveTsldPalette(root: Element): TsldPalette {
  const styles = getComputedStyle(root);
  const token = (name: string, fallback: string): string => {
    const value = styles.getPropertyValue(name).trim();
    return value || fallback;
  };
  return {
    canvasGround: token('--canvas', '#14161c'),
    gridLine: token('--border', '#2a2f3a'),
    // Time-axis gridline tiers (F5, `VITE_CANVAS_TIME_AXIS`) — `gridLine` above stays the
    // flag-off value; these three are read only when `TsldScene.gridTiers` is on.
    gridLineDay: token('--canvas-grid-day', '#565c6a'),
    gridLineMonth: token('--canvas-grid-month', '#2a2f3a'),
    gridLineYear: token('--canvas-grid-year', '#9098ab'),
    edge: token('--muted-foreground', '#7a8090'),
    bar: token('--primary', '#3b6fbf'),
    critical: token('--destructive', '#c83c3c'),
    nearCritical: token('--warning', '#d29628'),
    // A foreground-contrast stroke used to outline critical/near-critical bars, so
    // criticality is never conveyed by fill colour alone (WCAG 1.4.1).
    outline: token('--foreground', '#e6e8ee'),
    selection: token('--ring', '#6ea8fe'),
    // A muted wash for non-working columns and the destructive hue for the today marker.
    nonWorking: token('--muted', '#20242d'),
    // The non-working hatch stripe (F7a, `VITE_CANVAS_TIME_AXIS`) — a step stronger than the wash
    // it draws over, so a weekend/holiday differs by KIND, not just a darker shade of grey.
    nonWorkingHatch: token('--canvas-nonworking-hatch', '#454b58'),
    today: token('--destructive', '#c83c3c'),
    // Today pill ink (F6b, `VITE_CANVAS_TIME_AXIS`) — paired with `today` the same way every other
    // fill pairs with its `*-foreground` token.
    todayInk: token('--destructive-foreground', '#ffffff'),
    // The data-date status line + pill (`VITE_CANVAS_DATA_DATE`) — the FOREGROUND/BACKGROUND pair,
    // deliberately NOT `--color-info`: in all three themes info is a near neighbour of the
    // `--color-primary` bar fill, and a "distinct" line in the bar hue is not distinct (spec CQ-1,
    // measured). Foreground is the strongest neutral already in the palette and pairs 1:1 with
    // background for the pill ink — the `todayInk` guarantee, pinned in `palette.test.ts`.
    dataDate: token('--foreground', '#e6e8ee'),
    dataDateInk: token('--background', '#161a22'),
    // Visual-Planning conflict cue — the warning hue, drawn as a distinct triangle shape so it never
    // relies on colour alone (WCAG 1.4.1); shares the token with near-critical but a different shape.
    conflict: token('--warning', '#d29628'),
    // Same-lane time-overlap cue — the warning hue, drawn as a distinct stacked-squares shape (not the
    // conflict triangle), disambiguated by shape + legend, never colour alone (WCAG 1.4.1).
    laneOverlap: token('--warning', '#d29628'),
    // Label text: inside-bar text uses each fill's paired *-foreground token (so it contrasts on
    // that fill in both themes); beside-bar text uses the page foreground over the canvas ground.
    labelInside: token('--primary-foreground', '#ffffff'),
    labelInsideCritical: token('--destructive-foreground', '#ffffff'),
    labelInsideNearCritical: token('--warning-foreground', '#1a1a1a'),
    labelBeside: token('--foreground', '#e6e8ee'),
    // ── Bar visual refresh (ADR-0052 M4) ─────────────────────────────────────────────────
    // The calm hairline definition stroke on refreshed non-critical bars (the border token —
    // quiet, so the foreground emphasis outline pops) and the idle-hover ring (muted-foreground —
    // lighter than the `--color-ring` selection, so hover ≠ selection). The refresh adds no other
    // colour: progress draws in the bar's paired label ink, glyph caps in the bar's own fill.
    barStroke: token('--border', '#2a2f3a'),
    hoverRing: token('--muted-foreground', '#7a8090'),
    // The grab-handle halo (ADR-0052 M3 discoverability fix) — **the canvas ground**, which is the
    // theme-inverse of the `outline` foreground the handle's core draws in. That pairing is what
    // lets one handle read on every bar fill in every theme without a per-bar contrast decision
    // (see `palette.test.ts`). No new hue is added.
    //
    // It reads `--color-canvas` rather than `--color-card` because the diagram now has a ground of
    // its own (ADR-0055 §4). `--canvas` is valued identically to `--card` in every theme block, so
    // this re-point is a no-op until the flagged cream value lands — and when it does, the halo
    // follows the ground it is meant to match instead of silently drifting from it.
    handleHalo: token('--canvas', '#161a22'),
    // The alternating month band (ADR-0055 §4) — the diagram's own ground, banded, so a planner
    // can count months without reading a single label. Opaque rather than an alpha wash: an alpha
    // band would tint whatever it overlaps and would have to be re-checked against every layer.
    monthBand: token('--canvas-band', '#1b202a'),
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
 * Resolve the print palette from the SAME design tokens (ADR-0006) `resolveTsldPalette` reads, so a
 * printed or exported diagram cannot drift from the one on screen. Falls back to sensible LIGHT
 * values when the DOM or the tokens are unavailable (jsdom in unit tests), which is what makes the
 * palette light there too.
 *
 * **It used to force light by momentarily clearing a `.dark` class**, synchronously so no paint
 * happened in between. ADR-0097 collapsed the product to one theme whose working surfaces are
 * already light, so there is nothing to force and nothing to restore. **If a dark theme returns,
 * this is one of the places that needs it back** — paper wants light whatever the screen is doing,
 * and the trick is recorded here rather than left to be rediscovered.
 */
export function resolvePrintPalette(root: Element): PrintPalette {
  const styles = getComputedStyle(root);
  const token = (name: string, fallback: string): string => {
    const value = styles.getPropertyValue(name).trim();
    return value || fallback;
  };
  return {
    // Surface colours the export composites around the diagram (light fallbacks: white paper, near-
    // black ink, mid-grey muted) — token-derived so a themed token override still flows through.
    ground: token('--background', '#ffffff'),
    ink: token('--foreground', '#1a1a1a'),
    mutedInk: token('--muted-foreground', '#6b7280'),
    // The painter fields, mirroring `resolveTsldPalette` but with LIGHT fallbacks (grid a light grey,
    // ink near-black) so the diagram reads on white even when the tokens can't be read.
    // The print surface never draws the minimap, so the ground field just mirrors `ground`.
    canvasGround: token('--background', '#ffffff'),
    gridLine: token('--border', '#e5e7eb'),
    // Time-axis gridline tiers, LIGHT-forced fallbacks (mirrors resolveTsldPalette's fields).
    gridLineDay: token('--canvas-grid-day', '#f5f6f8'),
    gridLineMonth: token('--canvas-grid-month', '#bcc2ca'),
    gridLineYear: token('--canvas-grid-year', '#8b93a1'),
    edge: token('--muted-foreground', '#6b7280'),
    bar: token('--primary', '#2f62c4'),
    critical: token('--destructive', '#c2331f'),
    nearCritical: token('--warning', '#b58900'),
    outline: token('--foreground', '#1a1a1a'),
    selection: token('--ring', '#3b6fbf'),
    nonWorking: token('--muted', '#f0f0f0'),
    // LIGHT fallback for the same F7a stripe (mirrors `resolveTsldPalette`).
    nonWorkingHatch: token('--canvas-nonworking-hatch', '#c7c7c7'),
    today: token('--destructive', '#c2331f'),
    todayInk: token('--destructive-foreground', '#ffffff'),
    // The data-date pair with LIGHT fallbacks (mirrors `resolveTsldPalette`): near-black rule +
    // pill on paper, white ink on the pill — the export path draws the same line the screen does.
    dataDate: token('--foreground', '#1a1a1a'),
    dataDateInk: token('--background', '#ffffff'),
    conflict: token('--warning', '#b58900'),
    laneOverlap: token('--warning', '#b58900'),
    labelInside: token('--primary-foreground', '#ffffff'),
    labelInsideCritical: token('--destructive-foreground', '#ffffff'),
    labelInsideNearCritical: token('--warning-foreground', '#1a1a1a'),
    labelBeside: token('--foreground', '#1a1a1a'),
    // M4 refresh entries with LIGHT fallbacks (the export path builds a `visualRefresh`-less
    // scene today, but the palette contract stays total — every painter field resolves).
    barStroke: token('--border', '#e5e7eb'),
    hoverRing: token('--muted-foreground', '#6b7280'),
    // The export builds a handle-less scene (the handles are an editing affordance) and prints
    // on unbanded paper, but the palette contract stays TOTAL — every painter field resolves, so
    // a future export that does paint them cannot pick up an undefined colour.
    handleHalo: token('--canvas', '#ffffff'),
    monthBand: token('--canvas-band', '#f7f7f7'),
  };
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
export function resolveResourceStripPalette(root: Element): ResourceStripPalette {
  const styles = getComputedStyle(root);
  const token = (name: string, fallback: string): string => {
    const value = styles.getPropertyValue(name).trim();
    return value || fallback;
  };
  return {
    bar: token('--primary', '#3b6fbf'),
    axis: token('--border', '#2a2f3a'),
    tick: token('--muted-foreground', '#7a8090'),
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
export function resolveLensPalette(root: Element): LensPalette {
  const styles = getComputedStyle(root);
  const token = (name: string, fallback: string): string => {
    const value = styles.getPropertyValue(name).trim();
    return value || fallback;
  };
  return {
    // Mirror the painter (same tokens + fallbacks) so Criticality mode paints byte-for-byte today's fills.
    critical: token('--destructive', '#c83c3c'),
    nearCritical: token('--warning', '#d29628'),
    bar: token('--primary', '#3b6fbf'),
    // The muted "uncomputed / ungrouped" fill — a null total float or a null WBS parent.
    neutral: token('--muted-foreground', '#7a8090'),
    // Total-float bands: less slack (red) → more slack (green), each a distinct semantic hue.
    floatCritical: token('--destructive', '#c83c3c'),
    floatLow: token('--warning', '#d29628'),
    floatMedium: token('--info', '#3b6fbf'),
    floatHigh: token('--success', '#2f9e44'),
    // WBS groups cycle the five chart tokens (a deterministic, distinguishable categorical ramp).
    wbsCycle: WBS_CYCLE_TOKENS.map(([name, fallback]) => token(name, fallback)),
    // Contrast-safe inside-bar label inks paired 1:1 with the fills above (WCAG 1.4.3, ≥ 4.5:1).
    // Each float band reuses its fill token's `*-foreground` (destructive/warning/info/success map
    // 1:1); the neutral ink is the page background; the WBS cycle's inks come from
    // `WBS_CYCLE_TOKENS`, alternating with the ramp's two lightness bands.
    //
    // **The per-member ratios that used to be listed here are gone deliberately.** They were
    // quoted "light / dark" for five members of a three-theme product, and both halves of that
    // are now wrong: ADR-0097 left one theme, and the ramp is twelve. Re-listing twelve numbers
    // in a comment recreates exactly the drift that made the old list wrong — the ramp's
    // derivation and its worst-case figures live beside the values themselves in
    // `styles/globals.css`, which is the one place they cannot fall out of step with what ships.
    neutralInk: token('--background', '#ffffff'),
    floatCriticalInk: token('--destructive-foreground', '#ffffff'),
    floatLowInk: token('--warning-foreground', '#1a1a1a'),
    floatMediumInk: token('--info-foreground', '#ffffff'),
    floatHighInk: token('--success-foreground', '#ffffff'),
    wbsInkCycle: WBS_CYCLE_TOKENS.map(([, , ink]) =>
      token(ink, ink === WHITE_INK ? '#ffffff' : '#1a1a1a'),
    ),
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
    wbsCycle: WBS_CYCLE_TOKENS.map(([name]) => v(`--color${name.slice(1)}`)),
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

/**
 * Resolve the **WBS band** layer's palette from the design tokens (ADR-0063), re-resolved on the
 * shared theme bump like the scene's and the strip's — Canvas 2D `fillStyle` cannot take a
 * `var()`, so the tokens are read once per theme rather than per frame.
 *
 * `derived` is deliberately a different token from `bar`: the Unassigned bucket is the app
 * observing that some work has no grouping, not a grouping the planner made, and the two should
 * not read as the same kind of object. It is the muted token rather than a tint of the primary,
 * so the difference survives a theme switch instead of depending on one theme's contrast.
 */
export function resolveWbsBandPalette(root: Element): WbsBandPalette {
  const styles = getComputedStyle(root);
  const token = (name: string, fallback: string): string => {
    const value = styles.getPropertyValue(name).trim();
    return value || fallback;
  };
  return {
    bar: token('--primary', '#3b6fbf'),
    derived: token('--muted-foreground', '#7a8090'),
    rule: token('--border', '#2a2f3a'),
    label: token('--primary-foreground', '#ffffff'),
    selection: token('--ring', '#8ab4f8'),
  };
}

/**
 * The **light-forced** WBS band palette for the image export and print (ADR-0063 §M5).
 *
 * It delegates to {@link resolveWbsBandPalette} rather than restating the five tokens, and that is
 * the point: a band whose colours were listed twice would eventually print in a colour the screen
 * had stopped using. It used to clear a `.dark` class first — see {@link resolvePrintPalette} for
 * why that is gone and when it would need to come back.
 */
export function resolvePrintWbsBandPalette(root: Element): WbsBandPalette {
  return resolveWbsBandPalette(root);
}
