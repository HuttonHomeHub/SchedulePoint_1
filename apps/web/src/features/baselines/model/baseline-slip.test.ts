import { describe, expect, it } from 'vitest';

import type { PlanVariance } from '../api/use-baselines';

import { baselineSlipDays } from './baseline-slip';

const variance = (summary: Partial<PlanVariance['summary']>): PlanVariance => ({
  rows: [],
  summary: {
    baselineId: 'b1',
    baselineName: 'Contract Baseline',
    capturedAt: '2026-01-01T00:00:00.000Z',
    worstFinishSlipDays: 0,
    behindCount: 0,
    addedCount: 0,
    removedCount: 0,
    basis: 'PLACED',
    baselineProjectFinish: '2026-02-02',
    currentProjectFinish: '2026-02-05',
    projectFinishVarianceDays: 3,
    ...summary,
  },
});

describe('baselineSlipDays', () => {
  it('reports the days for an active baseline, including zero and negative', () => {
    expect(baselineSlipDays({ isSuccess: true, data: variance({}) })).toBe(3);
    expect(
      baselineSlipDays({ isSuccess: true, data: variance({ projectFinishVarianceDays: 0 }) }),
    ).toBe(0);
    expect(
      baselineSlipDays({ isSuccess: true, data: variance({ projectFinishVarianceDays: -2 }) }),
    ).toBe(-2);
  });

  it('says nothing while the read is pending', () => {
    expect(baselineSlipDays({ isSuccess: false, data: undefined })).toBeUndefined();
  });

  it('says nothing when the read failed, even with earlier data', () => {
    expect(baselineSlipDays({ isSuccess: false, data: variance({}) })).toBeUndefined();
  });

  it('says nothing without an active baseline', () => {
    expect(
      baselineSlipDays({
        isSuccess: true,
        data: variance({ baselineId: null, projectFinishVarianceDays: null }),
      }),
    ).toBeUndefined();
  });

  it('says nothing, never "On baseline", when the days are null under an active baseline', () => {
    expect(
      baselineSlipDays({ isSuccess: true, data: variance({ projectFinishVarianceDays: null }) }),
    ).toBeUndefined();
  });

  it('says nothing when an older API omits the field', () => {
    const data = variance({});
    delete (data.summary as Partial<PlanVariance['summary']>).projectFinishVarianceDays;
    expect(baselineSlipDays({ isSuccess: true, data })).toBeUndefined();
  });
});
