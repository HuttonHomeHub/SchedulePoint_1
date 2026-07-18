import { describe, expect, it } from 'vitest';

import {
  deriveExternalInstants,
  type IncomingCrossPlanEdge,
  type M1ExternalInstant,
  type OutgoingCrossPlanEdge,
} from './cross-plan-derivation';

/** An incoming edge factory with sensible defaults (FS, lag 0, successor `A`, 3-day successor). */
const incoming = (over: Partial<IncomingCrossPlanEdge> = {}): IncomingCrossPlanEdge => ({
  successorActivityId: 'A',
  type: 'FS',
  lagDays: 0,
  predecessorEarlyStart: '2026-01-08',
  predecessorEarlyFinish: '2026-01-10',
  ...over,
});

/** An outgoing edge factory with sensible defaults (FS, lag 0, predecessor `A`). */
const outgoing = (over: Partial<OutgoingCrossPlanEdge> = {}): OutgoingCrossPlanEdge => ({
  predecessorActivityId: 'A',
  type: 'FS',
  lagDays: 0,
  successorLateStart: '2026-02-10',
  successorLateFinish: '2026-02-12',
  ...over,
});

const durations = (entries: Record<string, number>): Map<string, number> =>
  new Map(Object.entries(entries));
const m1 = (entries: Record<string, M1ExternalInstant>): Map<string, M1ExternalInstant> =>
  new Map(Object.entries(entries));

const EMPTY_M1 = new Map<string, M1ExternalInstant>();
const NO_DURATIONS = new Map<string, number>();

describe('deriveExternalInstants — forward (external early start) by edge type', () => {
  it('FS → predecessor early finish + lag', () => {
    const { derived } = deriveExternalInstants({
      incoming: [incoming({ type: 'FS', lagDays: 2 })],
      outgoing: [],
      m1: EMPTY_M1,
      durationDaysByActivity: durations({ A: 3 }),
    });
    // 2026-01-10 + 2 days = 2026-01-12.
    expect(derived.get('A')).toEqual({
      externalEarlyStart: '2026-01-12',
      externalLateFinish: null,
    });
  });

  it('SS → predecessor early start + lag', () => {
    const { derived } = deriveExternalInstants({
      incoming: [incoming({ type: 'SS', lagDays: 3 })],
      outgoing: [],
      m1: EMPTY_M1,
      durationDaysByActivity: durations({ A: 3 }),
    });
    // 2026-01-08 + 3 days = 2026-01-11.
    expect(derived.get('A')!.externalEarlyStart).toBe('2026-01-11');
  });

  it('FF → predecessor early finish + lag − successor duration (start implied by the finish bound)', () => {
    const { derived } = deriveExternalInstants({
      incoming: [incoming({ type: 'FF', lagDays: 1 })],
      outgoing: [],
      m1: EMPTY_M1,
      durationDaysByActivity: durations({ A: 4 }),
    });
    // 2026-01-10 + 1 − 4 = 2026-01-07.
    expect(derived.get('A')!.externalEarlyStart).toBe('2026-01-07');
  });

  it('SF → predecessor early start + lag − successor duration', () => {
    const { derived } = deriveExternalInstants({
      incoming: [incoming({ type: 'SF', lagDays: 5 })],
      outgoing: [],
      m1: EMPTY_M1,
      durationDaysByActivity: durations({ A: 4 }),
    });
    // 2026-01-08 + 5 − 4 = 2026-01-09.
    expect(derived.get('A')!.externalEarlyStart).toBe('2026-01-09');
  });

  it('a negative lag (lead) subtracts days', () => {
    const { derived } = deriveExternalInstants({
      incoming: [incoming({ type: 'FS', lagDays: -3 })],
      outgoing: [],
      m1: EMPTY_M1,
      durationDaysByActivity: durations({ A: 3 }),
    });
    // 2026-01-10 − 3 = 2026-01-07.
    expect(derived.get('A')!.externalEarlyStart).toBe('2026-01-07');
  });
});

describe('deriveExternalInstants — backward (external late finish) by edge type', () => {
  it('FS → successor late start − lag', () => {
    const { derived } = deriveExternalInstants({
      incoming: [],
      outgoing: [outgoing({ type: 'FS', lagDays: 2 })],
      m1: EMPTY_M1,
      durationDaysByActivity: durations({ A: 3 }),
    });
    // 2026-02-10 − 2 = 2026-02-08.
    expect(derived.get('A')).toEqual({
      externalEarlyStart: null,
      externalLateFinish: '2026-02-08',
    });
  });

  it('SS → successor late start − lag + predecessor duration', () => {
    const { derived } = deriveExternalInstants({
      incoming: [],
      outgoing: [outgoing({ type: 'SS', lagDays: 1 })],
      m1: EMPTY_M1,
      durationDaysByActivity: durations({ A: 3 }),
    });
    // 2026-02-10 − 1 + 3 = 2026-02-12.
    expect(derived.get('A')!.externalLateFinish).toBe('2026-02-12');
  });

  it('FF → successor late finish − lag', () => {
    const { derived } = deriveExternalInstants({
      incoming: [],
      outgoing: [outgoing({ type: 'FF', lagDays: 4 })],
      m1: EMPTY_M1,
      durationDaysByActivity: durations({ A: 3 }),
    });
    // 2026-02-12 − 4 = 2026-02-08.
    expect(derived.get('A')!.externalLateFinish).toBe('2026-02-08');
  });

  it('SF → successor late finish − lag + predecessor duration', () => {
    const { derived } = deriveExternalInstants({
      incoming: [],
      outgoing: [outgoing({ type: 'SF', lagDays: 2 })],
      m1: EMPTY_M1,
      durationDaysByActivity: durations({ A: 3 }),
    });
    // 2026-02-12 − 2 + 3 = 2026-02-13.
    expect(derived.get('A')!.externalLateFinish).toBe('2026-02-13');
  });
});

describe('deriveExternalInstants — multi-upstream fold (latest forward / earliest backward)', () => {
  it('takes the LATEST of several incoming forward bounds', () => {
    const { derived } = deriveExternalInstants({
      incoming: [
        incoming({ type: 'FS', predecessorEarlyFinish: '2026-01-05' }),
        incoming({ type: 'FS', predecessorEarlyFinish: '2026-01-20' }),
        incoming({ type: 'FS', predecessorEarlyFinish: '2026-01-12' }),
      ],
      outgoing: [],
      m1: EMPTY_M1,
      durationDaysByActivity: durations({ A: 3 }),
    });
    expect(derived.get('A')!.externalEarlyStart).toBe('2026-01-20');
  });

  it('takes the EARLIEST of several outgoing backward bounds', () => {
    const { derived } = deriveExternalInstants({
      incoming: [],
      outgoing: [
        outgoing({ type: 'FS', successorLateStart: '2026-02-20' }),
        outgoing({ type: 'FS', successorLateStart: '2026-02-05' }),
        outgoing({ type: 'FS', successorLateStart: '2026-02-12' }),
      ],
      m1: EMPTY_M1,
      durationDaysByActivity: durations({ A: 3 }),
    });
    expect(derived.get('A')!.externalLateFinish).toBe('2026-02-05');
  });

  it('folds incoming and outgoing for the same activity into one entry', () => {
    const { derived } = deriveExternalInstants({
      incoming: [incoming({ type: 'FS', predecessorEarlyFinish: '2026-01-10' })],
      outgoing: [outgoing({ type: 'FS', successorLateStart: '2026-02-10' })],
      m1: EMPTY_M1,
      durationDaysByActivity: durations({ A: 3 }),
    });
    expect(derived.get('A')).toEqual({
      externalEarlyStart: '2026-01-10',
      externalLateFinish: '2026-02-10',
    });
  });
});

describe('deriveExternalInstants — compose with the M1 hand-entered column', () => {
  it('forward: later-of the derived bound and the M1 column — M1 later wins (§30.1)', () => {
    const { derived } = deriveExternalInstants({
      incoming: [incoming({ type: 'FS', predecessorEarlyFinish: '2026-01-10' })],
      outgoing: [],
      m1: m1({ A: { externalEarlyStart: '2026-01-15', externalLateFinish: null } }),
      durationDaysByActivity: durations({ A: 3 }),
    });
    expect(derived.get('A')!.externalEarlyStart).toBe('2026-01-15');
  });

  it('forward: later-of — the derived bound later wins', () => {
    const { derived } = deriveExternalInstants({
      incoming: [incoming({ type: 'FS', predecessorEarlyFinish: '2026-01-20' })],
      outgoing: [],
      m1: m1({ A: { externalEarlyStart: '2026-01-15', externalLateFinish: null } }),
      durationDaysByActivity: durations({ A: 3 }),
    });
    expect(derived.get('A')!.externalEarlyStart).toBe('2026-01-20');
  });

  it('backward: tighter-of the derived bound and the M1 column — M1 tighter wins (§30.2)', () => {
    const { derived } = deriveExternalInstants({
      incoming: [],
      outgoing: [outgoing({ type: 'FS', successorLateStart: '2026-02-10' })],
      m1: m1({ A: { externalEarlyStart: null, externalLateFinish: '2026-02-05' } }),
      durationDaysByActivity: durations({ A: 3 }),
    });
    expect(derived.get('A')!.externalLateFinish).toBe('2026-02-05');
  });

  it('backward: tighter-of — the derived bound tighter wins', () => {
    const { derived } = deriveExternalInstants({
      incoming: [],
      outgoing: [outgoing({ type: 'FS', successorLateStart: '2026-02-03' })],
      m1: m1({ A: { externalEarlyStart: null, externalLateFinish: '2026-02-05' } }),
      durationDaysByActivity: durations({ A: 3 }),
    });
    expect(derived.get('A')!.externalLateFinish).toBe('2026-02-03');
  });

  it('an activity with only an incoming edge still reproduces its M1 late-finish column', () => {
    const { derived } = deriveExternalInstants({
      incoming: [incoming({ type: 'FS', predecessorEarlyFinish: '2026-01-10' })],
      outgoing: [],
      m1: m1({ A: { externalEarlyStart: null, externalLateFinish: '2026-03-01' } }),
      durationDaysByActivity: durations({ A: 3 }),
    });
    // The late finish has no derived bound (no outgoing edge) → the M1 column stands unchanged.
    expect(derived.get('A')).toEqual({
      externalEarlyStart: '2026-01-10',
      externalLateFinish: '2026-03-01',
    });
  });
});

describe('deriveExternalInstants — missing upstream (N32)', () => {
  it('a null upstream early finish (FS) contributes no bound and is counted', () => {
    const { derived, upstreamMissingCount } = deriveExternalInstants({
      incoming: [
        incoming({ type: 'FS', predecessorEarlyStart: null, predecessorEarlyFinish: null }),
      ],
      outgoing: [],
      m1: EMPTY_M1,
      durationDaysByActivity: durations({ A: 3 }),
    });
    expect(upstreamMissingCount).toBe(1);
    // No derived bound and no M1 column ⇒ a no-op override entry.
    expect(derived.get('A')).toEqual({ externalEarlyStart: null, externalLateFinish: null });
  });

  it('a missing upstream still lets the M1 column stand', () => {
    const { derived, upstreamMissingCount } = deriveExternalInstants({
      incoming: [incoming({ type: 'FS', predecessorEarlyFinish: null })],
      outgoing: [],
      m1: m1({ A: { externalEarlyStart: '2026-01-15', externalLateFinish: null } }),
      durationDaysByActivity: durations({ A: 3 }),
    });
    expect(upstreamMissingCount).toBe(1);
    expect(derived.get('A')!.externalEarlyStart).toBe('2026-01-15');
  });

  it('counts one per missing edge and still folds the present ones', () => {
    const { derived, upstreamMissingCount } = deriveExternalInstants({
      incoming: [
        incoming({ type: 'FS', predecessorEarlyFinish: null }),
        incoming({ type: 'FS', predecessorEarlyFinish: '2026-01-18' }),
        incoming({ type: 'SS', predecessorEarlyStart: null }),
      ],
      outgoing: [],
      m1: EMPTY_M1,
      durationDaysByActivity: durations({ A: 3 }),
    });
    expect(upstreamMissingCount).toBe(2);
    expect(derived.get('A')!.externalEarlyStart).toBe('2026-01-18');
  });

  it('a missing SS forward bound reads the START date (not the finish)', () => {
    const { upstreamMissingCount } = deriveExternalInstants({
      // SS needs the early START; a null early start is missing even though the finish is present.
      incoming: [
        incoming({ type: 'SS', predecessorEarlyStart: null, predecessorEarlyFinish: '2026-01-10' }),
      ],
      outgoing: [],
      m1: EMPTY_M1,
      durationDaysByActivity: durations({ A: 3 }),
    });
    expect(upstreamMissingCount).toBe(1);
  });

  it('an outgoing edge to a never-computed DOWNSTREAM successor is NOT counted (upstream-only, §30.5)', () => {
    // `upstreamMissingCount` counts only never-calculated *upstream predecessors* (incoming). A downstream
    // successor that is uncomputed is expected & transient during an upstream-first programme solve — it
    // yields no backward bound but must not inflate the count (else a clean recalc reports a phantom miss).
    const { derived, upstreamMissingCount } = deriveExternalInstants({
      incoming: [],
      outgoing: [outgoing({ type: 'FS', successorLateStart: null, successorLateFinish: null })],
      m1: EMPTY_M1,
      durationDaysByActivity: durations({ A: 3 }),
    });
    expect(upstreamMissingCount).toBe(0);
    // Still produces a (no-op) entry for the linked activity — no bound derived, M1 columns stand.
    expect(derived.get('A')).toEqual({ externalEarlyStart: null, externalLateFinish: null });
  });
});

describe('deriveExternalInstants — shape & edge cases', () => {
  it('an empty input derives nothing and counts no missing upstream', () => {
    const { derived, upstreamMissingCount } = deriveExternalInstants({
      incoming: [],
      outgoing: [],
      m1: EMPTY_M1,
      durationDaysByActivity: NO_DURATIONS,
    });
    expect(derived.size).toBe(0);
    expect(upstreamMissingCount).toBe(0);
  });

  it('produces one entry per DISTINCT linked activity (keyed correctly)', () => {
    const { derived } = deriveExternalInstants({
      incoming: [
        incoming({ successorActivityId: 'A', predecessorEarlyFinish: '2026-01-10' }),
        incoming({ successorActivityId: 'B', predecessorEarlyFinish: '2026-01-20' }),
      ],
      outgoing: [outgoing({ predecessorActivityId: 'C', successorLateStart: '2026-02-10' })],
      m1: EMPTY_M1,
      durationDaysByActivity: durations({ A: 3, B: 3, C: 3 }),
    });
    expect([...derived.keys()].sort()).toEqual(['A', 'B', 'C']);
    expect(derived.get('A')!.externalEarlyStart).toBe('2026-01-10');
    expect(derived.get('B')!.externalEarlyStart).toBe('2026-01-20');
    expect(derived.get('C')!.externalLateFinish).toBe('2026-02-10');
  });

  it('a missing duration entry defaults to 0 days (FF collapses to the finish bound)', () => {
    const { derived } = deriveExternalInstants({
      incoming: [incoming({ type: 'FF', lagDays: 0, predecessorEarlyFinish: '2026-01-10' })],
      outgoing: [],
      m1: EMPTY_M1,
      durationDaysByActivity: NO_DURATIONS, // no entry for A → duration 0
    });
    // FF with duration 0: 2026-01-10 + 0 − 0 = 2026-01-10.
    expect(derived.get('A')!.externalEarlyStart).toBe('2026-01-10');
  });

  it('crosses a month boundary correctly (UTC day arithmetic)', () => {
    const { derived } = deriveExternalInstants({
      incoming: [incoming({ type: 'FS', lagDays: 5, predecessorEarlyFinish: '2026-01-30' })],
      outgoing: [],
      m1: EMPTY_M1,
      durationDaysByActivity: durations({ A: 3 }),
    });
    // 2026-01-30 + 5 = 2026-02-04.
    expect(derived.get('A')!.externalEarlyStart).toBe('2026-02-04');
  });
});
