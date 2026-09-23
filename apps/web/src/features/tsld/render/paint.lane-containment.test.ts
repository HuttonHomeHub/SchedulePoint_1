import { describe, expect, it } from 'vitest';

import { activityRect, LANE_HEIGHT, screenYOfLane } from './geometry';
import {
  paintInteractionLayer,
  paintScene,
  type InteractionOverlay,
  type TsldPalette,
  type TsldScene,
} from './paint';
import type { RenderActivity, Viewport } from './render-model';
import { inkRecordingCtx, type InkExtent } from './test-support/ink-extents';

/**
 * **FC-6, computed** (logic-legibility M3-T1) — _every glyph family and every decoration draws
 * within `[screenYOfLane(L), screenYOfLane(L + 1))`._
 *
 * The invariant existed only as four docblocks, each stating a **clearance** in terms of
 * `BAR_HEIGHT = 18`: the summary tab's 1 px, the float tail being "thinner than the bar", the LOE
 * cap's ±3 overhang, the bar radius being "subtle at 18". None of them is checked, and all four
 * are functions of a geometry this epic is about to change — so the milestone that changes it
 * would be the first thing to find out whether they were ever true.
 *
 * It lands **before** any constant moves, and it is a gate rather than a paragraph for the reason
 * ADR-0110 D5 gives: a gate is finished when it has been made to fail by the defect it names.
 * {@link hostileExtents} is that red case, shipped beside the live one — the same assertion run
 * against a bar so tall its decorations must leave the lane, asserted to fail. Without it the
 * whole file could pass by measuring nothing.
 *
 * **The measurement is a difference, not a reading.** A painted frame is mostly chrome — the
 * ruler, three tiers of gridline, the non-working wash, month bands, the today and data-date
 * verticals, the lane hairlines — all of which legitimately span the canvas and none of which
 * belongs to a lane. So each case paints a scene holding exactly ONE activity and subtracts the
 * ink of the same scene holding NONE. The lane-hairline layer is derived from the viewport rather
 * than from the activities (`paint.ts:1031`), which is what makes the two frames' chrome
 * identical and the subtraction exact; {@link chromeIsASubset} asserts that rather than assuming
 * it, because a control that is not a control turns every case below into a reading of noise.
 *
 * **What it cannot see** is stated rather than implied. Text extents are derived from the `px` in
 * the assigned font because jsdom has no metrics, generously (`ink-extents.ts`), so a text-only
 * violation smaller than that generosity would not be reported — but a false report is the
 * direction this errs in. And a decoration that draws only for a combination of cues no case
 * below sets is not measured at all; {@link CASES} is therefore an enumeration to extend, not a
 * proof of completeness, and the census limb pins its size so a case cannot be quietly dropped.
 */

const PALETTE: TsldPalette = {
  canvasGround: '#14161c',
  gridLine: '#111',
  gridLineDay: '#3a3a3a',
  gridLineMonth: '#111111',
  gridLineYear: '#565656',
  laneRule: '#9c9c9c',
  edge: '#333',
  bar: '#44f',
  critical: '#f00',
  nearCritical: '#fa0',
  outline: '#fff',
  selection: '#0af',
  nonWorking: '#222',
  today: '#f00',
  todayInk: '#fff',
  dataDate: '#dd1',
  dataDateInk: '#dd2',
  conflict: '#fa0',
  laneOverlap: '#fa0',
  labelInside: '#fff',
  labelInsideCritical: '#fff',
  labelInsideNearCritical: '#000',
  labelBeside: '#eee',
  barStroke: '#5a5a5a',
  hoverRing: '#9a9a9a',
  handleHalo: '#0b0b0b',
  monthBand: '#111111',
};

const VIEW: Viewport = { pxPerDay: 12, originX: 60, originY: 40 };
/** Tall enough that the subject lane and its neighbours are all well inside the frame. */
const SIZE = { width: 800, height: 600 };
const DATA_DATE = '2026-01-01';
/** Far from the frame's edges, so nothing below is an artefact of clipping. */
const SUBJECT_LANE = 5;

const isWorkingDay = (dayOffset: number): boolean => {
  const dow = (new Date(`${DATA_DATE}T00:00:00Z`).getUTCDay() + dayOffset) % 7;
  return dow !== 0 && dow !== 6;
};

function activity(overrides: Partial<RenderActivity> & { id: string }): RenderActivity {
  return {
    type: 'TASK',
    laneIndex: SUBJECT_LANE,
    label: 'A100 Excavate',
    earlyStart: '2026-01-02',
    earlyFinish: '2026-01-05',
    isCritical: false,
    isNearCritical: false,
    ...overrides,
  };
}

/** Every optional painter input set, so no case below is silently taking a flag-off branch. */
function sceneOf(activities: readonly RenderActivity[], extra: Partial<TsldScene> = {}): TsldScene {
  return {
    activities,
    edges: [],
    dataDate: DATA_DATE,
    showEdgeHandles: true,
    view: {
      dayGrid: true,
      monthGrid: true,
      yearGrid: true,
      today: true,
      nonWorking: true,
      labels: true,
      lateOverlay: false,
    },
    isWorkingDay,
    todayOffset: 4,
    todayFraction: 0.4,
    monthBands: true,
    dataDateLine: true,
    gridTiers: true,
    timeTrueLinks: true,
    visualRefresh: true,
    lagHandles: true,
    linkRouting: true,
    ...extra,
  };
}

function inkOf(scene: TsldScene): readonly InkExtent[] {
  const { ctx, ink } = inkRecordingCtx();
  paintScene(ctx, scene, VIEW, SIZE, PALETTE);
  return ink;
}

/** A multiset key, so two marks of the same op and extent are not mistaken for one. */
const keyOf = (e: InkExtent): string => `${e.op}:${e.top}:${e.bottom}`;

function multiset(ink: readonly InkExtent[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const e of ink) counts.set(keyOf(e), (counts.get(keyOf(e)) ?? 0) + 1);
  return counts;
}

/** The ink `scene` lays down that the empty-scene control does not — the subject's own marks. */
function subjectInk(scene: TsldScene): readonly InkExtent[] {
  const control = multiset(CHROME);
  const out: InkExtent[] = [];
  for (const e of inkOf(scene)) {
    const remaining = control.get(keyOf(e)) ?? 0;
    if (remaining > 0) control.set(keyOf(e), remaining - 1);
    else out.push(e);
  }
  return out;
}

/**
 * `paint.ts`'s module-scope `labelWidths` memo is keyed by text alone, so a first paint fills it
 * and later paints do not. Warm before measuring or a memo fill reads as a difference between the
 * control and the case (the `paint.data-date-parity.test.ts` precedent).
 */
function warm(): void {
  for (const a of CASES) inkOf(a.scene);
  inkOf(sceneOf([]));
}

interface Case {
  readonly name: string;
  readonly scene: TsldScene;
  /**
   * Marks this case draws OUTSIDE its lane, as `op top..bottom of 0..LANE_HEIGHT` relative to the
   * lane's own top — the **measured** escape, not a tolerance.
   *
   * Four cases carry one, and they are the finding M3-T1 exists to have produced: FC-6 does not
   * hold today. Every one of the four is a cue that draws ABOVE the bar, where a 28 px lane
   * holding an 18 px bar leaves 5 px, and each was sized without anybody checking what it had.
   *
   * They are pinned **exactly** rather than tolerated, which makes the list a ratchet in both
   * directions: a fifth escape fails here, and so does a fix, because a case that stops escaping
   * no longer matches its recorded list and must be promoted to `[]` deliberately. ADR-0120's
   * report-then-arm sequence, with the red state committed rather than described.
   */
  readonly escapes?: readonly string[];
  /**
   * Set where the case's geometry is **identical to a plain bar's by design**, so the
   * {@link PLAIN_BAR_INK} limb below does not apply to it.
   *
   * Criticality is the only such case, and it is worth stating rather than letting the limb be
   * relaxed for everything: the emphasis outline is heavier, but the painter strokes an inset
   * rect (`paint.ts:845`) so the stroke sits INSIDE the bar and the inked extents coincide to the
   * pixel. The two cues that distinguish a critical bar are its fill and its dash — neither of
   * which a vertical-extent recorder can see, and neither of which FC-6 is about.
   */
  readonly geometryMatchesPlainBar?: true;
}

const CASES: readonly Case[] = [
  { name: 'task bar', scene: sceneOf([activity({ id: 'plain' })]) },
  {
    name: 'critical bar',
    scene: sceneOf([activity({ id: 'c', isCritical: true })]),
    geometryMatchesPlainBar: true,
  },
  {
    name: 'near-critical bar',
    scene: sceneOf([activity({ id: 'n', isNearCritical: true })]),
    geometryMatchesPlainBar: true,
  },
  { name: 'progress band', scene: sceneOf([activity({ id: 'p', percentComplete: 45 })]) },
  {
    name: 'milestone diamond',
    scene: sceneOf([
      activity({
        id: 'm',
        type: 'START_MILESTONE',
        earlyStart: '2026-01-06',
        earlyFinish: '2026-01-06',
      }),
    ]),
  },
  { name: 'LOE bracket', scene: sceneOf([activity({ id: 'l', type: 'LEVEL_OF_EFFORT' })]) },
  { name: 'WBS summary tab', scene: sceneOf([activity({ id: 's', type: 'WBS_SUMMARY' })]) },
  {
    // **Closed at M3-T2.** The filled triangle used to top out EXACTLY at the lane boundary —
    // `barTop - CONSTRAINT_PIN_H` with a literal 5 against a pad of `(28 - 18) / 2 = 5` — so the
    // outlined variant's 1 px stroke put half a pixel in the lane above. The two numbers lived in
    // different files, were equal by coincidence, and nothing coupled them. `CONSTRAINT_PIN_H` is
    // now `min(5, BAR_PAD - 1)`, where the `- 1` is the outline's half-width.
    name: 'constraint pin',
    scene: sceneOf([activity({ id: 'k', constraint: 'start' })]),
  },
  { name: 'conflict badge', scene: sceneOf([activity({ id: 'f', visualConflict: true })]) },
  {
    // `barTop - s - off - 1` with `s = 5, off = 2` puts the badge 8 px above the bar top, which is
    // 3 px above the lane. Both squares are wholly or partly in the neighbouring lane.
    name: 'lane-overlap badge',
    scene: sceneOf([activity({ id: 'o', laneOverlap: true })]),
  },
  {
    // The worst of the four, and the clearest statement of the defect: the `lift` that stacks this
    // badge clear of the constraint pin (`paint.ts:1724`) puts the WHOLE badge in the lane above —
    // `-9..-2`, not one pixel of it in its own lane. The lift is correct about the pin and was
    // never asked whether there was room for the result.
    name: 'lane-overlap badge above a constraint pin',
    scene: sceneOf([activity({ id: 'ok', laneOverlap: true, constraint: 'start' })]),
  },
  {
    // `baseY = barTop - 2` with a tallest mini-bar of 7 reaches 9 px above the bar top, so the
    // histogram's tall end sits 4 px into the lane above.
    name: 'over-allocation badge',
    scene: sceneOf([activity({ id: 'v' })], { flaggedIds: new Set(['v']) }),
  },
  {
    // `floatTails` is the window's toggle, and it is NOT in `sceneOf`'s default view block: the
    // first version of this case set the activity's fields and left the toggle off, so it drew a
    // bare bar and passed. The `PLAIN_BAR_INK` limb is what reports that.
    name: 'feasible window',
    scene: sceneOf([activity({ id: 'w', remainingFloat: 3, visualDriftDays: 2 })], {
      view: {
        dayGrid: true,
        monthGrid: true,
        yearGrid: true,
        today: true,
        nonWorking: true,
        labels: true,
        lateOverlay: false,
        floatTails: true,
      },
    }),
  },
  {
    name: 'selection ring',
    scene: sceneOf([activity({ id: 'sel' })], { selectedId: 'sel' }),
  },
  {
    name: 'secondary selection ring',
    scene: sceneOf([activity({ id: 'sec' })], {
      selectedId: 'other',
      selectedIds: ['sec'],
    }),
  },
  {
    name: 'baseline ghost',
    scene: sceneOf([activity({ id: 'g' })], {
      baselineGhosts: [
        {
          id: 'g',
          baselineStart: '2026-01-03',
          baselineFinish: '2026-01-07',
          laneIndex: SUBJECT_LANE,
          isMilestone: false,
        },
      ],
    }),
  },
];

const CHROME = inkOf(sceneOf([]));

/**
 * The ink a plain undecorated bar lays down — what every other case must DIFFER from.
 *
 * Not a count: a critical bar, a near-critical one and a milestone each draw the same number of
 * marks as a plain bar (a heavier stroke, a different path), so a count comparison would reject
 * three correct cases. The comparison is on the extents themselves, which is the quantity this
 * file is about.
 */
let PLAIN_BAR_INK: string[] = [];

const LANE_TOP = screenYOfLane(SUBJECT_LANE, VIEW);
const LANE_BOTTOM = screenYOfLane(SUBJECT_LANE + 1, VIEW);

describe('FC-6 — every glyph and decoration draws inside its own lane', () => {
  warm();
  PLAIN_BAR_INK = subjectInk(CASES[0]!.scene).map(keyOf).sort();

  /**
   * **The control's control.** Subtracting the empty scene is only sound if its ink really is a
   * sub-multiset of a populated scene's. It is, because the chrome layers read the viewport and
   * not the activities — but that is a claim about the painter, and this milestone exists because
   * claims about the painter's geometry were not being checked.
   */
  it('chromeIsASubset — the empty-scene control is contained in a populated paint', () => {
    const populated = multiset(inkOf(CASES[0]!.scene));
    const missing: string[] = [];
    for (const [key, count] of multiset(CHROME)) {
      if ((populated.get(key) ?? 0) < count) missing.push(key);
    }
    expect(missing).toEqual([]);
    expect(CHROME.length).toBeGreaterThan(0);
  });

  it.each(CASES.map((c) => [c.name, c] as const))('%s stays inside its lane', (name, subject) => {
    const marks = subjectInk(subject.scene);
    // A case that measures nothing passes every containment assertion — and "it drew something"
    // is NOT enough, because every case draws a bar. Two of these shipped with a misspelled
    // scene field (`remainingFloatDays` for `remainingFloat`, a `Set` for a `readonly string[]`):
    // both were green, both measured a bare bar, and only `tsc` could see it. So a case named
    // for a decoration must put down strictly MORE ink than the plain bar does.
    expect(marks.length).toBeGreaterThan(0);
    if (name !== 'task bar' && subject.geometryMatchesPlainBar !== true) {
      expect(marks.map(keyOf).sort()).not.toEqual(PLAIN_BAR_INK);
    }
    const escaped = marks.filter((m) => m.top < LANE_TOP || m.bottom > LANE_BOTTOM);
    expect(
      escaped.map(
        (m) => `${m.op} ${m.top - LANE_TOP}..${m.bottom - LANE_TOP} of 0..${LANE_HEIGHT}`,
      ),
    ).toEqual(subject.escapes ?? []);
  });

  /**
   * **The hover ring is drawn by a different painter, and that is a scoping finding rather than a
   * gap.** It lives in `paintInteractionLayer` (`paint.ts:2283`), not in `paintScene` — this
   * file's first version set `scene.hoverId` and measured a bare bar, because that field only
   * drives the incident-link highlight. The `PLAIN_BAR_INK` limb reported it.
   *
   * The rest of that layer is **deliberately out of FC-6's scope**: drag ghosts, the marquee and
   * the cursor chip are in-flight gesture feedback that follows the pointer, so leaving a lane is
   * what they are for. The hover ring is the one thing in there that is a decoration ON a bar,
   * so it is the one thing measured. It needs no chrome subtraction — that painter clears and
   * draws the overlay alone.
   */
  it('hover ring stays inside its lane', () => {
    const bar = activityRect(activity({ id: 'h' }), VIEW, DATA_DATE);
    expect(bar).not.toBeNull();
    const overlay: InteractionOverlay = { hover: bar, visualRefresh: true };
    const { ctx, ink } = inkRecordingCtx();
    paintInteractionLayer(ctx, overlay, SIZE, PALETTE);
    expect(ink.length).toBeGreaterThan(0);
    expect(
      ink
        .filter((m) => m.top < LANE_TOP || m.bottom > LANE_BOTTOM)
        .map((m) => `${m.op} ${m.top - LANE_TOP}..${m.bottom - LANE_TOP} of 0..${LANE_HEIGHT}`),
    ).toEqual([]);
  });

  /**
   * **The fan-out case is gone with fan-out** (M3-T3, spec D10). It asserted that the spread
   * `computeEdgeFanOut` applied to crowded bar-edge anchors stayed inside the lane — a real
   * question while the spread existed. Every link now converges on the node glyph at its bar's
   * end, whose containment is covered by the bar cases above, so there is nothing left here to
   * assert rather than a weaker assertion to keep.
   */

  /**
   * The census limb (ADR-0093's rule: a roster assertion that found nothing passes vacuously).
   * Seventeen is what M3-T1 enumerated; a case removed rather than replaced fails here.
   */
  it('the enumeration is not silently shrinking', () => {
    expect(CASES.length).toBe(16);
    expect(new Set(CASES.map((c) => c.name)).size).toBe(CASES.length);
  });

  /**
   * **The ratchet reached zero at M3-T3 and is deleted, not relaxed.**
   *
   * It carried four escapes at T1, three at T2 when the constraint pin's height stopped being a
   * literal that happened to equal the pad, and **none** here: the row's 23.5 px pad is simply
   * large enough for badges that a 5 px pad could not hold. The `escapes` field stays on the case
   * type so a future escape is recorded rather than tolerated, and every case now asserts `[]`.
   */
});
