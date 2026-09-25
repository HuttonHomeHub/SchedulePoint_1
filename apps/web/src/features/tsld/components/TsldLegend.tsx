/**
 * The visible key for the diagram, mirroring the canvas exactly: each activity class is a
 * fill colour **paired with a node glyph** (a rim of 3 / 2 / 1 px) so criticality is never
 * conveyed by colour alone (WCAG 1.4.1). Swatches read their colours from the same design tokens
 * the painter uses, so the key stays truthful across themes.
 *
 * **The node replaced a dashed bar outline** (logic-legibility M3-T3): a 5 px bar has no room to
 * dash. This file kept describing the retired cue for one epic — a key teaching a shape language
 * the diagram no longer speaks is worse than no key at all, because a planner hunts for a mark
 * that is not there — and that is the half of the M6 accessibility finding nothing could have
 * caught from the painter alone.
 *
 * Shared so the self-contained {@link TsldPanel} chrome and the canvas-first floating Legend panel
 * (ADR-0031) render one definition — the key can't drift from the canvas or itself.
 */
import type { ColourLegend, ColourMode } from '../render/lenses';
import { NEAR_CRITICAL_DOT_R, NODE_RIM_W } from '../render/render-model';

import {
  CANVAS_DATA_DATE_ENABLED,
  CANVAS_DIRECT_MANIPULATION_ENABLED,
  CANVAS_LIVE_FEEDBACK_ENABLED,
  CANVAS_RESOURCE_VIEW_ENABLED,
} from '@/config/env';
import { cn } from '@/lib/utils';

type LegendItem =
  | { label: string; swatch: React.CSSProperties }
  | { label: string; criticality: 'critical' | 'near' | 'none'; fill?: string }
  | { label: string; line: 'solid' | 'dashed'; ink?: string; weight?: 1 | 2 }
  | { label: string; chevron: true }
  | { label: string; lagPlate: true }
  | { label: string; gapLabel: true }
  | { label: string; attachDot: true }
  | { label: string; milestone: true; constrained?: true }
  | { label: string; pin: true }
  | { label: string; today: true }
  | { label: string; dataDate: true }
  | { label: string; conflict: true }
  | { label: string; overlap: true }
  | { label: string; overAllocation: true }
  | { label: string; loe: true }
  | { label: string; summary: true }
  | { label: string; progress: true }
  | { label: string; lag: true }
  | { label: string; window: true }
  | { label: string; slack: true }
  | { label: string; text: true };

/** The Critical / Near-critical / On-schedule key — **fill AND node**, because the canvas draws
 * both and the node is the channel that survives without colour (WCAG 1.4.1). */
const CRITICALITY_SWATCHES: ReadonlyArray<LegendItem> = [
  { label: 'Critical', criticality: 'critical', fill: 'var(--destructive)' },
  { label: 'Near-critical', criticality: 'near', fill: 'var(--warning)' },
  { label: 'On schedule', criticality: 'none', fill: 'var(--canvas-bar)' },
];

/** The criticality **node** cues alone, kept in every non-Criticality Colour-by mode so criticality
 * is still readable when the fill encodes something else (WCAG 1.4.1). Three rungs, because the
 * canvas draws three rim weights (3, 2 and 1 px) — so "on schedule" needs no row here, only the
 * two that are marked above the hairline every other node wears. */
const CRITICALITY_OUTLINES: ReadonlyArray<LegendItem> = [
  { label: 'Critical (node)', criticality: 'critical' },
  { label: 'Near-critical (node)', criticality: 'near' },
];

/** The shape/marker + link cues shared by every mode (independent of the bar fill). */
const SHARED_CUES: ReadonlyArray<LegendItem> = [
  // A set date constraint marks its pinned edge with a small pin, matching the canvas (a
  // shape cue, not colour — WCAG 1.4.1).
  { label: 'Constraint', pin: true },
  // A manual lane drop can leave two bars overlapping in time in one lane — a stacked-squares badge
  // marks each, matching the canvas (a shape cue, not colour — WCAG 1.4.1, TECH_DEBT #24c).
  { label: 'Lane overlap', overlap: true },
  // Non-working (weekend/holiday) columns are washed in the muted tone; today is a dashed
  // vertical in the destructive tone. Both toggleable in the view controls.
  {
    label: 'Non-working',
    swatch: { backgroundColor: 'var(--muted)', border: '1px solid var(--border)' },
  },
  // The data-date status line (canvas status & feedback M1, `VITE_CANVAS_DATA_DATE`) — a SOLID
  // vertical beside the dashed Today one, listed first because it sits left of today on a statused
  // programme. The swatch mirrors the canvas channel exactly: shape (solid vs dashed) and weight
  // (2px vs 1.5px) carry the distinction, never hue alone (WCAG 1.4.1). Flag-off the legend
  // renders byte-identically (the parity gate).
  ...(CANVAS_DATA_DATE_ENABLED ? [{ label: 'Data date', dataDate: true } as const] : []),
  { label: 'Today', today: true },
  // Logic ties, matching the canvas. **The link language** (NetPoint-layout M2, ADR-0154) is drawn
  // only on the refreshed canvas, so its key rides the same flag; flag-off keeps the legacy pair
  // byte for byte. Drivingness is WEIGHT, criticality the rung's ink plus the endpoints' nodes, and
  // the waiting time is a GAP LABEL in working days (NetPoint grammar M3-T3, which retired the
  // waiting dash) — so neither the legacy "Non-driving link — dashed" row nor the M2 "Waiting time"
  // dash row survives here: a key naming a mark the canvas no longer paints is the ADR-0151 M6 defect.
  ...(CANVAS_DIRECT_MANIPULATION_ENABLED
    ? [
        {
          label: 'Driving link — critical',
          line: 'solid',
          ink: 'var(--destructive)',
          weight: 2,
        } as const,
        {
          label: 'Driving link — near-critical',
          line: 'solid',
          ink: 'var(--warning)',
          weight: 2,
        } as const,
        // The violet link family (NetPoint grammar M3, spec §4.2 G5), never the button's blue.
        { label: 'Driving link', line: 'solid', ink: 'var(--canvas-link)', weight: 2 } as const,
        {
          label: 'Non-driving link',
          line: 'solid',
          ink: 'var(--canvas-link-minor)',
          weight: 1,
        } as const,
        { label: 'Gap in working days', gapLabel: true } as const,
        { label: 'Direction', chevron: true } as const,
        { label: 'Lag on a link', lagPlate: true } as const,
        // Where a link joins partway along a bar (NetPoint grammar M3-T5, spec G12).
        { label: 'Link joins partway along', attachDot: true } as const,
      ]
    : [
        // A driving link (heavier solid) sets its successor's start; a non-driving link (thin
        // dashed) carries slack (M3).
        { label: 'Driving link', line: 'solid' } as const,
        { label: 'Non-driving link', line: 'dashed' } as const,
      ]),
  // The M4/M5 visual-refresh shape vocabulary (ADR-0052, behind `VITE_CANVAS_DIRECT_MANIPULATION`):
  // the LOE bracketed span, the WBS-summary bracket/tab glyph, the in-bar progress band, and the
  // dashed lag (waiting-time) run — all shape cues, never colour alone (WCAG 1.4.1). Flag-off the
  // legend renders byte-identically (the parity gate).
  ...(CANVAS_DIRECT_MANIPULATION_ENABLED
    ? [
        // A milestone is a downward triangle (NetPoint grammar M5, spec §4.2 G8), filled in its rung's
        // colour and outlined by weight when critical or near, as the criticality rows above say.
        { label: 'Milestone', milestone: true } as const,
        // A constrained milestone carries a "!" cut into its triangle rather than the task pin,
        // which would sit on its name (`drawMilestoneConstraintMark`, TECH_DEBT #392).
        { label: 'Constrained milestone', milestone: true, constrained: true } as const,
        { label: 'Level of effort', loe: true } as const,
        { label: 'WBS summary', summary: true } as const,
        { label: 'Progress', progress: true } as const,
        { label: 'Lag run (on the bar)', lag: true } as const,
      ]
    : []),
  // Placement-conflict cue (ADR-0033) — an outlined warning triangle on a bar placed outside its
  // feasible window. **Unconditional since the collapse** (one-planning-surface M-F-T5): it was
  // listed only under `SCHEDULING_MODES_ENABLED` because a conflict needed a hand-placed start and
  // only a VISUAL plan could carry one. Every plan is a planning surface now, so every plan can
  // paint this mark — which is precisely why withdrawing the key with the flag would have left the
  // commonest cue in the diagram unexplained.
  { label: 'Visual conflict', conflict: true } as const,
  // The ADR-0054 §4/§5 insight marks (behind `VITE_CANVAS_LIVE_FEEDBACK`). Listed like every other
  // toggleable cue here (Non-working and Today are keyed whether or not their toggle is on), so a
  // planner who turns `Feasible window` on has somewhere to learn what the hatched bracket means.
  //
  // **ONE key, where there were two** (one-planning-surface M-E). The float and drift tails were
  // one fact drawn twice and are now one bracket, so two keys would describe a picture the canvas
  // no longer paints. The previous pair also had to explain why the left-hand tail was *usually
  // absent* — drift is zero everywhere in Early mode by construction — and that whole apology
  // disappears with the shape: a bracket with no drift simply starts at the bar.
  ...(CANVAS_LIVE_FEEDBACK_ENABLED
    ? [
        { label: 'Feasible window — earliest to latest', window: true } as const,
        // The selection-scoped slack chip is the legacy link path's (NetPoint grammar M3-T3): the
        // refreshed path labels every waiting link instead, keyed above as a gap.
        ...(CANVAS_DIRECT_MANIPULATION_ENABLED
          ? []
          : [{ label: 'Link slack (days)', slack: true } as const]),
      ]
    : []),
  // Over-allocation cue (Stage E M2, ADR-0049) — a small rising-bars badge matching the canvas
  // mini-histogram, in the warning hue with a foreground outline (shape, not colour — WCAG 1.4.1). Only
  // meaningful with the resource view, so listed only when the feature is on.
  ...(CANVAS_RESOURCE_VIEW_ENABLED
    ? [{ label: 'Over-allocated', overAllocation: true } as const]
    : []),
];

/** Today's default key (criticality fills + shared cues) — the flag-off / no-lens legend, unchanged. */
const LEGEND: ReadonlyArray<LegendItem> = [...CRITICALITY_SWATCHES, ...SHARED_CUES];

/** The active-lens legend inputs (insight lenses, `docs/specs/canvas-lenses/`): the Colour-by mode +
 * its precomputed bands, and whether the Baseline overlay is on. Absent ⇒ today's default key. */
export interface LensLegendInfo {
  colourMode: ColourMode;
  colour: ColourLegend;
  baselineOverlay: boolean;
  /** Whether the read-only Late-Start overlay (ADR-0033) is also on — when both are on, the ghost
   * comparison is baseline-vs-*late* view, so the ghost key spells that out (edge case; ADR-0033 seam). */
  lateOverlay?: boolean;
}

/** The baseline-overlay ghost key — a thin dashed outline (no fill), matching the canvas ghost bars.
 * When the Late overlay is also on, the live bars follow the late dates, so the key qualifies that the
 * ghost is compared against the current (late) view (ADR-0033), not the early dates. */
const baselineGhostItem = (lateOverlay: boolean): LegendItem => ({
  label: lateOverlay ? 'Baseline (as captured, vs late view)' : 'Baseline (as captured)',
  swatch: { border: '1px dashed var(--muted-foreground)' },
});

/** Build the legend item list for the active lenses (or today's default when no lens is provided). */
function legendItems(lens: LensLegendInfo | undefined): ReadonlyArray<LegendItem> {
  if (!lens) return LEGEND;
  const items: LegendItem[] = [];
  if (lens.colourMode === 'criticality') {
    items.push(...CRITICALITY_SWATCHES);
  } else {
    // The mode's colour bands (text-labelled), then the retained criticality outline shape cues.
    for (const band of lens.colour.bands) {
      items.push({ label: band.label, swatch: { backgroundColor: band.colour } });
    }
    if (lens.colour.moreCount > 0) {
      items.push({ label: `+${lens.colour.moreCount} more`, text: true });
    }
    items.push(...CRITICALITY_OUTLINES);
  }
  items.push(...SHARED_CUES);
  if (lens.baselineOverlay) items.push(baselineGhostItem(lens.lateOverlay ?? false));
  return items;
}

/** The diagram legend as a labelled list — used inline by {@link TsldPanel} (horizontal, wrapping)
 * and inside the canvas-first floating Legend panel (vertical, ADR-0031). Pure presentation; no
 * state. With `lens` (insight lenses, flag-on) it renders the active Colour-by mode's key and the
 * baseline-overlay entry; without it (flag-off / no lens) it is today's default key, byte-for-byte. */
export function TsldLegend({
  orientation = 'horizontal',
  lens,
}: {
  orientation?: 'horizontal' | 'vertical';
  lens?: LensLegendInfo;
} = {}): React.ReactElement {
  const items = legendItems(lens);
  return (
    // `role="list"`/`role="listitem"` are explicit: Tailwind v4's Preflight sets `list-style: none`,
    // which is a documented cause of WebKit/VoiceOver dropping the implicit roles (ADR-0122, the same
    // fix as `TsldPanel`'s band lists).
    // eslint-disable-next-line jsx-a11y/no-redundant-roles -- see above
    <ul
      role="list"
      aria-label="Legend"
      className={cn(
        'text-muted-foreground text-xs',
        orientation === 'vertical'
          ? 'flex flex-col items-start gap-1.5'
          : 'flex flex-wrap items-center gap-x-4 gap-y-1',
      )}
    >
      {items.map((item) => (
        // eslint-disable-next-line jsx-a11y/no-redundant-roles -- see the list above
        <li key={item.label} role="listitem" className="flex items-center gap-1.5">
          {'criticality' in item ? (
            // A thin bar with its end node — the canvas's own pair (NetPoint grammar M2-T4). The
            // node is filled with the diagram ground and ringed at the rung's weight
            // (`NODE_RIM_W`), in the rung's own ink where the fill is keyed by criticality and in
            // the foreground where a Colour-by lens owns the colour. So the key cannot describe a
            // mark the painter does not draw (`TsldLegend.census.test.tsx`, FC-G8).
            <span aria-hidden="true" className="relative inline-flex h-3 w-5 items-center">
              <span
                className="w-full"
                style={{ height: 3, backgroundColor: item.fill ?? 'var(--muted-foreground)' }}
              />
              <span
                data-legend-node=""
                className="absolute"
                style={{
                  right: 0,
                  width: 10,
                  height: 10,
                  boxSizing: 'border-box',
                  borderRadius: '50%',
                  backgroundColor: 'var(--canvas)',
                  border: `${NODE_RIM_W[item.criticality]}px solid ${item.fill ?? 'var(--foreground)'}`,
                }}
              >
                {item.criticality === 'near' ? (
                  // The near-critical node's centre dot, in the rim's ink as the painter draws it
                  // (`NEAR_CRITICAL_DOT_R`): the cue that survives without colour or a weight
                  // comparison, so the key must show it too.
                  <span
                    data-legend-node-dot=""
                    className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
                    style={{
                      width: NEAR_CRITICAL_DOT_R * 2,
                      height: NEAR_CRITICAL_DOT_R * 2,
                      backgroundColor: item.fill ?? 'var(--foreground)',
                    }}
                  />
                ) : null}
              </span>
            </span>
          ) : 'text' in item ? (
            <span aria-hidden="true" className="inline-flex h-3 w-5 justify-center" />
          ) : 'pin' in item ? (
            <span aria-hidden="true" className="inline-flex h-3 w-5 items-center justify-center">
              <span
                style={{
                  width: 0,
                  height: 0,
                  borderLeft: '4px solid transparent',
                  borderRight: '4px solid transparent',
                  borderTop: '5px solid var(--muted-foreground)',
                }}
              />
            </span>
          ) : 'today' in item ? (
            <span aria-hidden="true" className="inline-flex h-3 w-5 justify-center">
              <span
                className="h-full"
                style={{
                  borderLeftWidth: 1.5,
                  borderLeftStyle: 'dashed',
                  borderLeftColor: 'var(--destructive)',
                }}
              />
            </span>
          ) : 'dataDate' in item ? (
            <span aria-hidden="true" className="inline-flex h-3 w-5 justify-center">
              {/* Solid 2px vertical in the foreground hue — the data-date channel (vs Today's
                  dashed destructive), mirroring the canvas rule exactly. */}
              <span
                className="h-full"
                style={{
                  borderLeftWidth: 2,
                  borderLeftStyle: 'solid',
                  borderLeftColor: 'var(--foreground)',
                }}
              />
            </span>
          ) : 'conflict' in item ? (
            <span aria-hidden="true" className="inline-flex h-3 w-5 items-center justify-center">
              <span
                style={{
                  width: 0,
                  height: 0,
                  borderLeft: '4px solid transparent',
                  borderRight: '4px solid transparent',
                  borderBottom: '6px solid var(--warning)',
                  outline: '0.5px solid var(--foreground)',
                }}
              />
            </span>
          ) : 'overlap' in item ? (
            <span aria-hidden="true" className="relative inline-flex h-3 w-5 justify-center">
              {/* Two small offset squares ("stacked bars"), matching the canvas badge. */}
              <span
                className="absolute"
                style={{
                  width: 5,
                  height: 5,
                  top: 4,
                  left: 12,
                  backgroundColor: 'var(--warning)',
                  outline: '0.5px solid var(--foreground)',
                }}
              />
              <span
                className="absolute"
                style={{
                  width: 5,
                  height: 5,
                  top: 2,
                  left: 8,
                  backgroundColor: 'var(--warning)',
                  outline: '0.5px solid var(--foreground)',
                }}
              />
            </span>
          ) : 'overAllocation' in item ? (
            <span
              aria-hidden="true"
              className="relative inline-flex h-3 w-5 items-end justify-center gap-px"
            >
              {/* Three ascending mini-bars ("rising histogram"), matching the canvas over-allocation
                  badge — warning hue, each with a foreground outline (WCAG 1.4.1 / 1.4.11). */}
              {[3, 6, 9].map((barHeight) => (
                <span
                  key={barHeight}
                  style={{
                    width: 2,
                    height: barHeight,
                    backgroundColor: 'var(--warning)',
                    outline: '0.5px solid var(--foreground)',
                  }}
                />
              ))}
            </span>
          ) : 'milestone' in item ? (
            <span aria-hidden="true" className="inline-flex h-3 w-5 items-center justify-center">
              {/* The triangle in the canvas's own proportions: a 14 px base 0.7r above the centre and
                  the apex r below it, in the bar's on-schedule fill. */}
              <svg width="14" height="12" viewBox="0 0 14 12">
                <path
                  data-legend-milestone=""
                  d="M0 0 L14 0 L7 12 Z"
                  style={{ fill: 'var(--canvas-bar)' }}
                />
                {'constrained' in item ? (
                  // The "!" in the ground colour, the painter's stem-and-dot geometry scaled into
                  // this 14 x 12 box (the triangle's top edge sits at y 0 here).
                  <g data-legend-milestone-constraint="" style={{ fill: 'var(--canvas)' }}>
                    <rect x="6" y="1.3" width="2" height="4" />
                    <rect x="6" y="6.3" width="2" height="1.8" />
                  </g>
                ) : null}
              </svg>
            </span>
          ) : 'loe' in item ? (
            <span aria-hidden="true" className="relative inline-flex h-3 w-5 items-center">
              {/* Bracketed span: end caps overhanging a line HALF a task's height (spec §4.13 U1 —
                  a span draws no node, so weight is what tells it from a task), in the bar's own
                  fill, matching the canvas LOE glyph. */}
              <span
                className="absolute inset-x-0 top-1/2 -translate-y-1/2"
                style={{ height: 2, backgroundColor: 'var(--canvas-bar)' }}
              />
              <span
                className="absolute inset-y-0 left-0"
                style={{ width: 2, backgroundColor: 'var(--canvas-bar)' }}
              />
              <span
                className="absolute inset-y-0 right-0"
                style={{ width: 2, backgroundColor: 'var(--canvas-bar)' }}
              />
            </span>
          ) : 'summary' in item ? (
            <span aria-hidden="true" className="relative inline-flex h-3 w-5">
              {/* Summary bracket: a line half a task's height (U1) with downward end tabs hanging
                  from it, matching the canvas WBS-summary glyph. */}
              <span
                className="absolute inset-x-0 top-0.5"
                style={{ height: 2, backgroundColor: 'var(--canvas-bar)' }}
              />
              <span
                className="absolute left-0"
                style={{ top: 2, width: 2, height: 8, backgroundColor: 'var(--canvas-bar)' }}
              />
              <span
                className="absolute right-0"
                style={{ top: 2, width: 2, height: 8, backgroundColor: 'var(--canvas-bar)' }}
              />
            </span>
          ) : 'progress' in item ? (
            <span
              aria-hidden="true"
              className="relative inline-block h-3 w-5 rounded-sm"
              style={{ backgroundColor: 'var(--canvas-bar)' }}
            >
              {/* The in-bar progress band + front divider along the bar bottom, in the fill's
                  paired ink — matching the canvas progress depiction. */}
              <span
                className="absolute"
                style={{
                  left: 1,
                  bottom: 1,
                  width: 9,
                  height: 3,
                  backgroundColor: 'var(--primary-foreground)',
                }}
              />
              <span
                className="absolute"
                style={{
                  left: 11,
                  bottom: 1,
                  width: 1,
                  height: 3,
                  backgroundColor: 'var(--primary-foreground)',
                }}
              />
            </span>
          ) : 'lag' in item ? (
            <span aria-hidden="true" className="relative inline-flex h-3 w-5 items-center">
              {/* A bar edge with the dotted waiting-time run leading from it, matching the canvas
                  lag-run depiction (a tighter dash than the non-driving link's). */}
              <span
                className="absolute top-1/2 left-0 -translate-y-1/2"
                style={{ width: 6, height: 8, backgroundColor: 'var(--canvas-bar)' }}
              />
              <span
                className="absolute top-1/2 -translate-y-1/2"
                style={{
                  left: 7,
                  width: 13,
                  borderTopWidth: 1.5,
                  borderTopStyle: 'dotted',
                  borderTopColor: 'var(--muted-foreground)',
                }}
              />
            </span>
          ) : 'window' in item ? (
            <span aria-hidden="true" className="relative inline-flex h-3 w-5 items-center">
              {/* The feasible window: a hatched band spanning earliest→latest with a vertical cap
                  at each end, and the bar stub sitting over its middle — which is exactly how the
                  canvas paints it (the window is drawn BELOW the bars, so the bar occludes the
                  span and it reads as two flanking tails). Hatched, not filled: a filled extension
                  would read as duration, and the hatch is the non-colour cue (WCAG 1.4.1). */}
              <span
                className="absolute top-1/2 left-0 -translate-y-1/2"
                style={{
                  width: 20,
                  height: 5,
                  borderTop: '1px solid var(--muted-foreground)',
                  borderBottom: '1px solid var(--muted-foreground)',
                  backgroundImage:
                    'repeating-linear-gradient(45deg, transparent 0 2px, var(--muted-foreground) 2px 3px)',
                }}
              />
              <span
                className="absolute top-1/2 left-0 -translate-y-1/2"
                style={{ width: 1, height: 5, backgroundColor: 'var(--muted-foreground)' }}
              />
              <span
                className="absolute top-1/2 right-0 -translate-y-1/2"
                style={{ width: 1, height: 5, backgroundColor: 'var(--muted-foreground)' }}
              />
              <span
                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
                style={{ width: 8, height: 8, backgroundColor: 'var(--canvas-bar)' }}
              />
            </span>
          ) : 'slack' in item ? (
            <span aria-hidden="true" className="inline-flex h-3 w-5 items-center justify-center">
              {/* The outlined chip the canvas prints the gap in, on the selected activity's links.
                  `--primary` + `--border`, because that is what the painter draws it with
                  (`paint.ts` layer 3.5: `palette.bar` fill + `palette.barStroke` stroke). This
                  swatch was `--card` (`docs/TECH_DEBT.md` #162) — a token ADR-0097 made a RESET,
                  deliberately absent from the canvas scope's rebind closure, so even correctly
                  scoped the legend showed a different colour from the thing it describes. */}
              <span
                className="rounded-[2px]"
                style={{
                  width: 14,
                  height: 10,
                  backgroundColor: 'var(--primary)',
                  border: '1px solid var(--border)',
                }}
              />
            </span>
          ) : 'line' in item ? (
            <span aria-hidden="true" className="inline-flex h-3 w-5 items-center">
              <span
                className="w-full"
                style={{
                  borderTopWidth: item.weight ?? (item.line === 'solid' ? 2 : 1.5),
                  borderTopStyle: item.line,
                  // The painter reads the unprefixed token on the canvas element; the key reads the
                  // same name inline, never through a Tailwind utility (ADR-0100 M4's trap).
                  borderTopColor: item.ink ?? 'var(--muted-foreground)',
                }}
              />
            </span>
          ) : 'chevron' in item ? (
            <span aria-hidden="true" className="relative inline-flex h-3 w-5 items-center">
              {/* A link with one filled chevron along it, pointing the way the link runs, in the
                  darker mark shade the painter fills a violet link's marks with (M3). */}
              <span
                className="w-full"
                style={{
                  borderTopWidth: 1,
                  borderTopStyle: 'solid',
                  borderTopColor: 'var(--canvas-link-minor)',
                }}
              />
              <svg
                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
                width="6"
                height="6"
                viewBox="0 0 6 6"
              >
                <path
                  data-legend-mark=""
                  d="M1 0 L5 3 L1 6 Z"
                  style={{ fill: 'var(--canvas-link-mark)' }}
                />
              </svg>
            </span>
          ) : 'attachDot' in item ? (
            <span aria-hidden="true" className="relative inline-flex h-3 w-5 items-center">
              {/* A bar with the dot on it, in the mark shade, 4 px across as the painter draws it. */}
              <span
                className="w-full"
                style={{ height: 5, backgroundColor: 'var(--canvas-bar)' }}
              />
              <span
                data-legend-attach=""
                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
                style={{ width: 4, height: 4, backgroundColor: 'var(--canvas-link-mark)' }}
              />
            </span>
          ) : 'gapLabel' in item ? (
            <span
              aria-hidden="true"
              className="inline-flex h-3 items-center px-0.5 text-xs leading-none"
              style={{ backgroundColor: 'var(--canvas)', color: 'var(--canvas-link-mark)' }}
            >
              {/* Borderless on the ground, in the mark ink, exactly as the painter prints it. */}
              3d
            </span>
          ) : 'lagPlate' in item ? (
            <span
              aria-hidden="true"
              className="inline-flex h-3 items-center rounded-xs px-0.5 text-xs leading-none"
              style={{
                // The plate's border is its link's ink since M3-T3, so it reads as a box (≥ 3:1).
                border: '1px solid var(--canvas-link-minor)',
                backgroundColor: 'var(--canvas)',
                color: 'var(--foreground)',
              }}
            >
              +2d
            </span>
          ) : (
            <span
              aria-hidden="true"
              className="inline-block h-3 w-5 rounded-sm"
              style={item.swatch}
            />
          )}
          {item.label}
        </li>
      ))}
    </ul>
  );
}
