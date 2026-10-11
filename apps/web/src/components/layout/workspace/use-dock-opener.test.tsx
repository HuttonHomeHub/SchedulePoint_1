import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useDockOpener } from './use-dock-opener';

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

const mount = (html: string): void => {
  document.body.innerHTML = html;
};

describe('useDockOpener', () => {
  it('hands back the control that held focus when the panel opened', () => {
    mount('<button id="a">A</button>');
    const a = document.getElementById('a')!;
    a.focus();
    const { result } = renderHook(() => useDockOpener());
    result.current.remember();
    expect(result.current.take()).toBe(a);
    // Taking forgets it: a second close has no opener to return to.
    expect(result.current.take()).toBeNull();
  });

  it('returns null when the opener has left the document', () => {
    mount('<button id="a">A</button>');
    document.getElementById('a')!.focus();
    const { result } = renderHook(() => useDockOpener());
    result.current.remember();
    document.body.innerHTML = '';
    expect(result.current.take()).toBeNull();
  });

  it('records nothing when focus is on <body>', () => {
    const { result } = renderHook(() => useDockOpener());
    result.current.remember();
    expect(result.current.take()).toBeNull();
  });

  it('resolves a menu item to the control focus returns to after the menu closes', () => {
    mount('<button id="trigger">⋯</button><div role="menu"><button id="item">Float</button></div>');
    const frames: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => frames.push(cb));
    document.getElementById('item')!.focus();
    const { result } = renderHook(() => useDockOpener());
    result.current.remember();
    // The menu unmounts and hands focus to its trigger before the next frame.
    document.querySelector('[role="menu"]')!.remove();
    document.getElementById('trigger')!.focus();
    act(() => frames.forEach((cb) => cb(0)));
    expect(result.current.take()).toBe(document.getElementById('trigger'));
  });
});
