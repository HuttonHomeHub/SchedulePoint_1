import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  readActualSize,
  resetActualSizeForTests,
  setActualSize,
  subscribeActualSize,
  WORKSPACE_ACTUAL_SIZE_KEY,
} from './workspace-scale-pref';

import { storageEvent } from '@/test/storage-event';

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  resetActualSizeForTests();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the actual-size preference', () => {
  it('uses the key the spec names, and only the exact string "1" counts', () => {
    expect(WORKSPACE_ACTUAL_SIZE_KEY).toBe('schedulepoint:workspace-actual-size');
    for (const value of ['true', '0', '', ' 1', '11']) {
      localStorage.setItem(WORKSPACE_ACTUAL_SIZE_KEY, value);
      expect(readActualSize(), `"${value}"`).toBe(false);
    }
    localStorage.setItem(WORKSPACE_ACTUAL_SIZE_KEY, '1');
    expect(readActualSize()).toBe(true);
  });

  it('writes "1" to localStorage and removes the key again, so there is one stored shape', () => {
    setActualSize(true);
    expect(localStorage.getItem(WORKSPACE_ACTUAL_SIZE_KEY)).toBe('1');
    expect(readActualSize()).toBe(true);

    setActualSize(false);
    expect(localStorage.getItem(WORKSPACE_ACTUAL_SIZE_KEY)).toBeNull();
    expect(readActualSize()).toBe(false);
  });

  it('reads a throwing storage as "scale when needed" without raising', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(readActualSize()).toBe(false);
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
      setActualSize(true);
    }).not.toThrow();
    expect(sessionStorage.getItem(WORKSPACE_ACTUAL_SIZE_KEY)).toBe('1');
    expect(readActualSize()).toBe(true);
  });

  it('falls back to module memory when every storage throws, in both directions', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    setActualSize(true);
    expect(readActualSize()).toBe(true);
    setActualSize(false);
    expect(readActualSize()).toBe(false);
  });

  it('notifies subscribers of its own writes and of another tab’s storage event, then stops', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeActualSize(listener);

    setActualSize(true);
    expect(listener).toHaveBeenCalledTimes(1);

    window.dispatchEvent(storageEvent(WORKSPACE_ACTUAL_SIZE_KEY));
    expect(listener).toHaveBeenCalledTimes(2);
    window.dispatchEvent(storageEvent('unrelated'));
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    window.dispatchEvent(storageEvent(WORKSPACE_ACTUAL_SIZE_KEY));
    setActualSize(false);
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
