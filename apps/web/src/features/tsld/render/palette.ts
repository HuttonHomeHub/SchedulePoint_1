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
 * **The categorical ramp's length, and its `var()` form — the ONE vocabulary, exported.**
 *
 * `WBS_CYCLE_TOKENS` above stays module-private, because its triples carry a jsdom fallback that
 * only a canvas `fillStyle` needs. What a second consumer needs is the *ordering* and a form the DOM
 * can paint with, and until now there was none: the constant was a private `const` and the stacked
 * resource histogram's spec described two renderers "indexing the same exported token list", which
 * did not exist. The default outcome of that sentence is a second hand-maintained array of twelve
 * token names — exactly what the docblock above says this list was collapsed into one to prevent,
 * and the drift would be invisible, because each renderer looks right alone and only somebody
 * comparing a legend against a diagram would ever see segment 3 painted two different colours.
 *
 * **`var()` strings, never Tailwind class names.** A caller reaching for `` `fill-chart-${n}` ``
 * would compile to no CSS at all — Tailwind v4 scans for *literal* class strings — so the chart
 * would paint unstyled in a real browser while a jsdom test asserting the `className` passed. That
 * is ADR-0100 M4's minimap-frame defect, in this same token family. A `var()` is also not a colour
 * literal, so it stays inside the `no-colour-literals` lint rule.
 *
 * Theme-reactivity is free and is the reason this is not a resolved-value export: the browser
 * re-resolves `var(--chart-3)` itself, so a DOM consumer never goes theme-stale and needs no
 * `useThemeVersion` bump (the same argument {@link lensLegendVarPalette} makes for the legend).
 */
export const CATEGORICAL_CYCLE_LENGTH = WBS_CYCLE_TOKENS.length;

/** One categorical member: the fill to paint and the ink that is legible on it, both as `var()`. */
export interface CategoricalCycleMember {
  fill: string;
  ink: string;
}

/**
 * The categorical ramp as `var()` pairs, in ramp order — index `n` is the same colour the canvas
 * painter gives segment `n`, so a DOM chart and the canvas cannot disagree about which member is
 * which.
 */
export function categoricalCycleVars(): readonly CategoricalCycleMember[] {
  return WBS_CYCLE_TOKENS.map(([fill, , ink]) => ({ fill: `var(${fill})`, ink: `var(${ink})` }));
}

/**
 * The same ramp, in the same order, **resolved to paintable colours**.
 *
 * Canvas 2D's `fillStyle` cannot take a `var()`: the assignment is silently discarded and the
 * PREVIOUS fill persists, so a stack whose segments carry `var(--chart-n)` paints as one solid
 * block with nothing thrown and nothing logged. Verified in Chromium rather than reasoned about
 * (`fillStyle = 'var(--chart-1)'` after `'#ff0000'` reads back `'#ff0000'`, and the pixel is red).
 *
 * That is the ADR-0100 M4 minimap-frame defect in this same token family, and it very nearly
 * shipped here for the same reason: jsdom has no canvas, so a unit test asserting the segment's
 * `fill` string passes on exactly the value a browser refuses.
 *
 * `resolveLensPalette`'s `wbsCycle` has resolved this ramp correctly since ADR-0049. This is that
 * pattern applied to its neighbour — which is the failure shape this register has now recorded six
 * times — so the two share `WBS_CYCLE_TOKENS` and cannot disagree about which member is which.
 * The jsdom fallbacks travel with it, so a unit test paints the same hex a browser resolves.
 */
export function categoricalCycleResolved(root: Element): readonly CategoricalCycleMember[] {
  const styles = getComputedStyle(root);
  const token = (name: string, fallback: string): string =>
    styles.getPropertyValue(name).trim() || fallback;
  return WBS_CYCLE_TOKENS.map(([fill, fallback, ink]) => ({
    fill: token(fill, fallback),
    ink: token(ink, ink === WHITE_INK ? '#ffffff' : '#1a1a1a'),
  }));
}

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
    // The lane hairline (workspace redesign M4-T2). Its own token rather than `--border`: this rule
    // runs the length of the diagram once per lane, so it is by far the most-repeated line on the
    // surface, and a value chosen for a card's edge is the wrong one for it by an order of
    // magnitude of total ink.
    laneRule: token('--canvas-lane-rule', '#232833'),
    edge: token('--muted-foreground', '#7a8090'),
    bar: token('--primary', '#3b6fbf'),
    critical: token('--destructive', '#c83c3c'),
    nearCritical: token('--warning', '#d29628'),
    // A foreground-contrast stroke used to outline critical/near-critical bars, so
    // criticality is never conveyed by fill colour alone (WCAG 1.4.1).
    outline: token('--foreground', '#e6e8ee'),
    selection: token('--ring', '#6ea8fe'),
    // A muted wash for non-working columns and the destructive hue for the today marker.
    nonWorking: token('--canvas-nonworking', '#20242d'),
    // The non-working hatch stripe (F7a, `VITE_CANVAS_TIME_AXIS`) — a step stronger than the wash
    // it draws over, so a weekend/holiday differs by KIND, not just a darker shade of grey.
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
  /** The paper ground the export lays behind the diagram (token `--print`, light by declaration). */
  ground: string;
  /** Title-band foreground ink (token `--print-foreground`) — dark, legible on the paper. */
  ink: string;
  /** Muted subtitle / generated-at ink (token `--print-muted-foreground`). */
  mutedInk: string;
}

/**
 * **Every token `resolvePrintPalette` reads, and the light value it falls back to.** Exported so
 * `print-palette.structural.test.ts` can sweep the SAME list rather than restating it — a gate
 * built from its own hand-written copy of the roster is the ADR-0073 C4 defect in miniature, and it
 * would go green the day a field is added and not mirrored.
 *
 * The three `--print-*` names are the paper trio (TECH_DEBT #158): light **by declaration**, read
 * by `PrintSurface.css` too, so the chrome around the image and the image itself have one source.
 * Everything else resolves from the CANVAS surface scope, which is what keeps a printed diagram
 * from drifting from the one on screen — the property this function's docblock has always promised
 * and the reason freezing these to literals would be wrong. See the gate for what guards it.
 */
export const PRINT_TOKEN_SOURCES = {
  ground: ['--print', '#ffffff'],
  ink: ['--print-foreground', '#333333'],
  mutedInk: ['--print-muted-foreground', '#666666'],
  canvasGround: ['--print', '#ffffff'],
  gridLine: ['--border', '#e0e0e0'],
  gridLineDay: ['--canvas-grid-day', '#dee0e2'],
  gridLineMonth: ['--canvas-grid-month', '#72777e'],
  gridLineYear: ['--canvas-grid-year', '#595e66'],
  laneRule: ['--canvas-lane-rule', '#e8eaec'],
  edge: ['--muted-foreground', '#636363'],
  bar: ['--primary', '#4b8cca'],
  critical: ['--destructive', '#9c0711'],
  nearCritical: ['--warning', '#9f5600'],
  outline: ['--foreground', '#333333'],
  labelBeside: ['--foreground', '#333333'],
  selection: ['--ring', '#1266a9'],
  nonWorking: ['--canvas-nonworking', '#e9eef4'],
  today: ['--destructive', '#9c0711'],
  todayInk: ['--destructive-foreground', '#ffffff'],
  dataDate: ['--foreground', '#333333'],
  dataDateInk: ['--print', '#ffffff'],
  conflict: ['--warning', '#9f5600'],
  laneOverlap: ['--warning', '#9f5600'],
  labelInside: ['--primary-foreground', '#151b24'],
  labelInsideCritical: ['--destructive-foreground', '#ffffff'],
  labelInsideNearCritical: ['--warning-foreground', '#ffffff'],
  barStroke: ['--border', '#e0e0e0'],
  hoverRing: ['--muted-foreground', '#636363'],
  handleHalo: ['--print', '#ffffff'],
  monthBand: ['--canvas-band', '#f6f7f9'],
} as const satisfies Record<keyof PrintPalette, readonly [token: string, fallback: string]>;

/**
 * Resolve the print palette for the **export & print** deliverables.
 *
 * Two different rules, and the split is the whole point (TECH_DEBT #158):
 *
 * - **The paper trio** (`ground`, `canvasGround`, `ink`, `mutedInk`, `dataDateInk`, `handleHalo`)
 *   reads `--print-*`, which is declared light at `:root` and is **not rebound by any surface**.
 *   Paper is light because it is declared light, not because the current theme happens to be.
 * - **The diagram fields** read the CANVAS surface scope, so a printed diagram cannot drift from
 *   the one on screen — the property this function has always promised, and the reason freezing
 *   them to literals is the wrong SHAPE of fix even though it would also produce a light picture.
 *
 * **What "cannot drift" does and does not cover.** It holds for hue and ink — bars, labels, edges,
 * criticality — which are the same tokens the screen paints from. It does NOT hold for anything
 * measured *against the ground*, because the ground was deliberately decoupled: the non-working
 * wash sits ΔL 0.007 from the canvas ground on screen and ΔL 0.035 from paper. That is a chosen
 * divergence (paper wants more separation than a lit screen), not parity, and saying so here is
 * cheaper than someone rediscovering it from an artefact.
 *
 * **What this replaced, and why the obvious fix was rejected.** The paper trio used to read
 * `--background`/`--foreground`, so Graphite printed a near-black diagram panel inside white paper
 * chrome. TECH_DEBT #158 prescribed freezing the whole palette to literals the function never reads
 * from the DOM. Measured against the shipped light theme before implementing, that would have
 * shipped two INVERTED label pairings — the frozen literals pair white ink with the on-schedule
 * fill (3.56:1, WCAG 1.4.3 fail on the commonest bar in any programme) and near-black with the
 * warning amber, because they predate the criticality ladder that derived those pairings. The
 * diagnosis was right and the prescribed mechanism had gone stale; the fallbacks below are now the
 * shipped tokens' own values, computed rather than eyeballed.
 *
 * **It used to force light by momentarily clearing a `.dark` class.** ADR-0097 collapsed the
 * product to one light theme and the trick was removed as unnecessary; ADR-0099 made the whole
 * product dark two days later and nothing acted on the comment that named its own trigger. That is
 * why the guarantee is now a gate — `print-palette.structural.test.ts` fails the build if the
 * canvas scope stops resolving light, so the defect cannot return silently. When it fires, the fix
 * is a `[data-surface="print"]` scope with paper values of its own, not another comment.
 */
export function resolvePrintPalette(root: Element): PrintPalette {
  const styles = getComputedStyle(root);
  const entries = Object.entries(PRINT_TOKEN_SOURCES).map(([field, [name, fallback]]) => [
    field,
    styles.getPropertyValue(name).trim() || fallback,
  ]);
  return Object.fromEntries(entries) as PrintPalette;
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
    // The strip canvas is transparent, so what shows through behind the bars is the diagram ground
    // — which is why segment boundaries are drawn in it, and why the contrast gate asserts every
    // categorical fill against `--canvas` as well as the dialog's `--card`.
    ground: token('--canvas', '#f4f6f8'),
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
    critical: v('--destructive'),
    nearCritical: v('--warning'),
    bar: v('--primary'),
    neutral: v('--muted-foreground'),
    floatCritical: v('--destructive'),
    floatLow: v('--warning'),
    floatMedium: v('--info'),
    floatHigh: v('--success'),
    wbsCycle: WBS_CYCLE_TOKENS.map(([name]) => v(name)),
    // Inks are unused by the legend (it renders swatch fills + muted-foreground text), so mirror the
    // fill vars — never read.
    neutralInk: v('--background'),
    floatCriticalInk: v('--destructive-foreground'),
    floatLowInk: v('--warning-foreground'),
    floatMediumInk: v('--info-foreground'),
    floatHighInk: v('--success-foreground'),
    // **Deliberately NOT derived from `WBS_CYCLE_TOKENS`, and deliberately still five.** The legend
    // renders swatch fills plus muted text and never reads an ink — `buildColourLegend` carries only
    // `label` and `colour`, so nothing consumes this field. Deriving it would make a dead value look
    // live and imply the legend paints labels on its swatches, which it does not.
    //
    // It is left at five rather than grown to twelve for the same reason: a reader who notices the
    // mismatch should find this note and delete the field, not lengthen it. Named here because a
    // reviewer flagged the inconsistency as a trap — three call sites kept in sync by hand is what
    // `WBS_CYCLE_TOKENS` exists to kill, and an un-migrated sibling invites someone to "fix" it by
    // wiring it up wrong.
    wbsInkCycle: [
      v('--primary-foreground'),
      v('--warning-foreground'),
      v('--warning-foreground'),
      v('--warning-foreground'),
      v('--warning-foreground'),
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
 *
 * **`derived` is a STROKE, not a fill** (`docs/TECH_DEBT.md` #71). The bucket is drawn as an open
 * bracket, so this token is back to the ink role every other consumer uses it in. That closes the
 * inversion — a token this codebase validates as ink, used as a fill, then painted with a
 * different ink than the one it was validated with — which `token-contrast.test.ts` records as
 * having been invisible to it by construction rather than by oversight.
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
    // The diagram's ink on the diagram's GROUND, because the derived bucket no longer has a fill of
    // its own to sit on (`docs/TECH_DEBT.md` #71). It was `--background` — which inside the canvas
    // scope resolves to `--canvas`, the ground itself — chosen as an inversion against the muted
    // fill. Leaving it there while removing the fill would have painted the name in the ground
    // colour: invisible, on screen, in the export and on paper. That is why the bracket and this
    // line are one change and not two.
    derivedLabel: token('--foreground', '#1a1a1a'),
    // The diagram's ink, not `--ring`: this stroke is painted INSET on the bar's own fill.
    selection: token('--foreground', '#1a1a1a'),
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
