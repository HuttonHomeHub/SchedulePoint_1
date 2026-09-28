import { describe, expect, it } from 'vitest';

import { toActivitySummary, type GuestActivity } from './guest-api';

import { toRenderActivities } from '@/features/tsld/render/to-render-model';
import { barDateSourceFor } from '@/lib/bar-dates';

/**
 * ADR-0163 (spec §2, FC-4/FC-7) — the guest adapter's version-skew rule for the placed span.
 *
 * `visualEffectiveStart`/`Finish` are OPTIONAL on the wire type: an older API image does not send
 * them at all (ADR-0047, images auto-pull independently). The rule this pins is that an ABSENT key
 * and a PRESENT `null` mean different things and must not be conflated — `??`/`||` would get this
 * wrong, since both treat an explicit `null` the same as `undefined`.
 */
function baseActivity(overrides: Partial<GuestActivity> = {}): GuestActivity {
  return {
    id: 'act-1',
    code: 'A100',
    name: 'Excavate',
    type: 'TASK',
    durationDays: 3,
    durationMinutes: 4320,
    laneIndex: 0,
    earlyStart: '2026-01-05',
    earlyFinish: '2026-01-08',
    lateStart: '2026-01-05',
    lateFinish: '2026-01-08',
    totalFloat: 0,
    isCritical: true,
    status: 'NOT_STARTED',
    percentComplete: 0,
    actualStart: null,
    actualFinish: null,
    ...overrides,
  };
}

describe('toActivitySummary — the placed-span skew rule (ADR-0163)', () => {
  it('key present with a date → carried through, not the early dates', () => {
    const row = baseActivity({
      visualEffectiveStart: '2026-01-12',
      visualEffectiveFinish: '2026-01-15',
    });
    const summary = toActivitySummary(row, 'plan-1');
    expect(summary.visualEffectiveStart).toBe('2026-01-12');
    expect(summary.visualEffectiveFinish).toBe('2026-01-15');
    expect(summary.visualEffectiveStart).not.toBe(row.earlyStart);
  });

  it('key present as null → null (the plan has never been calculated) — NOT the early dates', () => {
    const row = baseActivity({ visualEffectiveStart: null, visualEffectiveFinish: null });
    const summary = toActivitySummary(row, 'plan-1');
    expect(summary.visualEffectiveStart).toBeNull();
    expect(summary.visualEffectiveFinish).toBeNull();
  });

  it('key ABSENT (an older API) → falls back to the early dates, today’s picture', () => {
    const row = baseActivity();
    expect('visualEffectiveStart' in row).toBe(false);
    const summary = toActivitySummary(row, 'plan-1');
    expect(summary.visualEffectiveStart).toBe(row.earlyStart);
    expect(summary.visualEffectiveFinish).toBe(row.earlyFinish);
  });

  /**
   * Through the REAL render seam (`@/lib/bar-dates` → `toRenderActivities`), not a restatement of
   * it — the same seam `TsldPanel` draws bars from. `barDateSourceFor(false)` is `'visual'` (the
   * guest surface offers no Late overlay), and `RenderActivity.earlyStart` is the render model's
   * name for the RESOLVED drawn start regardless of source (`to-render-model.ts`).
   */
  it('renders on the placed basis through toRenderActivities(…, barDateSourceFor(false))', () => {
    const row = baseActivity({
      visualEffectiveStart: '2026-01-12',
      visualEffectiveFinish: '2026-01-15',
    });
    const summary = toActivitySummary(row, 'plan-1');
    const [rendered] = toRenderActivities([summary], barDateSourceFor(false));
    expect(rendered?.earlyStart).toBe(row.visualEffectiveStart);
    expect(rendered?.earlyStart).not.toBe(row.earlyStart);
  });
});
