import { packLanes, type LaneChange, type PackItem } from '@repo/layout';
import type { ActivitySummary, DependencySummary } from '@repo/types';

import { drawnDaySpan } from './drawn-span';

/**
 * Auto-arrange's pure half (TSLD M4 4.3): given a plan, work out the minimal set of lane moves that
 * packs its drawn bars into the fewest non-overlapping rows.
 *
 * Pure — no React, no DOM, no network — a sibling of `bulk-move` and `chain-order`. It was lifted
 * out of `TsldPanel` so the rule below could be tested at all: the band's toggle is component state
 * reached through the `View ▾` menu, so asserting "the packer packs what the scene paints" through
 * the panel would mean driving a menu to exercise arithmetic.
 */

export interface LaneArrangementInput {
  /** Every activity in the plan — the band's summaries included. */
  readonly activities: readonly ActivitySummary[];
  /**
   * What the SCENE paints, i.e. `deriveWbsBandSource(...).sceneActivities`. Band off, this is the
   * `activities` array **by identity** (that module's own docblock), which is what makes the
   * band-off result identical to the pre-#364 single pack rather than merely equivalent.
   */
  readonly sceneActivities: readonly ActivitySummary[];
  readonly dependencies: readonly DependencySummary[];
  /** The plan's data date; `null` when it has never been scheduled, in which case nothing moves. */
  readonly dataDate: string | null;
}

/**
 * Pack the scene's bars into lanes `0..N-1`, then pack the summaries the WBS band draws and append
 * them at `N`.
 *
 * ## Why the split (`docs/TECH_DEBT.md` #364)
 *
 * The packer used to pack **every** activity, and `deriveWbsBandSource` then removed from the scene
 * exactly the summaries the band draws — so band on, the rows reserved for those summaries painted
 * nothing. A lane's index fixes its y, so they are not spare capacity: measured on the 144-bar
 * Unit 300 programme, **13 of 27 lanes held nothing but band-drawn summaries**, scattered through
 * the diagram, and the highest drawn bar sat in lane 26. At the then `LANE_HEIGHT` of 28 that is
 * 420 px of blank rows inside the picture (`docs/specs/diagram-legibility/cheap-levers.md`,
 * Finding 1). **Those figures are in question** (`docs/TECH_DEBT.md` #365): the harness put every
 * summary at day 0, and re-taken with the rollup the same fixture reads 4 summary-only lanes of 21.
 * The split is right either way; only the size of the prize moved.
 *
 * ## Why appended rather than left alone
 *
 * Dropping the band's summaries from the pack entirely is one lane cheaper still (12 against 30 on
 * that fixture) and leaves them at whatever stale lane they had — so a planner who arranges with the
 * band **on** and then turns it **off** meets a layout with same-lane time overlap, the condition
 * `render/lane-overlap.ts` exists to detect (`docs/TECH_DEBT.md` #24c). Appending them above the
 * scene's range costs nothing where the planner is looking, because `worldExtent`
 * (`render/geometry.ts`) reports the **max lane among the activities it is given** and
 * `TsldPanel` gives it `wbsBand.sceneActivities` — so band on, the appended rows are invisible and
 * the drawn extent is the same 12 lanes either way. The trade was measured before it was chosen.
 *
 * ## Which summaries
 *
 * The band **depth-caps** what it draws (`isWithinBandDepth`, `WBS_BAND_MAX_DEPTH = 2`), so a
 * depth-3 summary stays an ordinary bar in the diagram. That is why the split is "everything the
 * scene does not paint" rather than "summaries": lifting them all out unconditionally has already
 * shipped once as a defect, recorded in `wbs-band-source.ts`.
 */
/**
 * The dock offer's sentence (NetPoint-layout M5, spec §4.8): what is KNOWN about the diagram, never
 * a result the offer has not computed. The offer used to compare the rows against `packLanes` and
 * promise what a press would buy; since `Arrange` now runs a search that takes seconds in a worker,
 * the offer states the one fact every render already has, the activities that overlap in their row.
 */
export function arrangeOfferMessage(overlapping: number): string {
  return overlapping === 1
    ? '1 activity overlaps another in its lane.'
    : `${String(overlapping)} activities overlap others in their lanes.`;
}

export function computeLaneArrangement(input: LaneArrangementInput): LaneChange[] {
  const { activities, sceneActivities, dependencies, dataDate } = input;
  if (dataDate === null) return [];

  // Pack the span the canvas DRAWS (`drawnDaySpan`), never the early span: a bar hand-placed
  // earlier than its logic allows is drawn at the placement, so packing its early dates put it in
  // the same row as the predecessor it is drawn on top of (reported 2026-09-23). `'visual'` rather
  // than the view's source because `lane_index` is the layout of the plan as placed; the Late
  // overlay is a read-only lens over it and must not decide where anything lives.
  //
  // Undated activities have no x-span, so there is nothing to pack them against — they keep their
  // lane, which is also what stops a never-scheduled plan being reshuffled by a button press.
  const packItem = (a: ActivitySummary): PackItem[] => {
    const span = drawnDaySpan(a, 'visual', dataDate);
    return span === null
      ? []
      : [{ id: a.id, startDay: span.startDay, endDay: span.endDay, laneIndex: a.laneIndex }];
  };

  const sceneIds = new Set(sceneActivities.map((a) => a.id));
  const sceneItems = activities.flatMap((a) => (sceneIds.has(a.id) ? packItem(a) : []));
  const bandItems = activities.flatMap((a) => (sceneIds.has(a.id) ? [] : packItem(a)));

  // The plan's logic goes in as a hint so the packer, choosing among lanes that are already free,
  // puts an activity near its predecessors rather than in whichever lane happened to free up first.
  // It cannot change the lane COUNT (see `packLanes`) — only how far a link has to travel, which on
  // an imported programme is the difference between a readable diagram and one whose lines leave the
  // top of the viewport and come back lower down.
  const predecessorsOf = new Map<string, string[]>();
  for (const dependency of dependencies) {
    const existing = predecessorsOf.get(dependency.successor.id);
    if (existing) existing.push(dependency.predecessor.id);
    else predecessorsOf.set(dependency.successor.id, [dependency.predecessor.id]);
  }

  const sceneChanges = packLanes(sceneItems, predecessorsOf);
  // Band off there is nothing to append, and this is the pre-#364 call over the pre-#364 items —
  // structurally the same answer, not a second implementation that happens to agree.
  if (bandItems.length === 0) return sceneChanges;

  // `packLanes` returns only the rows that MOVE, so an item absent from its result is one the pack
  // left where it was — which is its resulting lane just as much as a returned one.
  const sceneLaneById = new Map(sceneChanges.map((c) => [c.id, c.laneIndex]));
  let base = 0;
  for (const item of sceneItems) {
    const lane = sceneLaneById.get(item.id) ?? item.laneIndex;
    if (lane + 1 > base) base = lane + 1;
  }

  // A sentinel current-lane no pack can produce, so every band item comes back as a "change" and we
  // read the full assignment out of the same packer rather than exporting a second entry point for
  // it. `laneIndex` is read by `packLanes` for exactly one thing — deciding whether to emit a row —
  // so substituting it cannot change the packing.
  const UNPLACED_LANE = -1;
  const bandLaneById = new Map(bandItems.map((item) => [item.id, item.laneIndex]));
  // A summary is never a dependency endpoint (ADR-0038), so the hint is inert here; it is passed
  // anyway rather than calling the packer two different ways.
  const bandChanges = packLanes(
    bandItems.map((item) => ({ ...item, laneIndex: UNPLACED_LANE })),
    predecessorsOf,
  )
    .map((c) => ({ id: c.id, laneIndex: base + c.laneIndex }))
    .filter((c) => bandLaneById.get(c.id) !== c.laneIndex);

  return [...sceneChanges, ...bandChanges].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
