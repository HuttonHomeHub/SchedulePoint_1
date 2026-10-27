import { activityHistoryItemKind } from '@repo/types';
import type { PinoLogger } from 'nestjs-pino';
import { describe, expect, it, vi } from 'vitest';

import {
  codeItem,
  codeKey,
  hasNonCostChange,
  isNetZero,
  mergeChanges,
} from './activity-history.diff';
import type { ResolvedNames } from './activity-history.pending';
import { ActivityHistoryRecorder } from './activity-history.recorder';
import { redactChanges } from './activity-history.redaction';

const recorder = () => new ActivityHistoryRecorder({ debug: vi.fn() } as unknown as PinoLogger);

const NO_NAMES: ResolvedNames = {
  calendars: new Map(),
  parents: new Map(),
  resources: new Map(),
  activities: new Map(),
  plans: new Map(),
};

const AREA = '0199c1a2-3b4c-7d5e-8f6a-1b2c3d4e5f60';
const TRADE = '0199c1a2-3b4c-7d5e-8f6a-1b2c3d4e5f61';

describe('code items in the activity history (p6-activity-codes, design D7)', () => {
  it('keys the item by the code TYPE and reads as its own kind, not a field', () => {
    expect(codeKey(AREA)).toBe(`code:${AREA}`);
    expect(activityHistoryItemKind(codeKey(AREA))).toBe('code');
    expect(activityHistoryItemKind('name')).toBe('field');
  });

  it('is net-zero when both sides hold the same value id, including none', () => {
    expect(isNetZero(codeKey(AREA), codeItem('v1', 'v1'))).toBe(true);
    expect(isNetZero(codeKey(AREA), codeItem(null, null))).toBe(true);
    expect(isNetZero(codeKey(AREA), codeItem('v1', 'v2'))).toBe(false);
    expect(isNetZero(codeKey(AREA), codeItem(null, 'v1'))).toBe(false);
  });

  it('merges keeping the original from and the newest to, and drops an item that came back', () => {
    const merged = mergeChanges(
      { [codeKey(AREA)]: codeItem('v1', 'v2') },
      { [codeKey(AREA)]: codeItem('v2', 'v3'), [codeKey(TRADE)]: codeItem(null, 'm') },
    );
    expect(merged).toEqual({
      [codeKey(AREA)]: { from: 'v1', to: 'v3' },
      [codeKey(TRADE)]: { from: null, to: 'm' },
    });
    expect(
      mergeChanges(
        { [codeKey(AREA)]: codeItem('v1', 'v2') },
        { [codeKey(AREA)]: codeItem('v2', 'v1') },
      ),
    ).toEqual({});
  });

  it('is never a cost-only change', () => {
    expect(hasNonCostChange({ [codeKey(AREA)]: codeItem(null, 'v1') })).toBe(true);
  });

  it('is shown to a reader without cost:read: value ids hide nothing', () => {
    const changes = { [codeKey(AREA)]: codeItem('v1', null) };
    expect(redactChanges(changes, false)).toEqual({ [codeKey(AREA)]: { from: 'v1', to: null } });
    expect(redactChanges(changes, true)).toEqual({ [codeKey(AREA)]: { from: 'v1', to: null } });
  });

  describe('codeWrites', () => {
    it('writes one item per type that moved and none for one that did not', () => {
      const [write] = recorder().codeWrites('plan-1', [
        {
          id: 'a1',
          changes: [
            { codeTypeId: AREA, from: 'v1', to: 'v2' },
            { codeTypeId: TRADE, from: 'm', to: 'm' },
          ],
        },
      ]);
      expect(write).toMatchObject({ activityId: 'a1', planId: 'plan-1' });
      expect(write?.changes.keys).toEqual([codeKey(AREA)]);
      expect(write?.changes.build(NO_NAMES)).toEqual({ [codeKey(AREA)]: { from: 'v1', to: 'v2' } });
    });

    it('needs no names, so it asks the probe for none', () => {
      const [write] = recorder().codeWrites('plan-1', [
        { id: 'a1', changes: [{ codeTypeId: AREA, from: null, to: 'v1' }] },
      ]);
      expect(write?.changes.refs).toEqual({
        calendarIds: [],
        parentIds: [],
        swimlaneIds: [],
        resourceIds: [],
        activityIds: [],
      });
    });

    it('records nothing for an activity whose every row re-sent the value it had', () => {
      const [write] = recorder().codeWrites('plan-1', [
        { id: 'a1', changes: [{ codeTypeId: AREA, from: 'v1', to: 'v1' }] },
      ]);
      expect(write?.changes.keys).toEqual([]);
    });
  });
});
