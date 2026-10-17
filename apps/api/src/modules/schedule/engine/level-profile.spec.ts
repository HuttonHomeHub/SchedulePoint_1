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

/**
 * The walk as it stood before the block aggregates (#84): a flat sorted event list read event by event,
 * horizon and all. The oracle for the exact-demand fast path, which must agree on `knownUntil` too.
 */
function referenceScan(
  intervals: readonly PlacedInterval[],
  need: number,
  esAbs: number,
  horizon: number,
  /** Filled with every instant after `esAbs` at which no blackout was open (the walk's stopping points). */
  clearInstants: number[] = [],
): { blackouts: Blackout[]; knownUntil: number } {
  const events: Array<{ t: number; delta: number }> = [];
  const head: number[] = [];
  for (const p of intervals) {
    events.push({ t: p.start, delta: p.demand }, { t: p.finish, delta: -p.demand });
    if (p.start < esAbs && p.finish > esAbs) head.push(p.demand);
  }
  events.sort((a, b) => a.t - b.t || a.delta - b.delta);
  let i = events.findIndex((e) => e.t >= esAbs);
  if (i < 0) i = events.length;
  while (i < events.length && events[i]!.t === esAbs) {
    if (events[i]!.delta > 0) head.push(events[i]!.delta);
    i += 1;
  }
  const out: Blackout[] = [];
  let load = 0;
  let openedAt: number | null = null;
  const settle = (t: number): void => {
    const over = load > need;
    if (over && openedAt === null) openedAt = t;
    else if (!over && openedAt !== null) {
      out.push({ start: openedAt, finish: t });
      openedAt = null;
    }
  };
  if (head.length > 0) {
    head.sort((a, b) => a - b);
    for (const delta of head) load += delta;
    settle(esAbs);
  }
  while (i < events.length) {
    const t = events[i]!.t;
    if (openedAt === null) clearInstants.push(t);
    if (t >= horizon && openedAt === null) return { blackouts: out, knownUntil: t };
    while (i < events.length && events[i]!.t === t) {
      load += events[i]!.delta;
      i += 1;
    }
    settle(t);
  }
  return { blackouts: out, knownUntil: Number.POSITIVE_INFINITY };
}

/**
 * What a walk that JOINS blackouts less than `minGap` apart must report, stated from the unmerged
 * answer rather than by a second walk: the runs of consecutive blackouts, and `knownUntil` as the first
 * instant at or past the horizon that is not inside a blackout and is either before any blackout or at
 * least `minGap` after the last one to end.
 */
function mergedReference(
  intervals: readonly PlacedInterval[],
  need: number,
  esAbs: number,
  horizon: number,
  minGap: number,
): { blackouts: Blackout[]; knownUntil: number } {
  const clearInstants: number[] = [];
  const unmerged = referenceScan(
    intervals,
    need,
    esAbs,
    Number.POSITIVE_INFINITY,
    clearInstants,
  ).blackouts;
  let knownUntil = Number.POSITIVE_INFINITY;
  for (const t of clearInstants) {
    if (t < horizon) continue;
    const ended = unmerged.filter((u) => u.finish < t);
    const last = ended[ended.length - 1];
    if (last === undefined || t - last.finish >= minGap) {
      knownUntil = t;
      break;
    }
  }
  const runs: Blackout[] = [];
  for (const u of unmerged.filter((b) => b.finish < knownUntil)) {
    const previous = runs[runs.length - 1];
    if (previous !== undefined && u.start - previous.finish < minGap) previous.finish = u.finish;
    else runs.push({ ...u });
  }
  return { blackouts: runs, knownUntil };
}

describe('ResourceProfile.blackoutsOf — block stepping agrees with the flat walk (#84)', () => {
  // Whole multiples of 2⁻¹⁶, so the stepping path is the one taken; a block size of 2 splits constantly,
  // so there are many block boundaries and equal instants across them. The grids are small on purpose:
  // touching intervals and ties are where a boundary mistake would show.
  const EXACT_DEMANDS = [1, 0.5, 2, 0.25, 3, 1.25, 4, 0.125, 0.1, 0.3];

  for (let seed = 1; seed <= 200; seed += 1) {
    it(`agrees on blackouts and knownUntil, with and without a horizon (seed ${seed})`, () => {
      const rand = rng(seed);
      const profile = new ResourceProfile(2);
      const live: PlacedInterval[] = [];
      const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)]!;

      for (let step = 0; step < 150; step += 1) {
        if (live.length > 0 && rand() < 0.3) {
          const [gone] = live.splice(Math.floor(rand() * live.length), 1);
          profile.remove(gone!);
        } else {
          const start = Math.floor(rand() * 30) * 5;
          const interval = {
            start,
            finish: start + (1 + Math.floor(rand() * 6)) * 5,
            demand: pick(EXACT_DEMANDS),
          };
          live.push(interval);
          profile.add(interval);
        }
        const need = pick([0, 0.5, 1, 1.5, 2, 3, 5.75, 8]);
        const esAbs = Math.floor(rand() * 40) * 5 - (rand() < 0.2 ? 7 : 0);
        for (const horizon of [Number.POSITIVE_INFINITY, esAbs + Math.floor(rand() * 40) * 5]) {
          expect(profile.blackoutsOf(need, esAbs, horizon)).toEqual(
            referenceScan(live, need, esAbs, horizon),
          );
        }
      }
    });
  }

  for (let seed = 1; seed <= 300; seed += 1) {
    it(`agrees with the merged reading of the flat walk when short gaps join (seed ${seed})`, () => {
      const rand = rng(1000 + seed);
      const profile = new ResourceProfile(2);
      const live: PlacedInterval[] = [];
      const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)]!;

      for (let step = 0; step < 150; step += 1) {
        if (live.length > 0 && rand() < 0.25) {
          const [gone] = live.splice(Math.floor(rand() * live.length), 1);
          profile.remove(gone!);
        } else {
          const start = Math.floor(rand() * 60) * 5;
          const interval = {
            start,
            finish: start + (1 + Math.floor(rand() * 6)) * 5,
            demand: pick(EXACT_DEMANDS),
          };
          live.push(interval);
          profile.add(interval);
        }
        const need = pick([0, 0.5, 1, 1.5, 2, 3]);
        const esAbs = Math.floor(rand() * 60) * 5 - (rand() < 0.2 ? 7 : 0);
        const minGap = pick([0, 5, 10, 15, 25, 60]);
        for (const horizon of [Number.POSITIVE_INFINITY, esAbs + Math.floor(rand() * 60) * 5]) {
          expect(profile.blackoutsOf(need, esAbs, horizon, minGap)).toEqual(
            mergedReference(live, need, esAbs, horizon, minGap),
          );
        }
      }
    });
  }

  it('does not step when one demand is not exact, and still agrees', () => {
    const profile = new ResourceProfile(2);
    const live: PlacedInterval[] = [];
    for (let k = 0; k < 40; k += 1) {
      const interval = { start: k * 5, finish: k * 5 + 12, demand: k === 7 ? 0.1 : 0.2 };
      live.push(interval);
      profile.add(interval);
    }
    for (const need of [0.1, 0.3, 0.4, 0.5]) {
      expect(profile.blackoutsOf(need, 20, 120)).toEqual(referenceScan(live, need, 20, 120));
    }
  });
});
