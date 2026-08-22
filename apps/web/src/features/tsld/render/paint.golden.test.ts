import { describe, expect, it } from 'vitest';

import { paintScene, type TsldPalette, type TsldScene } from './paint';
import type { RenderActivity, RenderEdge, Viewport } from './render-model';
import { recordingCtx } from './test-support/recording-ctx';

/**
 * **The whole-scene golden log** (ADR-0078 S1) — the oracle every later decomposition step is
 * measured against.
 *
 * `paintScene` is one 808-line function carrying fourteen comment-delimited layers. Decomposing it
 * into per-layer modules is a large mechanical diff whose failure mode has **no symptom** until a
 * planner looks at a wrong picture: a layer lifted with its branches subtly reordered, a `?? false`
 * that became `?? true`, a palette entry read one line too early. A human reading a 2,000-line diff
 * is exactly the review that shipped every defect the ADR-0064 §7 gate pass later found.
 *
 * So this suite converts "did the extraction change the picture?" from a judgement into a diff. It
 * paints a **maximal** scene — every view toggle on, every optional lens and refresh field set, and
 * an activity of each glyph kind that draws differently — and asserts the recorded log of ordered
 * ctx calls **and property assignments** against an inline snapshot.
 *
 * Two properties make it worth having:
 *
 * 1. It is **useful on its own**, independent of the rest of the decomposition — any future layer
 *    change gets a reviewable diff of what the painter actually emits rather than a reviewer's
 *    judgement about what it probably emits.
 * 2. It cannot be written "when touched": the thing it characterises is the code **before** the
 *    touch.
 *
 * **Why a snapshot plus structural assertions** (ADR-0078 Q2). A few hundred ordered log lines are
 * easy to write and just as easy to re-baseline thoughtlessly with `-u`, which is the precise
 * failure ADR-0034's golden strategy warns about. The structural assertions below — layer ordering
 * by each layer's signature call, and per-method totals — are the part a careless `-u` still trips
 * over, because they state the invariant in words rather than in 400 lines of recorded output.
 *
 * **One DPR is sufficient** (ADR-0078 Q3), verified by reading rather than assumed: within
 * `paintScene`, `dpr` occurs exactly twice — in the signature default (`paint.ts:954`) and in the
 * single `ctx.setTransform(dpr, 0, 0, dpr, 0, 0)` (`paint.ts:956`). No layer reads it, so a second
 * DPR would re-record the same log behind one different first line.
 *
 * **Verified red first.** Raising `EMPHASIS_STROKE_W` in `paint.ts` by 1 reddens the snapshot (the
 * critical bar's `lineWidth=` entries change); swapping the bar and edge layer order reddens the
 * `layer ordering` assertion below. Neither was committed — the discipline is what distinguishes a
 * characterisation test from a test that agrees with whatever the code currently does.
 */

const PALETTE: TsldPalette = {
  canvasGround: '#14161c',
  gridLine: '#111',
  gridLineDay: '#3a3a3a',
  gridLineMonth: '#111111',
  gridLineYear: '#565656',
  edge: '#333',
  bar: '#44f',
  critical: '#f00',
  nearCritical: '#fa0',
  outline: '#fff',
  selection: '#0af',
  nonWorking: '#222',
  nonWorkingHatch: '#444',
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
const SIZE = { width: 800, height: 400 };
const DATA_DATE = '2026-01-01';

/** Mon–Fri worked, weekends not — so the non-working layer has something to draw. */
const isWorkingDay = (dayOffset: number): boolean => {
  const dow = (new Date(`${DATA_DATE}T00:00:00Z`).getUTCDay() + dayOffset) % 7;
  return dow !== 0 && dow !== 6;
};

function activity(overrides: Partial<RenderActivity> & { id: string }): RenderActivity {
  return {
    type: 'TASK',
    laneIndex: 0,
    label: 'A100 Excavate',
    earlyStart: '2026-01-02',
    earlyFinish: '2026-01-05',
    isCritical: false,
    isNearCritical: false,
    ...overrides,
  };
}

/**
 * Every glyph kind and every per-bar cue the layer branches on, so the log exercises each branch:
 * a plain task, a critical one, a near-critical one, a progressed one, a constrained one, a
 * conflicted one, a lane-overlapped one, an over-allocated one, a milestone, an LOE and a
 * WBS summary.
 */
const ACTIVITIES: readonly RenderActivity[] = [
  activity({ id: 'plain' }),
  activity({ id: 'critical', laneIndex: 1, isCritical: true, label: 'A110 Piling' }),
  activity({ id: 'near', laneIndex: 2, isNearCritical: true, label: 'A120 Steel' }),
  activity({ id: 'progressed', laneIndex: 3, percentComplete: 45, label: 'A130 Cladding' }),
  // `constraint` is the anchored EDGE (`'start' | 'finish'`), not a constraint object — the pin
  // glyph is all the painter needs, so the type it never sees is not in the render model.
  activity({ id: 'constrained', laneIndex: 4, constraint: 'start', label: 'A140 Fit-out' }),
  activity({ id: 'conflicted', laneIndex: 5, visualConflict: true, label: 'A150 M&E' }),
  activity({ id: 'overlapped', laneIndex: 6, laneOverlap: true, label: 'A160 Roof' }),
  activity({ id: 'flagged', laneIndex: 7, label: 'A170 Crane' }),
  activity({
    id: 'milestone',
    laneIndex: 8,
    type: 'START_MILESTONE',
    earlyStart: '2026-01-06',
    earlyFinish: '2026-01-06',
    label: 'M1 Handover',
  }),
  activity({ id: 'loe', laneIndex: 9, type: 'LEVEL_OF_EFFORT', label: 'LOE Supervision' }),
  activity({ id: 'summary', laneIndex: 10, type: 'WBS_SUMMARY', label: 'Substructure' }),
];

const EDGES: readonly RenderEdge[] = [
  { id: 'e1', predecessorId: 'plain', successorId: 'critical', type: 'FS', isDriving: true },
  {
    id: 'e2',
    predecessorId: 'critical',
    successorId: 'near',
    type: 'SS',
    isDriving: false,
    lagDays: 2,
  },
  {
    id: 'e3',
    predecessorId: 'near',
    successorId: 'progressed',
    type: 'FF',
    isDriving: true,
    lagDays: -1,
  },
  { id: 'e4', predecessorId: 'progressed', successorId: 'milestone', type: 'FS', isDriving: false },
];

/** Every optional field the painter reads, set — the maximal frame. */
const MAXIMAL: TsldScene = {
  activities: ACTIVITIES,
  edges: EDGES,
  dataDate: DATA_DATE,
  selectedId: 'critical',
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
  dimmedIds: new Set(['overlapped']),
  gestureSourceId: 'plain',
  barFill: new Map([['near', '#0c8']]),
  barInk: new Map([['near', '#012']]),
  baselineGhosts: [
    {
      id: 'critical',
      baselineStart: '2026-01-03',
      baselineFinish: '2026-01-07',
      laneIndex: 1,
      isMilestone: false,
    },
  ],
  flaggedIds: new Set(['flagged']),
  timeTrueLinks: true,
  visualRefresh: true,
  hoverId: 'near',
  lagHandles: true,
  activeLagId: 'e2',
  linkRouting: true,
};

/** The flag-off shape: every optional field absent. The rollback contract's picture. */
const MINIMAL: TsldScene = {
  activities: ACTIVITIES,
  edges: EDGES,
  dataDate: DATA_DATE,
};

/**
 * `paint.ts`'s module-scope `labelWidths` memo is keyed by text alone, so the very first paint of
 * a given string fills it and later paints do not. Warm both scenes before recording, or a memo
 * fill masquerades as a difference between them (the `paint.data-date-parity.test.ts` precedent).
 */
function warm(): void {
  for (const scene of [MAXIMAL, MINIMAL]) {
    const { ctx } = recordingCtx();
    paintScene(ctx, scene, VIEW, SIZE, PALETTE);
  }
}

function logOf(scene: TsldScene): string[] {
  const { ctx, log } = recordingCtx();
  paintScene(ctx, scene, VIEW, SIZE, PALETTE);
  return log;
}

/** Count log entries whose method name matches, e.g. `fillRect(` → every fillRect call. */
function countOf(log: readonly string[], method: string): number {
  return log.filter((entry) => entry.startsWith(`${method}(`)).length;
}

/** Index of the first log entry containing `needle`, or -1. The layer-ordering probe. */
function firstIndexOf(log: readonly string[], needle: string): number {
  return log.findIndex((entry) => entry.includes(needle));
}

/** Index of the LAST log entry containing `needle`, or -1. */
function lastIndexOf(log: readonly string[], needle: string): number {
  return log.reduce((found, entry, i) => (entry.includes(needle) ? i : found), -1);
}

describe('paintScene — whole-scene golden (ADR-0078 S1)', () => {
  warm();

  it('emits a stable ordered call log for the maximal scene', () => {
    expect(logOf(MAXIMAL)).toMatchSnapshot();
  });

  it('emits a stable ordered call log for the flag-off scene', () => {
    expect(logOf(MINIMAL)).toMatchSnapshot();
  });

  it('draws its layers in the documented order, back to front', () => {
    // The structural half of the gate (Q2): stated as an invariant rather than as recorded output,
    // so re-baselining the snapshots above with `-u` cannot quietly accept a reordering. Each
    // probe is a value only its own layer writes.
    const log = logOf(MAXIMAL);
    const monthBands = firstIndexOf(log, `fillStyle=${PALETTE.monthBand}`);
    const nonWorking = firstIndexOf(log, `fillStyle=${PALETTE.nonWorking}`);
    const gridDay = firstIndexOf(log, `strokeStyle=${PALETTE.gridLineDay}`);
    const edges = firstIndexOf(log, `strokeStyle=${PALETTE.edge}`);
    const bars = firstIndexOf(log, `fillStyle=${PALETTE.bar}`);
    // `strokeStyle`, not `fillStyle`, since #148 M2: the data-date PILL was the only thing that
    // ever set `fillStyle` to this value, and it left the painter for the ruler's DOM marker layer.
    // The rule remains, and `palette.dataDate` is written in exactly one place in the whole painter
    // (`paint.ts:1337`) — verified by grep, not assumed — so the probe is still unique to its layer.
    const dataDate = firstIndexOf(log, `strokeStyle=${PALETTE.dataDate}`);
    // `palette.selection` is NOT a unique probe: the edge layer writes it too, for the ADR-0052 M5
    // incident-link highlight on the selected/hovered bar (`paint.ts:1272,1297`), ~200 entries
    // before the selection ring at `paint.ts:1823`. Writing this suite is what established that —
    // the first draft asserted `dataDate < firstIndexOf(selection)` and went red on a painter that
    // was perfectly correct. The ring is the LAST thing the frame draws, so the last occurrence is
    // the honest probe; using the first would silently assert something about the edge layer.
    const selectionRing = lastIndexOf(log, `strokeStyle=${PALETTE.selection}`);

    for (const [name, index] of Object.entries({
      monthBands,
      nonWorking,
      gridDay,
      edges,
      bars,
      dataDate,
      selectionRing,
    })) {
      expect(
        index,
        `${name} layer never drew — the probe is stale, not the painter`,
      ).toBeGreaterThan(-1);
    }

    // Ground → grid → edges → bars → markers → selection. The bars must come after the edges:
    // ADR-0026's z-order puts a link behind the bar it points at, and the edge layer is also the
    // one that collects the lag geometry layers 3.2/3.2b draw later.
    expect(monthBands).toBeLessThan(nonWorking);
    expect(nonWorking).toBeLessThan(gridDay);
    expect(gridDay).toBeLessThan(edges);
    expect(edges).toBeLessThan(bars);
    expect(bars).toBeLessThan(dataDate);
    expect(dataDate).toBeLessThan(selectionRing);
  });

  it('holds its per-method call totals', () => {
    // The other structural half: a layer dropped or double-drawn during an extraction moves one of
    // these even if the snapshot is re-baselined. Counts, never milliseconds — the ADR-0054
    // counting-stub convention, because a CI runner's timings are noise.
    const log = logOf(MAXIMAL);
    expect({
      setTransform: countOf(log, 'setTransform'),
      clearRect: countOf(log, 'clearRect'),
      fillRect: countOf(log, 'fillRect'),
      strokeRect: countOf(log, 'strokeRect'),
      beginPath: countOf(log, 'beginPath'),
      moveTo: countOf(log, 'moveTo'),
      lineTo: countOf(log, 'lineTo'),
      stroke: countOf(log, 'stroke'),
      fill: countOf(log, 'fill'),
      fillText: countOf(log, 'fillText'),
      setLineDash: countOf(log, 'setLineDash'),
    }).toMatchSnapshot();
  });

  it('records a strictly smaller log for the flag-off scene', () => {
    // Guards the snapshots from the other direction: if an extraction accidentally made an
    // optional layer unconditional, the two logs converge and this fails — whereas both snapshots
    // would simply be re-recorded.
    expect(logOf(MINIMAL).length).toBeLessThan(logOf(MAXIMAL).length);
  });
});
