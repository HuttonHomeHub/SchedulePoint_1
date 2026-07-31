import type { ActivitySummary } from '@repo/types';

import { wbsBandGroups, type WbsBandGroupInput } from './wbs-groups';

import {
  isWithinBandDepth,
  wbsBandDepths,
  wbsBandHeight,
  type BarDateSource,
} from '@/features/tsld';

/**
 * **One** derivation of "is the WBS band on, what goes in it, and what is left for the scene"
 * (ADR-0063), shared by the live canvas and the image export.
 *
 * It exists because M5 asks for a picture that matches the screen, and the surest way to fail that
 * is to answer the same three questions twice. The band's height decides where the scene starts;
 * the summaries it lifts out decide what the scene paints. Two copies of that agreeing today is not
 * the same as two copies that cannot disagree — and the failure would be a printed programme with
 * its phases drawn twice, or with a band-shaped gap where the diagram should start, neither of
 * which any test of the live canvas would notice.
 *
 * It lives **here** rather than in `features/tsld/render/`, where it was first drafted, for two
 * reasons the epic's own code already spells out elsewhere: `features/tsld` imports no other
 * feature (ADR-0026 D8), and the render tier is pure — it reads no feature flag. The direction that
 * IS allowed is this one, `wbs → tsld`, and only for the band's pure geometry.
 *
 * The flag is therefore a **parameter**, not an import: both callers are components that already
 * read `WBS_IMPROVEMENTS_ENABLED` and fuse it with the `View▾` toggle. `enabled: false`, or the
 * toggle off, returns `height: 0` (so a canvas reserves nothing and `measure()` subtracts nothing)
 * and `sceneActivities` **by identity** — the parity path, unchanged down to the reference.
 */
export interface WbsBandSource {
  /** The band is on: the caller's flag AND the `View▾ ▸ Structure` toggle. */
  active: boolean;
  /**
   * The groups to place, or `null` when the band is off — never an empty array, because the two
   * mean different things: "off" and "on with nothing in it".
   */
  groups: WbsBandGroupInput[] | null;
  /** The band's reserved height in CSS px; `0` when the band is off or has nothing to show. */
  height: number;
  /**
   * What the SCENE paints. A summary leaves the scene when the band is on, because the band is
   * where it now lives — but it never leaves the plan, and never leaves the parallel a11y listbox,
   * which reads the plan's activities rather than this (ADR-0063 §4).
   */
  sceneActivities: readonly ActivitySummary[];
}

export function deriveWbsBandSource(
  activities: readonly ActivitySummary[],
  options: {
    /** `VITE_WBS_IMPROVEMENTS`, read by the caller — this module reads no flag of its own. */
    enabled: boolean;
    /** The `View▾ ▸ Structure ▸ WBS band` toggle. */
    toggleOn: boolean;
    source?: BarDateSource;
  },
): WbsBandSource {
  const active = options.enabled && options.toggleOn;
  if (!active) {
    return { active: false, groups: null, height: 0, sceneActivities: activities };
  }
  const groups = wbsBandGroups(activities, { source: options.source ?? 'early' });
  // A summary leaves the scene ONLY when the band is actually going to draw it. The band caps its
  // stacked depth (ADR-0063 §3), so lifting every summary out unconditionally made a depth-3 one
  // disappear from both surfaces at once — invisible, unselectable on the canvas, and contradicting
  // `wbs-band.ts`'s own docblock, which says such a summary "is still an ordinary bar in the diagram".
  // Keyed on `isWithinBandDepth`, imported from the band, so the two halves of the cap are one rule.
  const bandIds = new Set(
    groups.filter((g) => g.id !== null && isWithinBandDepth(g.depth)).map((g) => g.id),
  );
  return {
    active: true,
    groups,
    height: wbsBandHeight(wbsBandDepths(groups)),
    sceneActivities: activities.filter((a) => a.type !== 'WBS_SUMMARY' || !bandIds.has(a.id)),
  };
}
