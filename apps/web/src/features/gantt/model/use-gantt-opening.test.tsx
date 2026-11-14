import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { narrowThreshold } from '../layout/narrow-default';
import { pinnedExtraWidth } from '../layout/pinned-geometry';

import { DEFAULT_HIDDEN_COLUMNS, NARROW_DEFAULT_HIDDEN } from './gantt-view-state';
import { useGanttOpening } from './use-gantt-opening';

const THRESHOLD = narrowThreshold({
  swimlanesOffered: false,
  extraPinned: pinnedExtraWidth(false, true),
  codeCount: 0,
});
const UNSTATED = { stated: false } as const;

/** A frame whose measured width the test sets, since jsdom lays nothing out. */
function frame(width: number): { current: HTMLElement; set: (w: number) => void } {
  const element = document.createElement('div');
  let current = width;
  element.getBoundingClientRect = () => ({ width: current }) as DOMRect;
  return { current: element, set: (w) => void (current = w) };
}

let observers: Array<() => void> = [];
beforeEach(() => {
  observers = [];
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(private readonly callback: () => void) {}
      observe(): void {
        observers.push(this.callback);
      }
      disconnect(): void {}
    },
  );
});
afterEach(() => vi.unstubAllGlobals());

const names = (set: ReadonlySet<string>): string[] => [...set].sort();

interface OpeningProps {
  active: boolean;
  openingKey: string;
  ready?: boolean;
}

function render(width: number, parsed: Parameters<typeof useGanttOpening>[0]['parsed'] = UNSTATED) {
  const ref = frame(width);
  const hook = renderHook<ReturnType<typeof useGanttOpening>, OpeningProps>(
    (props) =>
      useGanttOpening({ frameRef: ref, parsed, threshold: THRESHOLD, ready: true, ...props }),
    {
      initialProps: { active: true, openingKey: 'plan-1' },
    },
  );
  return { ref, ...hook };
}

describe('useGanttOpening', () => {
  it('opens a narrow frame without Code and Finish, and says why', () => {
    const { result } = render(THRESHOLD - 1);
    expect(names(result.current.hidden)).toEqual(names(new Set(NARROW_DEFAULT_HIDDEN)));
    expect(result.current.narrowDefault).toBe(true);
  });

  it('opens a wide frame with the usual columns', () => {
    const { result } = render(THRESHOLD);
    expect(names(result.current.hidden)).toEqual(names(new Set(DEFAULT_HIDDEN_COLUMNS)));
    expect(result.current.narrowDefault).toBe(false);
  });

  it('keeps the usual columns when no width can be read', () => {
    const { result } = render(0);
    expect(names(result.current.hidden)).toEqual(names(new Set(DEFAULT_HIDDEN_COLUMNS)));
    expect(result.current.narrowDefault).toBe(false);
  });

  it('takes the first real width of a frame that was not laid out yet', () => {
    const { ref, result } = render(0);
    act(() => {
      ref.set(500);
      observers.forEach((callback) => callback());
    });
    expect(result.current.narrowDefault).toBe(true);
  });

  it('never consults the width for a stated choice, `none` included', () => {
    const none = render(300, { stated: true, hidden: new Set() });
    expect(none.result.current.hidden.size).toBe(0);
    expect(none.result.current.narrowDefault).toBe(false);
    const listed = render(300, { stated: true, hidden: new Set(['duration']) });
    expect(names(listed.result.current.hidden)).toEqual(['duration']);
  });

  it('decides once: a later resize changes nothing until the view is opened again', () => {
    const { ref, result, rerender } = render(THRESHOLD + 400);
    expect(result.current.narrowDefault).toBe(false);

    ref.set(300);
    rerender({ active: true, openingKey: 'plan-1' });
    expect(result.current.narrowDefault).toBe(false);

    rerender({ active: false, openingKey: 'plan-1' });
    rerender({ active: true, openingKey: 'plan-1' });
    expect(result.current.narrowDefault).toBe(true);
  });

  it('decides again for another plan', () => {
    const { ref, result, rerender } = render(THRESHOLD + 400);
    ref.set(300);
    rerender({ active: true, openingKey: 'plan-2' });
    expect(result.current.narrowDefault).toBe(true);
  });

  it('prints the standard set when nothing is stated, and the stated set when it is', () => {
    expect(names(render(300).result.current.printHidden)).toEqual(
      names(new Set(DEFAULT_HIDDEN_COLUMNS)),
    );
    const stated = render(300, { stated: true, hidden: new Set(['code']) });
    expect(names(stated.result.current.printHidden)).toEqual(['code']);
  });

  it('holds the columns the view opened with, whatever is ticked afterwards', () => {
    const ref = frame(300);
    const { result, rerender } = renderHook(
      ({ parsed }: { parsed: Parameters<typeof useGanttOpening>[0]['parsed'] }) =>
        useGanttOpening({
          frameRef: ref,
          active: true,
          openingKey: 'plan-1',
          ready: true,
          parsed,
          threshold: THRESHOLD,
        }),
      { initialProps: { parsed: UNSTATED as Parameters<typeof useGanttOpening>[0]['parsed'] } },
    );
    expect(names(result.current.openingHidden)).toEqual(names(new Set(NARROW_DEFAULT_HIDDEN)));
    rerender({ parsed: { stated: true, hidden: new Set(['predecessors']) } });
    expect(names(result.current.hidden)).toEqual(['predecessors']);
    expect(names(result.current.openingHidden)).toEqual(names(new Set(NARROW_DEFAULT_HIDDEN)));
  });

  it('waits for what the threshold depends on, and decides against it once it is there', () => {
    const { result, rerender } = render(THRESHOLD - 1);
    rerender({ active: true, openingKey: 'plan-1', ready: false });
    // A fresh opening that is not ready yet keeps the usual columns.
    rerender({ active: false, openingKey: 'plan-1', ready: false });
    rerender({ active: true, openingKey: 'plan-1', ready: false });
    expect(result.current.narrowDefault).toBe(false);
    rerender({ active: true, openingKey: 'plan-1', ready: true });
    expect(result.current.narrowDefault).toBe(true);
  });

  it('holds that the view opened narrow, even once a choice is stated', () => {
    const ref = frame(300);
    const { result, rerender } = renderHook(
      ({ parsed }: { parsed: Parameters<typeof useGanttOpening>[0]['parsed'] }) =>
        useGanttOpening({
          frameRef: ref,
          active: true,
          openingKey: 'plan-1',
          ready: true,
          parsed,
          threshold: THRESHOLD,
        }),
      { initialProps: { parsed: UNSTATED as Parameters<typeof useGanttOpening>[0]['parsed'] } },
    );
    expect(result.current.openingNarrow).toBe(true);
    rerender({ parsed: { stated: true, hidden: new Set(['predecessors']) } });
    expect(result.current.narrowDefault).toBe(false);
    expect(result.current.openingNarrow).toBe(true);
  });

  it('does not open narrow for a stated choice, or a wide frame', () => {
    expect(render(300, { stated: true, hidden: new Set() }).result.current.openingNarrow).toBe(
      false,
    );
    expect(render(THRESHOLD).result.current.openingNarrow).toBe(false);
  });
});
