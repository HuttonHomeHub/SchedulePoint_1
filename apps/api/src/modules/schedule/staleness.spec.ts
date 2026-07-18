import { describe, expect, it } from 'vitest';

import { computeStaleness } from './staleness';

const at = (iso: string) => new Date(iso);

describe('computeStaleness (ADR-0045 §5 / ADR-0035 §30.7)', () => {
  it('is NOT stale when every upstream is older than or equal to the target', () => {
    const result = computeStaleness(at('2026-07-18T12:00:00Z'), [
      { planId: 'A', computedAt: at('2026-07-18T09:00:00Z') }, // older
      { planId: 'B', computedAt: at('2026-07-18T12:00:00Z') }, // equal — not newer
    ]);
    expect(result).toEqual({ scheduleStale: false, staleUpstreamPlanIds: [] });
  });

  it('is stale, naming only the newer upstream, when one upstream was recalculated later', () => {
    const result = computeStaleness(at('2026-07-18T12:00:00Z'), [
      { planId: 'A', computedAt: at('2026-07-18T09:00:00Z') }, // older
      { planId: 'B', computedAt: at('2026-07-18T15:00:00Z') }, // NEWER → drives staleness
    ]);
    expect(result).toEqual({ scheduleStale: true, staleUpstreamPlanIds: ['B'] });
  });

  it('lists every newer upstream in the order given', () => {
    const result = computeStaleness(at('2026-07-18T12:00:00Z'), [
      { planId: 'A', computedAt: at('2026-07-18T16:00:00Z') },
      { planId: 'B', computedAt: at('2026-07-18T08:00:00Z') },
      { planId: 'C', computedAt: at('2026-07-18T15:00:00Z') },
    ]);
    expect(result).toEqual({ scheduleStale: true, staleUpstreamPlanIds: ['A', 'C'] });
  });

  it('is stale when the target was NEVER computed but an upstream has been', () => {
    const result = computeStaleness(null, [
      { planId: 'A', computedAt: at('2026-07-18T09:00:00Z') },
    ]);
    expect(result).toEqual({ scheduleStale: true, staleUpstreamPlanIds: ['A'] });
  });

  it('a never-computed upstream contributes no staleness (no dates that could be newer)', () => {
    // Target computed; upstream never computed → not newer.
    expect(
      computeStaleness(at('2026-07-18T12:00:00Z'), [{ planId: 'A', computedAt: null }]),
    ).toEqual({ scheduleStale: false, staleUpstreamPlanIds: [] });
    // Both never computed → not stale (nothing to compare).
    expect(computeStaleness(null, [{ planId: 'A', computedAt: null }])).toEqual({
      scheduleStale: false,
      staleUpstreamPlanIds: [],
    });
  });

  it('is NOT stale when there are no upstreams (a plan with only downstream cross-plan edges)', () => {
    expect(computeStaleness(at('2026-07-18T12:00:00Z'), [])).toEqual({
      scheduleStale: false,
      staleUpstreamPlanIds: [],
    });
  });
});
