import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TOUCH_ARM_HINT, takeTouchHint, touchSelectionNote } from './touch-note';

describe('touchSelectionNote', () => {
  it('gives a refused bar its reason, and never spends the hint on it', () => {
    const hintDue = vi.fn(() => true);
    expect(
      touchSelectionNote(
        { movable: false, reason: 'A summary follows the activities inside it.' },
        hintDue,
      ),
    ).toBe('A summary follows the activities inside it.');
    expect(hintDue).not.toHaveBeenCalled();
  });

  it('says nothing for a refused bar that has no reason', () => {
    expect(touchSelectionNote({ movable: false, reason: null }, () => true)).toBeNull();
  });

  it('gives a movable bar the hint when it is due, and nothing when it is not', () => {
    expect(touchSelectionNote({ movable: true, reason: null }, () => true)).toBe(TOUCH_ARM_HINT);
    expect(touchSelectionNote({ movable: true, reason: null }, () => false)).toBeNull();
  });
});

describe('takeTouchHint', () => {
  beforeEach(() => window.sessionStorage.clear());

  it('is true once per session', () => {
    expect(takeTouchHint()).toBe(true);
    expect(takeTouchHint()).toBe(false);
  });

  it('is true again if storage is unavailable, rather than never', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    expect(takeTouchHint()).toBe(true);
    expect(takeTouchHint()).toBe(true);
    spy.mockRestore();
  });
});
