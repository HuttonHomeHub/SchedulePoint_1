import { describe, expect, it } from 'vitest';

import { canvasLabel } from './a11y';
import { laneRowsOf } from './paint-frame';
import {
  activityRect,
  rowReservesTextRows,
  type Rect,
  type RenderActivity,
  type Viewport,
} from './render-model';
import {
  allItems,
  layoutRowText,
  sceneRowText,
  sceneRowTextItems,
  type PlacedText,
  textWidthKey,
  textWidthKeys,
} from './row-text-layout';
import { DEFAULT_VIEW_TOGGLES, type TsldViewToggles } from './view-toggles';

/**
 * **The width table is complete** (links-and-labels M2-T3, spec §4.4). The Tidy worker measures
 * nothing: it is sent `textWidthKeys`' widths, and its measure throws on any other key. So every key
 * the layout asks for — over any lane layout, zoom, canvas width and text toggles a planner can
 * reach — must be one `textWidthKeys` lists. This drives the layout with a recording measure and
 * holds every key it recorded to that set.
 */
const TYPES = [
  'TASK',
  'TASK',
  'TASK',
  'START_MILESTONE',
  'FINISH_MILESTONE',
  'WBS_SUMMARY',
] as const;
const WORDS = [
  'Pour',
  'slab',
  'level',
  '3',
  'Erect',
  'steel',
  'frame',
  'Install',
  'M&E',
  'first-fix',
];

function plan(seed: number): RenderActivity[] {
  let s = seed;
  const rand = (): number => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
  const day = (d: number): string => {
    const t = new Date(Date.UTC(2026, 0, 1 + d));
    return t.toISOString().slice(0, 10);
  };
  return Array.from({ length: 30 }, (_, i) => {
    const type = TYPES[Math.floor(rand() * TYPES.length)]!;
    const start = Math.floor(rand() * 60);
    const length = type.endsWith('MILESTONE') ? 0 : 1 + Math.floor(rand() * 20);
    const words = 1 + Math.floor(rand() * 5);
    const label = Array.from(
      { length: words },
      () => WORDS[Math.floor(rand() * WORDS.length)],
    ).join(' ');
    return {
      id: `a${i}`,
      type,
      laneIndex: Math.floor(rand() * 8),
      label: label + (rand() < 0.2 ? ' ' : ''),
      code: rand() < 0.5 ? `A${1000 + i * 10}` : null,
      durationDays: length,
      remainingFloat: rand() < 0.5 ? Math.floor(rand() * 10) : null,
      earlyStart: day(start),
      earlyFinish: day(start + length),
      isCritical: rand() < 0.3,
      isNearCritical: false,
    };
  });
}

const TOGGLES: TsldViewToggles[] = [
  DEFAULT_VIEW_TOGGLES,
  { ...DEFAULT_VIEW_TOGGLES, activityCodes: true },
  { ...DEFAULT_VIEW_TOGGLES, centreItem: true },
  { ...DEFAULT_VIEW_TOGGLES, activityCodes: true, centreItem: true },
];

describe('textWidthKeys', () => {
  it('lists every key the layout asks for, over plans, zooms, widths and toggles', () => {
    let asked = 0;
    for (let seed = 1; seed <= 12; seed += 1) {
      const activities = plan(seed);
      for (const toggles of TOGGLES) {
        const keys = new Set(
          textWidthKeys(activities, toggles).map((k) => textWidthKey(k.text, k.font)),
        );
        for (const pxPerDay of [1, 4, 8, 12, 30]) {
          for (const width of [320, 1200, 5000]) {
            for (const originX of [0, -200]) {
              const view: Viewport = { pxPerDay, originX, originY: 0 };
              sceneRowText(
                { activities, dataDate: '2026-01-01', visualRefresh: true },
                view,
                { width, height: 0 },
                toggles,
                (text, font) => {
                  asked += 1;
                  const key = textWidthKey(text, font);
                  if (!keys.has(key)) throw new Error(`missing key ${JSON.stringify(key)}`);
                  return text.length * 6;
                },
              );
            }
          }
        }
      }
    }
    // Not vacuous: the layout really measured.
    expect(asked).toBeGreaterThan(1000);
  });

  /**
   * **Proposing no wraps changes no item the router reads.** `sceneRowText` asks for one-line names
   * only, so the worker's table need not hold a wrap's words; that is sound only because a wrapped
   * name's items, as `allItems` flattens them for the router, are its one-line fallback anyway.
   */
  it('gives the router the same items with wraps proposed and without', () => {
    let wraps = 0;
    for (let seed = 1; seed <= 12; seed += 1) {
      const activities = plan(seed);
      const byId = new Map(activities.map((a) => [a.id, a]));
      for (const toggles of TOGGLES) {
        for (const pxPerDay of [1, 4, 8, 12, 30]) {
          const view: Viewport = { pxPerDay, originX: 0, originY: 0 };
          const rects = new Map<string, Rect>();
          for (const a of activities) {
            const r = activityRect(a, view, '2026-01-01');
            if (r) rects.set(a.id, r);
          }
          const layout = (oneLineOnly: boolean) =>
            layoutRowText({
              rows: () => laneRowsOf(rects, byId),
              view,
              size: { width: 1200, height: 0 },
              toggles,
              visualRefresh: true,
              reservesTextRows: rowReservesTextRows(),
              measure: (t) => t.length * 6,
              labelOf: (a) =>
                canvasLabel(
                  { code: a.code ?? null, name: a.label },
                  toggles.activityCodes === true,
                ),
              oneLineOnly,
            });
          const full = layout(false);
          wraps += (full.names?.steps ?? []).filter((step) => step.wrap !== null).length;
          expect(allItems(layout(true))).toEqual(allItems(full));
        }
      }
    }
    // Not vacuous: the plans really do propose wraps.
    expect(wraps).toBeGreaterThan(0);
  });

  /**
   * **A lane at a time, and remembered, is the same text** (links-and-labels M2-T6b, spec §4.9).
   * Tidy lays the text out once per distinct lane content; that is sound only because every rule
   * reads one lane's row. This holds the per-lane items to the whole-plan layout's, both fresh and
   * through a memo warmed on the plan before one activity moved lane.
   */
  it('lays out a lane at a time, through a memo, exactly as the whole plan', () => {
    const key = (t: PlacedText): string =>
      `${t.lane}|${t.x}|${t.y}|${t.kind}|${t.text}|${t.activityId}`;
    const sorted = (items: readonly PlacedText[]): string[] => items.map(key).sort();
    const size = { width: 5000, height: 0 };
    let memoHits = 0; // lanes answered from the memo after a move
    for (let seed = 1; seed <= 12; seed += 1) {
      const activities = plan(seed);
      for (const toggles of TOGGLES) {
        for (const pxPerDay of [1, 4, 12]) {
          const view: Viewport = { pxPerDay, originX: 0, originY: 0 };
          const scene = { activities, dataDate: '2026-01-01', visualRefresh: true };
          const measure = (t: string): number => t.length * 6;
          const whole = sorted(allItems(sceneRowText(scene, view, size, toggles, measure)));
          expect(sorted(sceneRowTextItems(scene, view, size, toggles, measure))).toEqual(whole);
          // A memo warmed on this plan, then one activity moved: only its two lanes are new.
          const memo = new Map<string, readonly PlacedText[]>();
          sceneRowTextItems(scene, view, size, toggles, measure, new Map(), memo);
          const moved = activities.map((a, i) =>
            i === seed % activities.length ? { ...a, laneIndex: a.laneIndex + 1 } : a,
          );
          const movedScene = { ...scene, activities: moved };
          const before = memo.size;
          const got = sceneRowTextItems(movedScene, view, size, toggles, measure, new Map(), memo);
          expect(sorted(got)).toEqual(
            sorted(allItems(sceneRowText(movedScene, view, size, toggles, measure))),
          );
          // Only the two lanes the move touched were laid out again; every other came from memo.
          expect(memo.size - before).toBeLessThanOrEqual(2);
          memoHits += before - (memo.size - before);
        }
      }
    }
    // Not vacuous: the memo really was answered from, not just filled.
    expect(memoHits).toBeGreaterThan(0);
  });
});
