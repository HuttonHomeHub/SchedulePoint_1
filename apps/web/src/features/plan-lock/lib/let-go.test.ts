import { describe, expect, it } from 'vitest';

import { decideBeat, HIDDEN_LET_GO_MS, IDLE_LET_GO_MS } from './let-go';

const base = { now: 10_000_000, hiddenSince: null, lastInputAt: 10_000_000, hasUnsavedWork: false };

describe('decideBeat', () => {
  it('beats in a visible tab that was just touched', () => {
    expect(decideBeat(base)).toBe('beat');
  });

  it('beats one millisecond short of the idle limit', () => {
    expect(decideBeat({ ...base, lastInputAt: base.now - (IDLE_LET_GO_MS - 1) })).toBe('beat');
  });

  it('skips at exactly the idle limit', () => {
    expect(decideBeat({ ...base, lastInputAt: base.now - IDLE_LET_GO_MS })).toBe('idle');
  });

  it('keeps beating while an editor holds unsaved work, however long it is idle', () => {
    expect(
      decideBeat({ ...base, lastInputAt: base.now - 5 * IDLE_LET_GO_MS, hasUnsavedWork: true }),
    ).toBe('beat');
  });

  it('skips a tab hidden for the hidden limit, and beats just short of it', () => {
    expect(decideBeat({ ...base, hiddenSince: base.now - HIDDEN_LET_GO_MS })).toBe('hidden');
    expect(decideBeat({ ...base, hiddenSince: base.now - (HIDDEN_LET_GO_MS - 1) })).toBe('beat');
  });

  it('leaves D5 unchanged: unsaved work does not keep a hidden tab beating', () => {
    expect(
      decideBeat({ ...base, hiddenSince: base.now - HIDDEN_LET_GO_MS, hasUnsavedWork: true }),
    ).toBe('hidden');
  });

  it('does not count idleness while hidden: a stale input time does not rest a short-hidden tab', () => {
    expect(
      decideBeat({
        ...base,
        hiddenSince: base.now - 60_000,
        lastInputAt: base.now - 2 * IDLE_LET_GO_MS,
      }),
    ).toBe('beat');
  });
});
