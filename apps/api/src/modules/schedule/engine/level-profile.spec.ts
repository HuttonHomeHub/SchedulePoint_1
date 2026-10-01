import { describe, expect, it } from 'vitest';

import { ResourceProfile, type Blackout, type PlacedInterval } from './level-profile';

/**
 * The function `ResourceProfile.blackoutsOf` replaced, frozen verbatim from before M2.5: rebuild the
 * `±demand` events from the interval list, sort them, sweep. It is kept here and nowhere else, as the
 * oracle the incremental profile must agree with EXACTLY (same spans, same float sums).
 */
function referenceBlackoutsOf(
  intervals: readonly PlacedInterval[],
  need: number,
  esAbs: number,
): Blackout[] {
  const events: Array<{ t: number; delta: number }> = [];
  for (const p of intervals) {
    if (p.finish <= esAbs) continue;
    events.push({ t: Math.max(p.start, esAbs), delta: p.demand });
    events.push({ t: p.finish, delta: -p.demand });
  }
  if (events.length === 0) return [];
  events.sort((a, b) => a.t - b.t || a.delta - b.delta);

  const out: Blackout[] = [];
  let load = 0;
  let openedAt: number | null = null;
  let i = 0;
  while (i < events.length) {
    const t = events[i]!.t;
    while (i < events.length && events[i]!.t === t) {
      load += events[i]!.delta;
      i += 1;
    }
    const over = load > need;
    if (over && openedAt === null) openedAt = t;
    else if (!over && openedAt !== null) {
      out.push({ start: openedAt, finish: t });
      openedAt = null;
    }
  }
  return out;
}

/** mulberry32 — a seeded generator, so a failure names a seed that reproduces it. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('ResourceProfile.blackoutsOf — differential against the sort-per-call original', () => {
  // Small time and demand grids make ties, touching intervals and straddlers common, which is where an
  // ordering difference would show. The fractional demands are the point: a float sum is order-sensitive.
  const DEMANDS = [1, 0.5, 0.1, 0.2, 0.3, 2, 0.7, 1.25, 3, 0.05];

  for (let seed = 1; seed <= 200; seed += 1) {
    it(`agrees over a random occupy/release sequence (seed ${seed})`, () => {
      const rand = rng(seed);
      const profile = new ResourceProfile();
      const live: PlacedInterval[] = [];
      const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)]!;

      for (let step = 0; step < 60; step += 1) {
        if (live.length > 0 && rand() < 0.3) {
          const [gone] = live.splice(Math.floor(rand() * live.length), 1);
          profile.remove(gone!);
        } else {
          const start = Math.floor(rand() * 40) * 5;
          const interval = {
            start,
            finish: start + (1 + Math.floor(rand() * 8)) * 5,
            demand: pick(DEMANDS),
          };
          live.push(interval);
          profile.add(interval);
        }
        const need = pick([0, 0.5, 1, 1.5, 2, 3, 5.7, 8]);
        const esAbs = Math.floor(rand() * 50) * 5;
        const reference = referenceBlackoutsOf(live, need, esAbs);
        expect(profile.blackoutsOf(need, esAbs)).toEqual({
          blackouts: reference,
          knownUntil: Number.POSITIVE_INFINITY,
        });

        // A finite horizon reads less but claims exactly what it read: the listed blackouts are the
        // reference's that start before `knownUntil`, and `knownUntil` is at or past the horizon.
        const horizon = esAbs + Math.floor(rand() * 40) * 5;
        const partial = profile.blackoutsOf(need, esAbs, horizon);
        expect(partial.blackouts).toEqual(reference.filter((b) => b.start < partial.knownUntil));
        if (partial.knownUntil !== Number.POSITIVE_INFINITY) {
          expect(partial.knownUntil).toBeGreaterThanOrEqual(horizon);
        }
      }
    });
  }

  it('keeps removal by identity: two equal-looking intervals are lifted one at a time', () => {
    const profile = new ResourceProfile();
    const a = { start: 0, finish: 10, demand: 1 };
    const b = { start: 0, finish: 10, demand: 1 };
    profile.add(a);
    profile.add(b);
    expect(profile.blackoutsOf(1, 0).blackouts).toEqual([{ start: 0, finish: 10 }]);
    profile.remove(b);
    expect(profile.intervals).toEqual([a]);
    expect(profile.intervals[0]).toBe(a);
    expect(profile.blackoutsOf(1, 0).blackouts).toEqual([]);
    profile.remove(a);
    expect(profile.blackoutsOf(0, 0).blackouts).toEqual([]);
  });
});
