import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { DEFAULT_VIEW_TOGGLES, paintScene, type TsldPalette, type TsldScene } from './paint';
import {
  activityRect,
  MILESTONE_RADIUS,
  ROW_TEXT_GAP_PX,
  WRAP_LINE_H,
  wrappedNameYs,
  rowSlots,
  screenYOfLane,
  type RenderActivity,
  type RenderEdge,
  type Viewport,
} from './render-model';
import { recordingCtx } from './test-support/recording-ctx';

/**
 * **NetPoint grammar M4 — text on the canvas, and the tiers that withhold it** (spec §4.2 G7, G11).
 *
 * The canvas prints a name without its code unless `Activity codes` is on; a milestone's name is
 * bold; the dates are withheld at the overview tier; the lag plate is drawn at the detail tier
 * only. And every one of those tier gates reads the one `lodTier` function, never a copy of its
 * thresholds (the structural case at the end).
 */
const PALETTE = {
  canvasGround: '#000001',
  gridLine: '#000002',
  laneRule: '#000003',
  edge: '#000004',
  bar: '#000005',
  nodeRim: '#000005',
  nodeRimNear: '#000009',
  nodeRimCritical: '#000008',
  linkMinor: '#000006',
  linkDriving: '#000007',
  linkMark: '#3d2070',
  attachDot: '#3d2071',
  critical: '#000008',
  nearCritical: '#000009',
  selection: '#00000a',
  outline: '#00000b',
  labelBeside: '#00000c',
  labelInside: '#00000d',
  labelInsideCritical: '#00000d',
  labelInsideNearCritical: '#00000d',
  barStroke: '#00000e',
  hoverRing: '#00000f',
  handleHalo: '#000010',
} as unknown as TsldPalette;

const SIZE = { width: 1600, height: 400 };
const VIEW12: Viewport = { pxPerDay: 12, originX: 40, originY: 40 };
const DATA_DATE = '2026-01-01';

function act(over: Partial<RenderActivity> & { id: string }): RenderActivity {
  return {
    type: 'TASK',
    laneIndex: 0,
    label: over.id,
    earlyStart: '2026-01-05',
    earlyFinish: '2026-02-27',
    isCritical: false,
    isNearCritical: false,
    ...over,
  };
}

function paint(
  activities: RenderActivity[],
  pxPerDay: number,
  toggles: Partial<TsldScene['view']> = {},
  edges: RenderEdge[] = [],
): string[] {
  const { ctx, log } = recordingCtx();
  const scene: TsldScene = {
    activities,
    edges,
    dataDate: DATA_DATE,
    view: { ...DEFAULT_VIEW_TOGGLES, labels: true, ...toggles },
    visualRefresh: true,
    timeTrueLinks: true,
    linkRouting: true,
    isWorkingDay: () => true,
  };
  const view: Viewport = { pxPerDay, originX: 40, originY: 40 };
  paintScene(ctx, scene, view, SIZE, PALETTE);
  return log;
}

const texts = (log: readonly string[]): string[] =>
  log
    .filter((l) => l.startsWith('fillText('))
    .map((l) => (JSON.parse(l.slice('fillText('.length, -1)) as [string])[0]);

describe('the canvas label (M4-T1)', () => {
  it('prints the name alone, and the code before it only while codes are on', () => {
    const a = act({ id: 'a', label: 'Pour slab', code: 'A1020' });
    expect(texts(paint([a], 12))).toContain('Pour slab');
    expect(texts(paint([a], 12))).not.toContain('A1020 Pour slab');
    expect(texts(paint([a], 12, { activityCodes: true }))).toContain('A1020 Pour slab');
  });

  it('sets a milestone’s name bold, and restores the regular face after it', () => {
    const m = act({
      id: 'm',
      type: 'FINISH_MILESTONE',
      label: 'Handover',
      earlyStart: '2026-01-10',
      earlyFinish: '2026-01-10',
    });
    const log = paint([m], 12);
    const at = log.findIndex((l) => l.startsWith('fillText(["Handover"'));
    expect(at).toBeGreaterThan(-1);
    const fontBefore = log
      .slice(0, at)
      .reverse()
      .find((l) => l.startsWith('font='));
    expect(fontBefore).toMatch(/^font=600 11px/);
    const fontAfter = log.slice(at).find((l) => l.startsWith('font='));
    expect(fontAfter).toMatch(/^font=11px/);
  });
});

describe('the wrap (M4-T2, spec §4.2 G7)', () => {
  // Two finish milestones in lane 1 with a long first word, and a link from lane 0 to lane 2 whose
  // vertical crosses lane 1 beside the first milestone. Node-to-node routing (ADR-0158) drops that
  // vertical straight out of P's finish node, so P finishing on day 7 puts it where the wrapped first
  // line would sit and day 8 puts it clear. (The corridor router this case was written against bent
  // one gap east of the node, which is why it used days 6 and 7.)
  const d = (n: number): string => new Date(Date.UTC(2026, 0, n)).toISOString().slice(0, 10);
  const plan = (pf: number): RenderActivity[] => [
    act({ id: 'p', laneIndex: 0, earlyStart: d(2), earlyFinish: d(pf), label: 'P' }),
    act({ id: 's', laneIndex: 2, earlyStart: d(20), earlyFinish: d(22), label: 'S' }),
    act({
      id: 'm1',
      type: 'FINISH_MILESTONE',
      laneIndex: 1,
      earlyStart: d(6),
      earlyFinish: d(6),
      label: 'ABCDE FGHIJKLMNOP',
    }),
    act({
      id: 'm2',
      type: 'FINISH_MILESTONE',
      laneIndex: 1,
      earlyStart: d(11),
      earlyFinish: d(11),
      label: 'N',
    }),
  ];
  const link: RenderEdge[] = [
    { id: 'e', predecessorId: 'p', successorId: 's', type: 'FS', isDriving: true },
  ];
  const names = (log: string[]): string[] => texts(log).filter((t) => /^[A-J]/.test(t));

  it('breaks a name that would truncate onto two lines at a word, where nothing is routed', () => {
    expect(names(paint(plan(6), 12))).toEqual(['ABCDE', 'FGHI…']);
  });

  it('routes round the one-line name where it can, which leaves the first line room (#393)', () => {
    // Before links-and-labels M2 the router could not see the name, and P finishing on day 7 dropped
    // its link straight through it, so this case kept one truncated line. The text-aware router
    // takes the lane-0 horizontal and comes down at S instead: same length, clear of the name.
    expect(names(paint(plan(7), 12, {}, link))).toEqual(['ABCDE', 'FGHI…']);
  });

  it('keeps one truncated line where a routed link passes where the first line would go', () => {
    // The fallback, which still happens where the router has no text-free shape as cheap: a bar
    // after P in lane 0 puts the lane-0 horizontal through a foreign glyph, so the link runs the
    // gutter above lane 1 instead, clear of the one-line name and across the wrap's first line.
    const blocked = [
      ...plan(7),
      act({ id: 'q', laneIndex: 0, earlyStart: d(9), earlyFinish: d(30), label: 'Q' }),
    ];
    expect(names(paint(blocked, 12, {}, link))).toEqual(['ABCD…']);
  });

  it('wraps beside a link that passes clear of the first line', () => {
    expect(names(paint(plan(8), 12, {}, link))).toEqual(['ABCDE', 'FGHI…']);
  });

  it('fits a wrapped pair inside its own lane (spec §4.13 A4)', () => {
    // G7's first wording let the upper line reach across the lane boundary; A4 superseded it, and
    // M4 built G7. The M6 gate pass found that from the lane-containment case, so the two lines now
    // share the pad above the bar and neither box leaves the lane or reaches the bar.
    const laneTop = screenYOfLane(1, VIEW12);
    const slots = rowSlots(laneTop);
    const { upper, lower } = wrappedNameYs(slots);
    expect(upper - WRAP_LINE_H / 2).toBeGreaterThanOrEqual(laneTop);
    expect(lower + WRAP_LINE_H / 2).toBeLessThanOrEqual(slots.barY - ROW_TEXT_GAP_PX);
  });

  it('puts the first line one wrapped line above the second', () => {
    const log = paint(plan(6), 12);
    const ys = log
      .filter((l) => l.startsWith('fillText(["ABCDE"') || l.startsWith('fillText(["FGHI'))
      .map((l) => (JSON.parse(l.slice('fillText('.length, -1)) as [string, number, number])[2]);
    expect(ys[1]! - ys[0]!).toBe(WRAP_LINE_H);
  });
});

describe('the tiers (M4-T4, spec §4.2 G11)', () => {
  it('withholds dates at the overview tier and draws them from the working tier', () => {
    const a = act({ id: 'a', label: 'Frame', earlyFinish: '2026-12-30' });
    const dated = (log: string[]): boolean =>
      texts(log).some((t) => /\d{1,2} [A-Z][a-z]{2}/.test(t));
    expect(dated(paint([a], 2, { dates: true }))).toBe(false);
    expect(dated(paint([a], 5, { dates: true }))).toBe(true);
  });

  it('draws the lag plate at the detail tier only', () => {
    const a = act({ id: 'a', label: 'A', earlyStart: '2026-01-05', earlyFinish: '2026-01-20' });
    const b = act({
      id: 'b',
      label: 'B',
      laneIndex: 2,
      earlyStart: '2026-03-01',
      earlyFinish: '2026-03-20',
    });
    const lagged: RenderEdge[] = [
      { id: 'e', predecessorId: 'a', successorId: 'b', type: 'FS', isDriving: true, lagDays: 2 },
    ];
    const plate = (log: string[]): boolean => texts(log).some((t) => t.startsWith('+2d'));
    expect(plate(paint([a, b], 5, {}, lagged))).toBe(false);
    expect(plate(paint([a, b], 8, {}, lagged))).toBe(true);
  });

  /**
   * **An arrowhead into a milestone stops at the triangle** (node-to-node links M3, the
   * accessibility gate's suggestion). A vertical arrives at a milestone's centre port, and the
   * triangle paints after the links, so a head drawn to the centre would sit mostly under the glyph:
   * direction is the one non-colour cue a link carries (WCAG 1.4.1). `headLineFor` trims the head's
   * line by `MILESTONE_RADIUS`. Checked here on the recorded paths: no path vertex lies inside the
   * glyph's radius except the stroked line's own end.
   */
  it('stops an arrowhead into a milestone at the triangle, not under it', () => {
    const d = (n: number): string => new Date(Date.UTC(2026, 0, n)).toISOString().slice(0, 10);
    const task = act({ id: 't', label: 'T', laneIndex: 0, earlyStart: d(2), earlyFinish: d(9) });
    const milestone = act({
      id: 'm',
      label: 'M',
      type: 'START_MILESTONE',
      laneIndex: 2,
      earlyStart: d(10),
      earlyFinish: d(10),
    });
    const log = paint([task, milestone], 12, {}, [
      { id: 'e', predecessorId: 't', successorId: 'm', type: 'FS', isDriving: true },
    ]);
    const rect = activityRect(milestone, VIEW12, DATA_DATE)!;
    const centre = { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
    const points = log
      .filter((l) => l.startsWith('moveTo(') || l.startsWith('lineTo('))
      .map((l) => JSON.parse(l.slice(l.indexOf('(') + 1, -1)) as [number, number]);
    const inside = points.filter(
      ([x, y]) => Math.hypot(x - centre.x, y - centre.y) < MILESTONE_RADIUS - 0.5,
    );
    // Exactly one path point inside the glyph: the stroked line's own end, on the centre port. An
    // untrimmed head would add its tip there too.
    expect(inside).toHaveLength(1);
    expect(Math.hypot(inside[0]![0] - centre.x, inside[0]![1] - centre.y)).toBeLessThanOrEqual(0.5);
  });

  it('every tier gate in the painter reads lodTier, never a copy of its thresholds', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    // The date and centre-item gates moved into `row-text-layout.ts` at links-and-labels M1 (spec
    // §4.2), so the painter is read together with the module it draws from.
    const painter = ['paint.ts', 'row-text-layout.ts']
      .map((f) => readFileSync(join(here, f), 'utf8'))
      .join('\n')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');
    // Gap labels, lag plates, attachment dots, dates and the centre item: five gates.
    expect((painter.match(/lodTier\(view\.pxPerDay\)/g) ?? []).length).toBeGreaterThanOrEqual(5);
    expect(painter).not.toMatch(/LOD_(WORKING|DETAIL)_MIN_PX_PER_DAY/);
  });
});
