/**
 * The visible key for the diagram, mirroring the canvas exactly: each activity class is a
 * fill colour **paired with an outline style** (solid / dashed / none) so criticality is
 * never conveyed by colour alone (WCAG 1.4.1). Swatches read their colours from the same
 * design tokens the painter uses, so the key stays truthful across themes.
 *
 * Shared so the self-contained {@link TsldPanel} chrome and the canvas-first floating Legend panel
 * (ADR-0031) render one definition — the key can't drift from the canvas or itself.
 */
import type { ColourLegend, ColourMode } from '../render/lenses';

import { SCHEDULING_MODES_ENABLED } from '@/config/env';
import { cn } from '@/lib/utils';

type LegendItem =
  | { label: string; swatch: React.CSSProperties }
  | { label: string; line: 'solid' | 'dashed' }
  | { label: string; pin: true }
  | { label: string; today: true }
  | { label: string; conflict: true }
  | { label: string; overlap: true }
  | { label: string; text: true };

/** The Critical / Near-critical / On-schedule colour key (the default, criticality-mode fills). */
const CRITICALITY_SWATCHES: ReadonlyArray<LegendItem> = [
  {
    label: 'Critical',
    swatch: {
      backgroundColor: 'var(--color-destructive)',
      border: '1.5px solid var(--color-foreground)',
    },
  },
  {
    label: 'Near-critical',
    swatch: {
      backgroundColor: 'var(--color-warning)',
      border: '1.5px dashed var(--color-foreground)',
    },
  },
  { label: 'On schedule', swatch: { backgroundColor: 'var(--color-primary)' } },
];

/** The criticality **outline** shape cues, kept in every non-Criticality Colour-by mode so criticality
 * is still readable when the fill encodes something else (WCAG 1.4.1). */
const CRITICALITY_OUTLINES: ReadonlyArray<LegendItem> = [
  { label: 'Critical (outline)', swatch: { border: '1.5px solid var(--color-foreground)' } },
  { label: 'Near-critical (outline)', swatch: { border: '1.5px dashed var(--color-foreground)' } },
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
    swatch: { backgroundColor: 'var(--color-muted)', border: '1px solid var(--color-border)' },
  },
  { label: 'Today', today: true },
  // Logic ties, matching the canvas: a driving link (heavier solid) sets its
  // successor's start; a non-driving link (thin dashed) carries slack (M3).
  { label: 'Driving link', line: 'solid' },
  { label: 'Non-driving link', line: 'dashed' },
  // Visual-Planning conflict cue (ADR-0033) — an outlined warning triangle on a bar placed before its
  // earliest feasible start. Only meaningful under scheduling modes, so listed only when enabled.
  ...(SCHEDULING_MODES_ENABLED ? [{ label: 'Visual conflict', conflict: true } as const] : []),
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
  swatch: { border: '1px dashed var(--color-muted-foreground)' },
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
    <ul
      aria-label="Legend"
      className={cn(
        'text-muted-foreground text-xs',
        orientation === 'vertical'
          ? 'flex flex-col items-start gap-1.5'
          : 'flex flex-wrap items-center gap-x-4 gap-y-1',
      )}
    >
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5">
          {'text' in item ? (
            <span aria-hidden="true" className="inline-flex h-3 w-5 justify-center" />
          ) : 'pin' in item ? (
            <span aria-hidden="true" className="inline-flex h-3 w-5 items-center justify-center">
              <span
                style={{
                  width: 0,
                  height: 0,
                  borderLeft: '4px solid transparent',
                  borderRight: '4px solid transparent',
                  borderTop: '5px solid var(--color-muted-foreground)',
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
                  borderLeftColor: 'var(--color-destructive)',
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
                  borderBottom: '6px solid var(--color-warning)',
                  outline: '0.5px solid var(--color-foreground)',
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
                  backgroundColor: 'var(--color-warning)',
                  outline: '0.5px solid var(--color-foreground)',
                }}
              />
              <span
                className="absolute"
                style={{
                  width: 5,
                  height: 5,
                  top: 2,
                  left: 8,
                  backgroundColor: 'var(--color-warning)',
                  outline: '0.5px solid var(--color-foreground)',
                }}
              />
            </span>
          ) : 'line' in item ? (
            <span aria-hidden="true" className="inline-flex h-3 w-5 items-center">
              <span
                className="w-full"
                style={{
                  borderTopWidth: item.line === 'solid' ? 2 : 1.5,
                  borderTopStyle: item.line,
                  borderTopColor: 'var(--color-muted-foreground)',
                }}
              />
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
