import type { BaselineVarianceRow } from '@repo/types';
import { describe, expect, it } from 'vitest';

import { GANTT_COLUMNS, varianceText } from './grid-columns';

import { anActivity } from '@/test/activity-fixture';

const column = (key: string): (typeof GANTT_COLUMNS)[number] => {
  const found = GANTT_COLUMNS.find((c) => c.key === key);
  if (!found) throw new Error(`no column ${key}`);
  return found;
};

describe('GANTT_COLUMNS', () => {
  it('renders an em dash rather than an empty cell for a missing code', () => {
    expect(column('code').value(anActivity({ code: null }))).toBe('—');
  });

  it('renders an em dash for an uncalculated date, never a placeholder date', () => {
    expect(column('earlyStart').value(anActivity({ earlyStart: null }))).toBe('—');
    expect(column('earlyFinish').value(anActivity({ earlyFinish: null }))).toBe('—');
  });

  // Float of zero is a fact (critical), not an absence — it must not read the same as "unknown".
  it('distinguishes zero float from unknown float', () => {
    expect(column('totalFloat').value(anActivity({ totalFloat: 0 }))).toBe('0d');
    expect(column('totalFloat').value(anActivity({ totalFloat: null }))).toBe('—');
  });
});

describe('varianceText', () => {
  const row = (over: Partial<BaselineVarianceRow> = {}): BaselineVarianceRow => ({
    activityId: 'a1',
    code: 'A100',
    name: 'Excavate',
    inBaseline: true,
    removed: false,
    currentStart: '2026-02-02',
    currentFinish: '2026-02-06',
    currentTotalFloat: 0,
    baselineStart: '2026-02-02',
    baselineFinish: '2026-02-06',
    baselineTotalFloat: 0,
    startVarianceDays: 0,
    finishVarianceDays: 0,
    floatVarianceDays: 0,
    ...over,
  });

  it('signs and names the direction, so it reads the same in black and white', () => {
    expect(varianceText(row({ startVarianceDays: 3 }))).toBe('+3d late');
    expect(varianceText(row({ startVarianceDays: -2 }))).toBe('-2d early');
    expect(varianceText(row({ startVarianceDays: 0 }))).toBe('On plan');
  });

  it('says "New" only for an activity the baseline genuinely does not contain', () => {
    expect(varianceText(row({ inBaseline: false }))).toBe('New');
  });

  /**
   * The distinction this pins: **no variance row is not the same fact as "added since the
   * baseline"**. An absent row means we were not told; claiming "New" for it would invent a
   * comparison. This regressed once and a test caught it — keep the two cases apart explicitly.
   */
  it('does not claim "New" when there is simply no row to compare', () => {
    expect(varianceText(undefined)).toBe('—');
    expect(varianceText(undefined)).not.toBe(varianceText(row({ inBaseline: false })));
  });

  it('renders an em dash when the row exists but carries no start variance', () => {
    expect(varianceText(row({ startVarianceDays: null }))).toBe('—');
  });
});
