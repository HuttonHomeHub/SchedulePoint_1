import type { ActivitySummary, BaselineVarianceRow, ConstraintType } from '@repo/types';

/**
 * The pure, renderer-agnostic logic behind the TSLD **insight lenses** (spec
 * `docs/specs/canvas-lenses/`, behind `VITE_CANVAS_LENSES`): the client-side **filter matcher**, the
 * **Colour-by** key/bucket/palette machinery, and the **baseline ghost** geometry builder. Like
 * `render-model.ts` it has **no** canvas, DOM, React or data-fetching dependency and does **no**
 * schedule arithmetic — it only reads fields the engine already computed and shipped on
 * `ActivitySummary` / `BaselineVarianceRow`, so it is exhaustively unit-tested. `TsldPanel` memoises
 * these into the `TsldScene` (`dimmedIds` / `barFill` / `baselineGhosts`), and the painter draws from
 * the precomputed maps with zero per-frame allocation (ADR-0026 draw budget).
 */

// ── Filter / search ─────────────────────────────────────────────────────────────────────

/**
 * The canvas filter attributes (the Filter menu's toggles). Each maps to a boolean predicate over an
 * already-shipped `ActivitySummary` field, so the lens adds no new data:
 * - `critical`   → `isCritical` (on the critical path)
 * - `constraint` → a set date constraint (`constraintType !== null`)
 * - `conflict`   → a Visual-Planning placement conflict (`visualConflict`)
 */
export type FilterAttr = 'critical' | 'constraint' | 'conflict';

/** The ordered attribute set the Filter menu offers, with its human label (single source for the menu). */
export const FILTER_ATTRS: ReadonlyArray<{ attr: FilterAttr; label: string }> = [
  { attr: 'critical', label: 'Critical' },
  { attr: 'constraint', label: 'Has constraint' },
  { attr: 'conflict', label: 'Has conflict' },
];

/** The minimal activity shape the matcher reads — a subset of {@link ActivitySummary}. */
export interface MatchableActivity {
  code: string | null;
  name: string;
  isCritical: boolean;
  constraintType: ConstraintType | null;
  visualConflict: boolean;
}

function matchesAttr(activity: MatchableActivity, attr: FilterAttr): boolean {
  switch (attr) {
    case 'critical':
      return activity.isCritical;
    case 'constraint':
      return activity.constraintType !== null;
    case 'conflict':
      return activity.visualConflict;
  }
}

/**
 * Whether an activity matches the active filter — the **intersection** of the text query and every
 * toggled attribute. The text test is a case-insensitive substring over `{code} {name}` (trimmed;
 * empty ⇒ no text constraint). An empty query with no attributes matches everything (the "no filter"
 * identity), so a cleared filter dims nothing. Pure and allocation-light (one lower-cased haystack).
 */
export function matchesActivityFilter(
  activity: MatchableActivity,
  query: string,
  attrs: ReadonlySet<FilterAttr>,
): boolean {
  const q = query.trim().toLowerCase();
  if (q.length > 0) {
    const haystack = `${activity.code ?? ''} ${activity.name}`.toLowerCase();
    if (!haystack.includes(q)) return false;
  }
  for (const attr of attrs) {
    if (!matchesAttr(activity, attr)) return false;
  }
  return true;
}

/** True when the filter constrains anything (a non-blank query or at least one attribute). When false,
 * every activity matches, so `TsldPanel` skips building a `dimmedIds` set (parity — no scene field). */
export function isFilterActive(query: string, attrs: ReadonlySet<FilterAttr>): boolean {
  return query.trim().length > 0 || attrs.size > 0;
}

// ── Colour by… ──────────────────────────────────────────────────────────────────────────

/**
 * The Colour-by modes (a closed client enum; ADR-0031 lens taxonomy, `docs/DECISIONS.md`). Driving-
 * resource is a deferred fast-follow (needs `VITE_RESOURCES` + the assignments query) — the machinery
 * is mode-generic so a `'resource'` member drops in additively without changing this contract.
 */
export type ColourMode = 'criticality' | 'totalFloat' | 'wbs';

/** The stable colour key each Total-float bucket / criticality band / ungrouped WBS resolves to. */
export type ColourKey = string;

/** The neutral "uncomputed / ungrouped" key — a `null` total float or a `null` WBS parent. */
export const NEUTRAL_COLOUR_KEY = 'neutral';

/**
 * The Total-float buckets, defined **once** as a documented constant and unit-tested on every
 * boundary. Boundaries are inclusive upper bounds in **working days**; a `null` total float is the
 * neutral bucket (never recalculated). The first bucket ("critical / ≤ 0") also captures negative
 * float (an over-constrained activity).
 *
 * - `critical` — `totalFloat ≤ 0`  (critical or behind)
 * - `low`      — `1 … 5` days       (little slack)
 * - `medium`   — `6 … 20` days      (some slack)
 * - `high`     — `> 20` days        (lots of slack)
 */
export const FLOAT_BUCKETS: ReadonlyArray<{ key: ColourKey; maxInclusive: number; label: string }> =
  [
    { key: 'critical', maxInclusive: 0, label: 'Critical / ≤ 0 days' },
    { key: 'low', maxInclusive: 5, label: '1–5 days' },
    { key: 'medium', maxInclusive: 20, label: '6–20 days' },
    { key: 'high', maxInclusive: Infinity, label: 'Over 20 days' },
  ];

/** The float bucket key for a total float (working days), or the neutral key when it is `null`. */
export function floatBucketKey(totalFloat: number | null): ColourKey {
  if (totalFloat === null) return NEUTRAL_COLOUR_KEY;
  for (const bucket of FLOAT_BUCKETS) {
    if (totalFloat <= bucket.maxInclusive) return bucket.key;
  }
  // Unreachable — the last bucket's bound is Infinity — but keeps the function total.
  return 'high';
}

/** The minimal activity shape the colour machinery reads — a subset of {@link ActivitySummary}. */
export interface ColourableActivity {
  id: string;
  isCritical: boolean;
  isNearCritical: boolean;
  totalFloat: number | null;
  parentId: string | null;
}

/**
 * The stable colour **key** an activity resolves to under a mode. Criticality mirrors the painter's
 * `barColour` exactly (critical → `critical`, near-critical → `nearCritical`, else `normal`) so the
 * default mode is byte-for-byte today's fills. Total-float buckets by {@link floatBucketKey}; WBS keys
 * by `parentId` (ungrouped → the neutral key).
 */
export function colourKeyFor(activity: ColourableActivity, mode: ColourMode): ColourKey {
  switch (mode) {
    case 'criticality':
      return activity.isCritical ? 'critical' : activity.isNearCritical ? 'nearCritical' : 'normal';
    case 'totalFloat':
      return floatBucketKey(activity.totalFloat);
    case 'wbs':
      return activity.parentId ?? NEUTRAL_COLOUR_KEY;
  }
}

/**
 * The palette the colour machinery resolves keys against — from the app's design tokens (ADR-0006) so
 * the canvas stays theme-aware without hardcoding colour. `criticality`/`nearCritical`/`bar` mirror
 * the painter's own values (same tokens) so Colour-by's Criticality mode is byte-identical; `neutral`
 * is the muted "uncomputed / ungrouped" colour; the float band + WBS cycle are lens-only bands.
 */
export interface LensPalette {
  critical: string;
  nearCritical: string;
  bar: string;
  neutral: string;
  floatCritical: string;
  floatLow: string;
  floatMedium: string;
  floatHigh: string;
  /** A deterministic, ordered cycle of distinguishable hues for WBS groups (cycled by index). */
  wbsCycle: readonly string[];
  // ── Inside-bar label inks (WCAG 1.4.3, ≥ 4.5:1) ─────────────────────────────────────────
  // Each lens fill band carries a paired, contrast-safe foreground so an on-bar label stays legible
  // when Colour-by repaints the bar a non-criticality hue (the painter's criticality-based ink assumed
  // the critical/near-critical/primary fills, and e.g. white-on-warning-yellow measured only 2.02:1).
  // Resolved from the same tokens as the fills; ratios are documented at {@link resolveLensPalette}.
  /** Ink for the neutral (uncomputed / ungrouped) fill. */
  neutralInk: string;
  floatCriticalInk: string;
  floatLowInk: string;
  floatMediumInk: string;
  floatHighInk: string;
  /** Contrast-safe inks paired 1:1 with {@link wbsCycle} (same index/cycle). */
  wbsInkCycle: readonly string[];
}

/**
 * The **upper bound** on how many distinct WBS groups the on-canvas Legend spells out before collapsing
 * the remainder into a "+N more" row (edge case: hundreds of parents). The *effective* cap is the
 * smaller of this and the palette's {@link LensPalette.wbsCycle} length ({@link legendGroupCap}), so the
 * key never shows two groups with the **same** swatch (the cycle wraps at `wbsCycle.length`, so groups
 * beyond it re-use earlier colours — listing them with distinct labels would be misleading, a11y). The
 * colour cycle itself stays unbounded; this only caps the *legend* length.
 */
export const WBS_LEGEND_CAP = 8;

/** The effective WBS legend cap: never more than the palette has distinct swatches (see {@link WBS_LEGEND_CAP}). */
function legendGroupCap(palette: LensPalette): number {
  return Math.min(WBS_LEGEND_CAP, palette.wbsCycle.length);
}

/**
 * The resolved fill colour for a mode's key. Criticality/near-critical/normal read the painter-mirror
 * entries; float buckets their band; WBS cycles the palette deterministically by a stable index; the
 * neutral key is the muted colour. The `wbsIndexOf` map makes WBS assignment stable across renders
 * (same parent ⇒ same colour) rather than dependent on iteration order.
 */
function fillForKey(
  key: ColourKey,
  mode: ColourMode,
  palette: LensPalette,
  wbsIndexOf: ReadonlyMap<string, number>,
): string {
  if (key === NEUTRAL_COLOUR_KEY) return palette.neutral;
  if (mode === 'criticality') {
    return key === 'critical'
      ? palette.critical
      : key === 'nearCritical'
        ? palette.nearCritical
        : palette.bar;
  }
  if (mode === 'totalFloat') {
    switch (key) {
      case 'critical':
        return palette.floatCritical;
      case 'low':
        return palette.floatLow;
      case 'medium':
        return palette.floatMedium;
      default:
        return palette.floatHigh;
    }
  }
  // WBS: `key` is the parentId; cycle the palette by the stable index.
  const index = wbsIndexOf.get(key) ?? 0;
  const cycle = palette.wbsCycle;
  return cycle[index % cycle.length] ?? palette.neutral;
}

/**
 * A deterministic, stable id→group-index assignment for WBS colouring: parents are indexed in **first
 * appearance order** over the activities, so the same plan always yields the same parent→colour
 * mapping across renders (the palette then cycles by this index). Exported so the Legend can list the
 * groups in the same order and cap them.
 */
export function buildWbsIndex(activities: readonly ColourableActivity[]): Map<string, number> {
  const index = new Map<string, number>();
  for (const activity of activities) {
    const parent = activity.parentId;
    if (parent !== null && !index.has(parent)) index.set(parent, index.size);
  }
  return index;
}

/**
 * The per-activity fill map the painter reads as `barFill` (id → CSS colour). Every mode — including
 * Criticality — produces a full map; `TsldPanel` passes it into the scene only for the non-default
 * modes (Criticality ⇒ `barFill` absent ⇒ the painter's own `barColour` runs ⇒ byte-for-byte parity),
 * while the Criticality map exists so its equality with today's fills is directly unit-testable.
 * Precomputed once (memoised upstream); the paint path does a single `Map.get` per bar, no allocation.
 */
export function buildColourMap(
  activities: readonly ColourableActivity[],
  mode: ColourMode,
  palette: LensPalette,
): Map<string, string> {
  const wbsIndexOf = mode === 'wbs' ? buildWbsIndex(activities) : new Map<string, number>();
  const map = new Map<string, string>();
  for (const activity of activities) {
    const key = colourKeyFor(activity, mode);
    map.set(activity.id, fillForKey(key, mode, palette, wbsIndexOf));
  }
  return map;
}

/**
 * The contrast-safe **ink** paired with a key's {@link fillForKey} fill, so an inside-bar label clears
 * 4.5:1 on the recoloured bar (WCAG 1.4.3). Float buckets read their band's `*-foreground` token; WBS
 * cycles {@link LensPalette.wbsInkCycle} by the same stable index as the fill; the neutral key and the
 * Criticality mode (never passed as a lens override — the painter owns its own criticality inks) fall
 * back to the neutral ink.
 */
function inkForKey(
  key: ColourKey,
  mode: ColourMode,
  palette: LensPalette,
  wbsIndexOf: ReadonlyMap<string, number>,
): string {
  if (key === NEUTRAL_COLOUR_KEY) return palette.neutralInk;
  if (mode === 'totalFloat') {
    switch (key) {
      case 'critical':
        return palette.floatCriticalInk;
      case 'low':
        return palette.floatLowInk;
      case 'medium':
        return palette.floatMediumInk;
      default:
        return palette.floatHighInk;
    }
  }
  if (mode === 'wbs') {
    const index = wbsIndexOf.get(key) ?? 0;
    const cycle = palette.wbsInkCycle;
    return cycle[index % cycle.length] ?? palette.neutralInk;
  }
  return palette.neutralInk;
}

/**
 * The per-activity **ink** map the painter reads as `barInk` (id → CSS colour), paired 1:1 with
 * {@link buildColourMap}'s fills, so an inside-bar label stays ≥ 4.5:1 on the recoloured bar
 * (WCAG 1.4.3). `TsldPanel` passes it into the scene only for the non-default Colour-by modes (as with
 * `barFill`), so Criticality ⇒ absent ⇒ the painter's own criticality inks run ⇒ byte-for-byte parity.
 * Precomputed once (memoised); the paint path does a single `Map.get` per bar, no allocation.
 */
export function buildColourInkMap(
  activities: readonly ColourableActivity[],
  mode: ColourMode,
  palette: LensPalette,
): Map<string, string> {
  const wbsIndexOf = mode === 'wbs' ? buildWbsIndex(activities) : new Map<string, number>();
  const map = new Map<string, string>();
  for (const activity of activities) {
    const key = colourKeyFor(activity, mode);
    map.set(activity.id, inkForKey(key, mode, palette, wbsIndexOf));
  }
  return map;
}

// ── Baseline overlay ────────────────────────────────────────────────────────────────────

/**
 * A baseline **ghost** bar — the captured baseline span drawn behind the live bar so slip reads on the
 * canvas. Carries the baseline's absolute inclusive dates (`YYYY-MM-DD`) and the **live** activity's
 * current lane (joined by id), so the ghost sits directly behind its bar. The painter turns these into
 * a screen rect with the same inclusive-finish `+1` convention as `activityRect`, and culls the layer.
 */
export interface GhostBar {
  id: string;
  baselineStart: string;
  baselineFinish: string;
  laneIndex: number;
  /** Whether the live activity is a milestone, so the painter ghosts it as a diamond outline (not a
   * rect), matching the live milestone convention (ADR-0026). Carried from the joined live activity. */
  isMilestone: boolean;
}

/** The minimal live-activity shape the ghost builder joins against — the current lane + whether it is a
 * milestone (so the ghost matches its live bar's shape), by id. */
export interface GhostLaneSource {
  laneIndex: number;
  isMilestone: boolean;
}

/**
 * Build the baseline ghost bars from the shipped variance rows (`useBaselineVariance`) joined to the
 * live activities by id (ADR-0025 CQ-3/CQ-4). A row contributes a ghost only when it has both baseline
 * dates AND a live activity to sit behind: rows flagged `removed` (in the baseline, no longer live)
 * have no lane and are **omitted** (the table already lists them), as are rows whose live activity
 * isn't present (e.g. still loading) or whose baseline dates are null. Pure — no canvas/React; the
 * painter owns the geometry + culling.
 */
export function buildBaselineGhosts(
  varianceRows: readonly BaselineVarianceRow[],
  activitiesById: ReadonlyMap<string, GhostLaneSource>,
): GhostBar[] {
  const ghosts: GhostBar[] = [];
  for (const row of varianceRows) {
    if (row.removed) continue;
    if (row.baselineStart === null || row.baselineFinish === null) continue;
    const live = activitiesById.get(row.activityId);
    if (!live) continue;
    ghosts.push({
      id: row.activityId,
      baselineStart: row.baselineStart,
      baselineFinish: row.baselineFinish,
      laneIndex: live.laneIndex,
      isMilestone: live.isMilestone,
    });
  }
  return ghosts;
}

/** Narrowing helper for `TsldPanel` — `ActivitySummary` satisfies both matcher and colour shapes. */
export type LensActivity = ActivitySummary;

// ── Colour-by legend ────────────────────────────────────────────────────────────────────

/** One entry in the on-canvas Legend's Colour-by key — a text label paired with its band colour. */
export interface LegendBand {
  label: string;
  colour: string;
}

/** The Colour-by legend for a mode: the ordered bands plus how many WBS groups were capped ("+N more"). */
export interface ColourLegend {
  bands: LegendBand[];
  moreCount: number;
}

/** The activity shape the WBS legend reads — colourable + its display name/code (for the group label). */
export interface LegendActivity extends ColourableActivity {
  name: string;
  code: string | null;
}

/**
 * Build the Colour-by legend bands for a mode, so the on-canvas Legend spells out every band in **text**
 * (WCAG 1.4.1 — colour is never the sole carrier). **Criticality** returns no bands (the Legend keeps
 * its existing Critical / Near-critical / On-schedule key). **Total float** returns the four
 * {@link FLOAT_BUCKETS} plus a "Not calculated" neutral band when any activity has a null float. **WBS**
 * returns up to {@link WBS_LEGEND_CAP} groups (labelled by the parent activity's code/name) in the same
 * deterministic order the colours cycle, plus an "Ungrouped" band when any activity has no parent, and
 * a `moreCount` for the groups beyond the cap. Pure — the palette is resolved by the caller.
 */
export function buildColourLegend(
  activities: readonly LegendActivity[],
  mode: ColourMode,
  palette: LensPalette,
): ColourLegend {
  if (mode === 'criticality') return { bands: [], moreCount: 0 };

  if (mode === 'totalFloat') {
    const bands: LegendBand[] = [
      { label: FLOAT_BUCKETS[0]!.label, colour: palette.floatCritical },
      { label: FLOAT_BUCKETS[1]!.label, colour: palette.floatLow },
      { label: FLOAT_BUCKETS[2]!.label, colour: palette.floatMedium },
      { label: FLOAT_BUCKETS[3]!.label, colour: palette.floatHigh },
    ];
    if (activities.some((a) => a.totalFloat === null)) {
      bands.push({ label: 'Not calculated', colour: palette.neutral });
    }
    return { bands, moreCount: 0 };
  }

  // WBS: groups in first-appearance order, labelled by the parent activity, capped with "+N more".
  // The cap never exceeds the palette's distinct-swatch count, so no two shown bands share a colour.
  const cap = legendGroupCap(palette);
  const wbsIndexOf = buildWbsIndex(activities);
  const nameById = new Map(activities.map((a) => [a.id, a.code ?? a.name]));
  const groups = [...wbsIndexOf.entries()].sort((a, b) => a[1] - b[1]);
  const bands: LegendBand[] = [];
  const shown = groups.slice(0, cap);
  for (const [parentId, index] of shown) {
    const cycle = palette.wbsCycle;
    bands.push({
      label: nameById.get(parentId) ?? 'Group',
      colour: cycle[index % cycle.length] ?? palette.neutral,
    });
  }
  if (activities.some((a) => a.parentId === null)) {
    bands.push({ label: 'Ungrouped', colour: palette.neutral });
  }
  return { bands, moreCount: Math.max(0, groups.length - cap) };
}
