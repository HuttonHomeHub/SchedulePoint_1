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
 * the diagram, and the highest drawn bar sat in lane 26. At `LANE_HEIGHT` 28 that is 420 px of
 * blank rows inside the picture (`docs/specs/diagram-legibility/cheap-levers.md`, Finding 1).
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
 * What one press of `Arrange` would do to this plan: the moves, and the rows either side.
 *
 * **One derivation, because two numbers about one press must not disagree.** The dock's offer
 * states the rows a press would buy and the confirmation dialog states the moves it would make;
 * computing those separately is the shape ADR-0065 and ADR-0121 both record drifting — each looks
 * right alone, and only a planner who reads the strip and then opens the dialog would ever see one
 * is a version behind.
 *
 * **Rows are `worldExtent`'s rule, not the packer's lane count** (`render/geometry.ts`): the max
 * lane among the activities the canvas is GIVEN, plus one. Band on that is `sceneActivities`, so
 * the summaries the band draws are excluded from both figures — which is what makes the strip's
 * sentence true of the picture the reader is looking at rather than of the plan's row data.
 *
 * An activity the packer left alone keeps its lane, and an undated one is never packed at all
 * (see {@link computeLaneArrangement}); both still occupy a row, so both count.
 */
export interface LaneArrangementSummary {
  /** Exactly what {@link computeLaneArrangement} returns — the minimal set of moves. */
  readonly changes: LaneChange[];
  /** Rows the canvas draws today. */
  readonly currentRows: number;
  /** Rows it would draw after the press. */
  readonly arrangedRows: number;
}

export function summariseLaneArrangement(input: LaneArrangementInput): LaneArrangementSummary {
  const changes = computeLaneArrangement(input);
  const moved = new Map(changes.map((c) => [c.id, c.laneIndex]));
  let currentRows = 0;
  let arrangedRows = 0;
  for (const activity of input.sceneActivities) {
    const after = moved.get(activity.id) ?? activity.laneIndex;
    if (activity.laneIndex + 1 > currentRows) currentRows = activity.laneIndex + 1;
    if (after + 1 > arrangedRows) arrangedRows = after + 1;
  }
  return { changes, currentRows, arrangedRows };
}

/**
 * The dock offer's sentence, from the summary — a pure function so the copy can be asserted without
 * mounting a canvas.
 *
 * **It states all three row outcomes, and the third is the reason it is a function rather than a
 * template.** `packLanes` refuses same-lane time overlap, so a plan whose current layout overlaps
 * needs MORE rows to be drawn correctly: measured on a 500-bar synthetic scene, 32 rows → 41. An
 * offer that only ever promised a saving would be false on exactly the plans that most need the
 * press, which is the false-statement defect `docs/TECH_DEBT.md` #114 records shipping.
 *
 * **The equal-rows branch names the mechanism instead of the row count, because there the row
 * count is the one thing that does NOT change.** "…and draw this plan in the same 9 rows" is
 * accurate and reads as "nothing visible happens, so why press it" — which is false: the press
 * still repacks every lane by time (no two bars overlapping in one row) and prefers a lane already
 * holding a predecessor, which is the whole of what Part C measures. What it deliberately does not
 * say is that any particular link gets shorter: the predecessor hint chooses among lanes that are
 * ALREADY free, so it is a preference and not a guarantee, and promising the outcome rather than
 * the mechanism is how the first version of this sentence would have overclaimed.
 */
export function arrangeOfferMessage(summary: LaneArrangementSummary): string {
  const moved = summary.changes.length;
  const subject = `Arrange would move ${String(moved)} ${moved === 1 ? 'activity' : 'activities'}`;
  // A one-row plan is reachable — pack two sequential bars out of lanes 0 and 5 and the whole
  // diagram is one row — so the count is pluralised rather than suffixed.
  const rows = (n: number): string => `${String(n)} ${n === 1 ? 'row' : 'rows'}`;
  if (summary.arrangedRows === summary.currentRows) {
    return `${subject} to pack them by time and logic, still drawing this plan in ${rows(
      summary.currentRows,
    )}.`;
  }
  return (
    `${subject} and draw this plan in ${rows(summary.arrangedRows)} ` +
    `instead of ${String(summary.currentRows)}.`
  );
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
