/**
 * **NetPoint-layout M3-T2 — FC-N5b: what resolving a 50-bar cascade costs at `scale-2000`.**
 *
 * The auto-resolve runs on the render path when a recalculation settles, so FC-N5b bounds it at
 * p95 ≤ 2 ms in node for a 50-bar cascade on a 2,160-bar plan; over that, it moves off the render
 * path into an idle callback. The plan is `scale-2000` packed on its drawn spans (what Arrange
 * leaves), and the edit stretches 50 bars spread through it by 15 days, so each collides with the
 * bar after it and the cascade is real. Non-vacuity is checked, not assumed: the run refuses a
 * verdict if the edit produced no move, or if any new overlap survives the resolution.
 */
import { type LaneState, resolveNewOverlaps } from '../src/features/tsld/model/auto-resolve';
import { laneOverlapPairs } from '../src/features/tsld/render/lane-overlap';

import { packedOnDrawn, scalePlan } from './crossing-probe';

const DAY_MS = 86_400_000;
const iso = (day: number): string =>
  new Date(Date.parse('2026-01-01T00:00:00Z') + day * DAY_MS).toISOString().slice(0, 10);

export function measure(): {
  bars: number;
  stretched: number;
  moves: number;
  leftover: number;
  p50: number;
  p95: number;
} {
  const plan = scalePlan(2000);
  const layout = packedOnDrawn(plan.asap, 'scale-2000');
  const keys = (plan.asap.activities as { key: string }[]).map((a) => a.key);
  const s0 = new Map<string, LaneState>();
  for (const key of keys) {
    const start = plan.asap.start.get(key);
    if (start === undefined) continue;
    s0.set(key, {
      laneIndex: layout.laneOf.get(key) ?? 0,
      start: iso(start),
      finish: iso(plan.asap.finish.get(key) ?? start),
    });
  }
  const stretched = keys.filter((_, i) => i % Math.floor(keys.length / 50) === 0).slice(0, 50);
  const s1 = new Map(s0);
  for (const key of stretched) {
    const s = s1.get(key)!;
    s1.set(key, { ...s, finish: iso((plan.asap.finish.get(key) ?? 0) + 15) });
  }
  const subjects = new Set(stretched);

  const times: number[] = [];
  let moves: ReturnType<typeof resolveNewOverlaps> = [];
  for (let run = 0; run < 25; run += 1) {
    const t = performance.now();
    moves = resolveNewOverlaps(s0, s1, subjects);
    times.push(performance.now() - t);
  }
  const lanes = new Map([...s1].map(([id, s]) => [id, s.laneIndex]));
  for (const m of moves) lanes.set(m.id, m.to);
  const key = ([a, b]: [string, string]) => `${a}|${b}`;
  const before = new Set(laneOverlapPairs([...s0].map(([id, s]) => ({ id, ...s }))).map(key));
  const leftover = laneOverlapPairs(
    [...s1].map(([id, s]) => ({ id, ...s, laneIndex: lanes.get(id)! })),
  ).filter((p) => !before.has(key(p))).length;
  times.sort((a, b) => a - b);
  return {
    bars: s0.size,
    stretched: stretched.length,
    moves: moves.length,
    leftover,
    p50: times[Math.floor(times.length / 2)]!,
    p95: times[Math.ceil(0.95 * times.length) - 1]!,
  };
}
