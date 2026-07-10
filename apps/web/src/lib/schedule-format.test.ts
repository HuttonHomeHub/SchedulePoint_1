import type { BaselineVarianceRow } from '@repo/types';
import { describe, expect, it } from 'vitest';

import { criticality, formatFinishVariance, formatFloat } from './schedule-format';

const base = { isCritical: false, isNearCritical: false, totalFloat: 5 };

describe('criticality', () => {
  it('returns no badge for a never-calculated activity', () => {
    expect(criticality({ ...base, totalFloat: null })).toBeNull();
  });

  it('returns no badge for ordinary positive float', () => {
    expect(criticality(base)).toBeNull();
  });

  it('flags the critical path', () => {
    expect(criticality({ isCritical: true, isNearCritical: false, totalFloat: 0 })).toEqual({
      label: 'Critical',
      variant: 'critical',
    });
  });

  it('flags the near-critical band', () => {
    expect(criticality({ isCritical: false, isNearCritical: true, totalFloat: 3 })).toEqual({
      label: 'Near-critical',
      variant: 'warning',
    });
  });
});

describe('formatFloat', () => {
  it('renders an em dash when uncomputed', () => {
    expect(formatFloat(null)).toBe('—');
  });

  it('renders positive and zero float in working days', () => {
    expect(formatFloat(0)).toBe('0 d');
    expect(formatFloat(3)).toBe('3 d');
  });

  it('renders a negative float with a real minus sign', () => {
    expect(formatFloat(-2)).toBe('−2 d');
  });
});

describe('formatFinishVariance', () => {
  function row(overrides: Partial<BaselineVarianceRow> = {}): BaselineVarianceRow {
    return {
      activityId: 'a1',
      code: null,
      name: 'A',
      inBaseline: true,
      removed: false,
      currentStart: null,
      currentFinish: null,
      currentTotalFloat: null,
      baselineStart: null,
      baselineFinish: null,
      baselineTotalFloat: null,
      startVarianceDays: null,
      finishVarianceDays: 0,
      floatVarianceDays: null,
      ...overrides,
    };
  }

  it('labels a slip as behind and a gain as ahead', () => {
    expect(formatFinishVariance(row({ finishVarianceDays: 3 }))).toEqual({
      text: '3 d behind',
      tone: 'behind',
    });
    expect(formatFinishVariance(row({ finishVarianceDays: -2 }))).toEqual({
      text: '2 d ahead',
      tone: 'ahead',
    });
  });

  it('labels zero variance as on baseline', () => {
    expect(formatFinishVariance(row({ finishVarianceDays: 0 }))).toEqual({
      text: 'On baseline',
      tone: 'onTrack',
    });
  });

  it('labels added and removed activities, and an em dash when not comparable', () => {
    expect(formatFinishVariance(row({ inBaseline: false, finishVarianceDays: null })).text).toBe(
      'Added',
    );
    expect(formatFinishVariance(row({ removed: true, finishVarianceDays: null })).text).toBe(
      'Removed',
    );
    expect(formatFinishVariance(row({ finishVarianceDays: null })).text).toBe('—');
  });
});
