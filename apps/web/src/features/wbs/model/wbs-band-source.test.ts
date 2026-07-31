import type { ActivitySummary } from '@repo/types';
import { describe, expect, it } from 'vitest';

/**
 * The **one** band derivation shared by the live canvas and the image export (ADR-0063 §M5).
 *
 * Its whole reason to exist is that two copies of this answer would eventually differ, and the
 * difference would only show up in a printed programme — so what is pinned here is the contract
 * both callers depend on, including the parity path down to the array's identity.
 *
 * The flag arrives as a parameter, so there is nothing to `vi.mock` — which is the tell that the
 * module ended up in the right tier. Its earlier draft lived under `features/tsld/render/` and had
 * to mock `@/config/env` to be testable at all.
 */
import { deriveWbsBandSource } from './wbs-band-source';

import { WBS_BAND_ROW_HEIGHT } from '@/features/tsld/render/wbs-band';
import { anActivity } from '@/test/activity-fixture';

const SUMMARY = anActivity({
  id: 's1',
  name: 'Substructure',
  type: 'WBS_SUMMARY',
  earlyStart: '2026-01-01',
  earlyFinish: '2026-03-31',
});
const CHILD = anActivity({
  id: 'c1',
  name: 'Piling',
  parentId: 's1',
  earlyStart: '2026-01-05',
  earlyFinish: '2026-01-09',
});
const LOOSE = anActivity({
  id: 'l1',
  name: 'Loose end',
  earlyStart: '2026-02-02',
  earlyFinish: '2026-02-06',
});

const ALL: ActivitySummary[] = [SUMMARY, CHILD, LOOSE];

describe('deriveWbsBandSource', () => {
  it('is inert with the toggle off, and returns the input array by identity', () => {
    const source = deriveWbsBandSource(ALL, { enabled: true, toggleOn: false });
    expect(source).toEqual({ active: false, groups: null, height: 0, sceneActivities: ALL });
    // Identity, not just equality: the parity path must not even allocate a new array, because a
    // fresh reference every render is what turns a no-op into a repaint.
    expect(source.sceneActivities).toBe(ALL);
  });

  it('lifts summaries out of the scene when the band is on', () => {
    const source = deriveWbsBandSource(ALL, { enabled: true, toggleOn: true });
    expect(source.active).toBe(true);
    expect(source.sceneActivities.map((a) => a.id)).toEqual(['c1', 'l1']);
  });

  it('reserves a height once there is something to show', () => {
    const source = deriveWbsBandSource(ALL, { enabled: true, toggleOn: true });
    expect(source.height).toBeGreaterThanOrEqual(WBS_BAND_ROW_HEIGHT);
  });

  it('places the summary and the derived bucket on the band', () => {
    const source = deriveWbsBandSource(ALL, { enabled: true, toggleOn: true });
    expect(source.groups?.map((g) => g.label)).toEqual(['Substructure', 'Unassigned']);
  });

  /**
   * The cap's other half. The band stacks `WBS_BAND_MAX_DEPTH + 1` levels and skips anything deeper
   * (ADR-0063 §3), leaving it "an ordinary bar in the diagram" — which only holds if the scene keeps
   * it. It did not: every `WBS_SUMMARY` was lifted out regardless of depth, so a summary past the cap
   * was skipped by the band, removed from the scene, and rendered nowhere at all. Nothing errored and
   * nothing looked broken; a phase was simply absent from the picture.
   *
   * Four levels deep, so the innermost (depth 3) is over the cap while its three ancestors are not.
   */
  it('keeps an over-cap summary in the scene, since the band will not draw it', () => {
    const nested: ActivitySummary[] = [0, 1, 2, 3].map((depth) =>
      anActivity({
        id: `d${depth}`,
        name: `Level ${depth}`,
        type: 'WBS_SUMMARY',
        ...(depth === 0 ? {} : { parentId: `d${depth - 1}` }),
        earlyStart: '2026-01-01',
        earlyFinish: '2026-03-31',
      }),
    );
    const source = deriveWbsBandSource(nested, { enabled: true, toggleOn: true });
    // The band takes the three it can stack…
    expect(source.groups?.filter((g) => g.depth <= 2).map((g) => g.id)).toEqual(['d0', 'd1', 'd2']);
    // …and the scene keeps exactly the one it cannot, so no summary is lost between them.
    expect(source.sceneActivities.map((a) => a.id)).toEqual(['d3']);
  });

  /**
   * `null` and `[]` are different answers — "the band is off" and "the band is on with nothing in
   * it" — and a caller that treated them the same would reserve height for an empty strip, or drop
   * a band the user had switched on.
   */
  it('distinguishes off (null) from on-but-empty (an empty list)', () => {
    expect(deriveWbsBandSource(ALL, { enabled: true, toggleOn: false }).groups).toBeNull();
    expect(deriveWbsBandSource([], { enabled: true, toggleOn: true }).groups).toEqual([]);
    expect(deriveWbsBandSource([], { enabled: true, toggleOn: true }).height).toBe(0);
  });
});
