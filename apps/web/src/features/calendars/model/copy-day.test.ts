import { describe, expect, it } from 'vitest';

import { COPY_TARGET_GROUPS, copyDay } from './copy-day';
import { presetWeek } from './presets';

const MONDAY = 0;
const SATURDAY = 5;

describe('copyDay', () => {
  it('replaces the target days’ hours with the source day’s', () => {
    const week = presetWeek('standard');
    const copied = copyDay(week, MONDAY, [SATURDAY]);
    expect(copied[SATURDAY]).toEqual([{ start: '08:00', end: '17:00' }]);
  });

  it('leaves every other day untouched', () => {
    const week = presetWeek('two-shift');
    const copied = copyDay(week, MONDAY, [SATURDAY]);
    expect(copied.slice(0, 5)).toEqual(week.slice(0, 5));
    expect(copied[6]).toEqual([]);
  });

  /** Replace, not merge: merging can manufacture an overlap neither day had. */
  it('discards what the target held rather than merging into it', () => {
    const week = presetWeek('standard');
    week[SATURDAY] = [{ start: '09:00', end: '12:00' }];
    expect(copyDay(week, MONDAY, [SATURDAY])[SATURDAY]).toEqual([{ start: '08:00', end: '17:00' }]);
  });

  it('copies an empty day, so "Monday doesn’t work either" is expressible', () => {
    const week = presetWeek('standard');
    expect(copyDay(week, 6, [MONDAY])[MONDAY]).toEqual([]);
  });

  it('ignores the source day in its own target list', () => {
    const week = presetWeek('standard');
    week[MONDAY] = [{ start: '07:00', end: '15:00' }];
    expect(copyDay(week, MONDAY, [MONDAY, SATURDAY])[MONDAY]).toEqual([
      { start: '07:00', end: '15:00' },
    ]);
  });

  it('deep-copies, so editing a copied day does not edit its source', () => {
    const week = presetWeek('standard');
    const copied = copyDay(week, MONDAY, [SATURDAY]);
    copied[SATURDAY]![0]!.end = '12:00';
    expect(copied[MONDAY]).toEqual([{ start: '08:00', end: '17:00' }]);
  });
});

describe('COPY_TARGET_GROUPS', () => {
  it('never includes the source day in its own targets', () => {
    for (const group of COPY_TARGET_GROUPS) {
      for (const source of [0, 1, 2, 3, 4, 5, 6]) {
        expect(group.weekdays(source), `${group.id} from ${source}`).not.toContain(source);
      }
    }
  });

  it('resolves the three groups from Monday', () => {
    const byId = new Map(COPY_TARGET_GROUPS.map((group) => [group.id, group.weekdays(MONDAY)]));
    expect(byId.get('weekdays')).toEqual([1, 2, 3, 4]);
    expect(byId.get('every-day')).toEqual([1, 2, 3, 4, 5, 6]);
    expect(byId.get('weekend')).toEqual([5, 6]);
  });
});
