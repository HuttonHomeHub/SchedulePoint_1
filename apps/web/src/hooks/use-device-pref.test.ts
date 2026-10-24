import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useDevicePref } from './use-device-pref';

const KEY = 'schedulepoint-test-pref';
const parse = (raw: unknown): { on: boolean } => ({
  on: typeof raw === 'object' && raw !== null && (raw as { on?: unknown }).on === true,
});

beforeEach(() => localStorage.clear());
afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('useDevicePref', () => {
  it('returns the fallback when nothing is stored', () => {
    const { result } = renderHook(() => useDevicePref(KEY, parse, { on: false }));
    expect(result.current[0]).toEqual({ on: false });
  });

  it('persists a change and reads it back on a fresh mount', () => {
    const first = renderHook(() => useDevicePref(KEY, parse, { on: false }));
    act(() => first.result.current[1]({ on: true }));
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual({ on: true });

    const second = renderHook(() => useDevicePref(KEY, parse, { on: false }));
    expect(second.result.current[0]).toEqual({ on: true });
  });

  it('accepts a functional update', () => {
    const { result } = renderHook(() => useDevicePref(KEY, parse, { on: false }));
    act(() => result.current[1]((p) => ({ on: !p.on })));
    expect(result.current[0]).toEqual({ on: true });
  });

  it('falls back on corrupt JSON', () => {
    localStorage.setItem(KEY, '{ not json');
    const { result } = renderHook(() => useDevicePref(KEY, parse, { on: false }));
    expect(result.current[0]).toEqual({ on: false });
  });

  it('lets the parser reject a well-formed but wrong payload', () => {
    localStorage.setItem(KEY, JSON.stringify({ on: 'yes' }));
    const { result } = renderHook(() => useDevicePref(KEY, parse, { on: false }));
    expect(result.current[0]).toEqual({ on: false });
  });

  it('survives storage that refuses reads and writes', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('full');
    });
    const { result } = renderHook(() => useDevicePref(KEY, parse, { on: false }));
    act(() => result.current[1]({ on: true }));
    expect(result.current[0]).toEqual({ on: true });
  });
});
