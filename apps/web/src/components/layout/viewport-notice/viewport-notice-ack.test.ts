import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  acknowledgeNotice,
  dismissNoticeForVisit,
  readNoticeMemory,
  resetNoticeMemoryForTests,
  subscribeNoticeMemory,
  VIEWPORT_NOTICE_ACK_KEY,
} from './viewport-notice-ack';

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  resetNoticeMemoryForTests();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the acknowledgement store', () => {
  it('uses one exported key, and only the exact string "1" counts', () => {
    expect(VIEWPORT_NOTICE_ACK_KEY).toBe('schedulepoint:viewport-notice-acknowledged');
    for (const value of ['true', '0', '', ' 1', '11']) {
      localStorage.setItem(VIEWPORT_NOTICE_ACK_KEY, value);
      expect(readNoticeMemory(), `"${value}"`).toBeNull();
    }
    localStorage.setItem(VIEWPORT_NOTICE_ACK_KEY, '1');
    expect(readNoticeMemory()).toBe('acknowledged');
  });

  it('writes the acknowledgement to localStorage and the dismissal only to sessionStorage', () => {
    dismissNoticeForVisit();
    expect(localStorage.length).toBe(0);
    expect(readNoticeMemory()).toBe('dismissed');

    acknowledgeNotice();
    expect(localStorage.getItem(VIEWPORT_NOTICE_ACK_KEY)).toBe('1');
    expect(readNoticeMemory()).toBe('acknowledged');
  });

  it('reads a throwing storage as "not acknowledged" without raising', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(readNoticeMemory()).toBeNull();
  });

  it('falls back from localStorage to sessionStorage when the first write throws', () => {
    const real = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
      this: Storage,
      key: string,
      value: string,
    ) {
      if (this === window.localStorage) throw new Error('quota');
      real.call(this, key, value);
    });
    expect(() => {
      acknowledgeNotice();
    }).not.toThrow();
    expect(sessionStorage.getItem(VIEWPORT_NOTICE_ACK_KEY)).toBe('1');
    expect(readNoticeMemory()).toBe('acknowledged');
  });

  it('falls back to module memory when every storage throws, for both answers', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    dismissNoticeForVisit();
    expect(readNoticeMemory()).toBe('dismissed');
    acknowledgeNotice();
    expect(readNoticeMemory()).toBe('acknowledged');
  });

  it('notifies subscribers of its own writes and of another tab’s storage event, then stops', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeNoticeMemory(listener);

    acknowledgeNotice();
    expect(listener).toHaveBeenCalledTimes(1);

    window.dispatchEvent(new StorageEvent('storage', { key: VIEWPORT_NOTICE_ACK_KEY }));
    expect(listener).toHaveBeenCalledTimes(2);
    window.dispatchEvent(new StorageEvent('storage', { key: 'unrelated' }));
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    window.dispatchEvent(new StorageEvent('storage', { key: VIEWPORT_NOTICE_ACK_KEY }));
    dismissNoticeForVisit();
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
