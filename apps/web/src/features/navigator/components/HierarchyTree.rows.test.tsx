import type { ClientSummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { defaultRangeExtractor } from '@tanstack/react-virtual';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useReducer } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { anchorAt, pinnedRange, reanchoredOffset, treeRowHeight } from '../lib/tree-row-geometry';

import { HierarchyTree } from './HierarchyTree';

import { AnnouncerProvider } from '@/components/ui/announcer';

/**
 * **The tree's row height follows the pointer** (dense-row-touch-targets M2, spec §4.4). The
 * virtualizer is a recording stub here: what is under test is what `HierarchyTree` ASKS of it — the
 * height `estimateSize` returns, when it calls `measure()`, and where it scrolls to — which is the
 * arithmetic a real browser cannot be made to reproduce in a journey (Playwright cannot flip
 * `pointer` mid-session). The real virtualizer, and focus across the flip, are
 * `HierarchyTree.pinning.test.tsx`.
 */
const virtualizer = vi.hoisted(() => ({
  measure: vi.fn(),
  scrollToOffset: vi.fn(),
  options: null as null | { estimateSize: (index: number) => number },
}));

vi.mock('@tanstack/react-virtual', async (importActual) => ({
  // The library's own extractor, so `pinnedRange` below is tested against the real windowing.
  defaultRangeExtractor: (await importActual<{ defaultRangeExtractor: unknown }>())
    .defaultRangeExtractor,
  useVirtualizer: (options: { count: number; estimateSize: (index: number) => number }) => {
    virtualizer.options = options;
    // The real `measure()` notifies the virtualizer, which re-renders the component on its own; the
    // restore is deliberately applied on THAT render (see the effect in `HierarchyTree`), so the
    // stub has to re-render too or the restore would never be reachable.
    const [, rerender] = useReducer((count: number) => count + 1, 0);
    const size = options.estimateSize(0);
    return {
      getTotalSize: () => options.count * size,
      getVirtualItems: () =>
        Array.from({ length: options.count }, (_, index) => ({
          index,
          key: index,
          start: index * size,
          size,
        })),
      scrollToIndex: () => {},
      measure: () => {
        virtualizer.measure();
        rerender();
      },
      scrollToOffset: virtualizer.scrollToOffset,
    };
  },
}));

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
  useParams: () => ({}),
}));

const clients: ClientSummary[] = Array.from({ length: 50 }, (_, i) => ({
  id: `c${String(i)}`,
  name: `Client ${String(i)}`,
  description: null,
  version: 1,
  createdAt: '',
  updatedAt: '',
}));

vi.mock('@/lib/api/client', () => ({
  apiFetch: () => Promise.resolve(clients),
  apiFetchAllPages: () => Promise.resolve(clients),
}));

// A `matchMedia` that answers `(pointer: coarse)` and tells its listeners, as a Surface does when
// the keyboard cover goes on or off.
let coarse = false;
const listeners = new Set<() => void>();
const realMatchMedia = window.matchMedia;

function setPointer(next: boolean): void {
  coarse = next;
  act(() => {
    for (const listener of listeners) listener();
  });
}

beforeEach(() => {
  coarse = false;
  listeners.clear();
  virtualizer.measure.mockReset();
  virtualizer.scrollToOffset.mockReset();
  window.matchMedia = ((query: string) => ({
    get matches() {
      return query.includes('pointer: coarse') && coarse;
    },
    media: query,
    addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
  })) as unknown as typeof window.matchMedia;
});

afterEach(() => {
  window.matchMedia = realMatchMedia;
});

async function renderTree(): Promise<HTMLElement> {
  sessionStorage.clear();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <AnnouncerProvider>
        <HierarchyTree orgSlug="acme" />
      </AnnouncerProvider>
    </QueryClientProvider>,
  );
  await screen.findByRole('treeitem', { name: /Client 49/ });
  return screen.getByRole('tree');
}

/** What the browser reports after a scroll event: jsdom has no layout, so scrollTop is declared. */
function scrollTo(tree: HTMLElement, top: number): void {
  Object.defineProperty(tree, 'scrollTop', { configurable: true, value: top });
  fireEvent.scroll(tree);
}

describe('treeRowHeight', () => {
  it('is 28 for a mouse and 44 for a finger', () => {
    expect(treeRowHeight(false)).toBe(28);
    expect(treeRowHeight(true)).toBe(44);
  });
});

describe('the anchor arithmetic (spec §4.4)', () => {
  it('keeps the row and the fraction into it: fine → coarse', () => {
    expect(reanchoredOffset(anchorAt(300, 28), 44)).toBeCloseTo(471.43, 2);
  });

  it('keeps the row and the fraction into it: coarse → fine', () => {
    expect(reanchoredOffset(anchorAt(471.4286, 44), 28)).toBeCloseTo(300, 2);
  });

  it('asks for 1018.18 from the end of the list, which the browser then limits', () => {
    expect(reanchoredOffset(anchorAt(1600, 44), 28)).toBeCloseTo(1018.18, 2);
  });
});

describe('pinnedRange', () => {
  const range = { startIndex: 0, endIndex: 5, overscan: 2, count: 100 };

  it('adds the pinned indexes to a window that excludes them, in order', () => {
    expect(pinnedRange(defaultRangeExtractor(range), [40, 20])).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 20, 40,
    ]);
  });

  it('ignores an absent pin (-1) and a pin already inside the window', () => {
    expect(pinnedRange(defaultRangeExtractor(range), [-1, 3])).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });
});

describe('HierarchyTree rows follow the pointer', () => {
  it('asks the virtualizer for the height of the pointer in use, live', async () => {
    await renderTree();
    expect(virtualizer.options?.estimateSize(0)).toBe(28);
    setPointer(true);
    expect(virtualizer.options?.estimateSize(0)).toBe(44);
    setPointer(false);
    expect(virtualizer.options?.estimateSize(0)).toBe(28);
  });

  it.each([
    [false, 28],
    [true, 44],
  ])('lays every row out at index × height (coarse: %s)', async (isCoarse, height) => {
    coarse = isCoarse;
    await renderTree();
    const items = screen.getAllByRole('treeitem');
    expect(items).toHaveLength(50);
    items.forEach((item, index) => {
      expect(item.style.height).toBe(`${String(height)}px`);
      expect(item.style.transform).toBe(`translateY(${String(index * height)}px)`);
    });
  });

  it('measures once per change and never on mount or on an unrelated render', async () => {
    await renderTree();
    expect(virtualizer.measure).not.toHaveBeenCalled();
    expect(virtualizer.scrollToOffset).not.toHaveBeenCalled();
    setPointer(true);
    expect(virtualizer.measure).toHaveBeenCalledTimes(1);
    setPointer(true);
    expect(virtualizer.measure).toHaveBeenCalledTimes(1);
    setPointer(false);
    expect(virtualizer.measure).toHaveBeenCalledTimes(2);
  });

  it('re-anchors fine → coarse: 300 becomes 471.43', async () => {
    const tree = await renderTree();
    scrollTo(tree, 300);
    setPointer(true);
    expect(virtualizer.scrollToOffset).toHaveBeenCalledTimes(1);
    expect(virtualizer.scrollToOffset.mock.calls[0]?.[0]).toBeCloseTo(471.43, 2);
  });

  it('re-anchors coarse → fine: 471.43 becomes 300', async () => {
    coarse = true;
    const tree = await renderTree();
    scrollTo(tree, 471.4286);
    setPointer(false);
    expect(virtualizer.scrollToOffset.mock.calls[0]?.[0]).toBeCloseTo(300, 2);
  });

  it('restores from the tracked anchor, not from a scrollTop read at flip time (defensive)', async () => {
    coarse = true;
    const tree = await renderTree();
    scrollTo(tree, 1600);
    // Should `scrollTop` already differ when the flip lands (no scroll event handled yet), the
    // restore must still start from the last position the user scrolled to. Reading `scrollTop`
    // here would ask for 800 × 28/44 and land far short. This is NOT how the browser limits the
    // offset in practice (that is the stale-sizer case in `HierarchyTree.pinning.test.tsx`).
    Object.defineProperty(tree, 'scrollTop', { configurable: true, value: 800 });
    setPointer(false);
    expect(virtualizer.scrollToOffset.mock.calls[0]?.[0]).toBeCloseTo(1018.18, 2);
  });

  it('applies the restore on the re-render measure() causes, not in the same commit', async () => {
    const tree = await renderTree();
    scrollTo(tree, 300);
    const order: string[] = [];
    virtualizer.measure.mockImplementation(() => order.push('measure'));
    virtualizer.scrollToOffset.mockImplementation(() => order.push('scroll'));
    setPointer(true);
    // measure() first; the scroll only after it, on the next commit when the sizer is the new height.
    expect(order).toEqual(['measure', 'scroll']);
  });

  it('keeps tracking from the re-based anchor across a second flip', async () => {
    const tree = await renderTree();
    scrollTo(tree, 300);
    setPointer(true);
    setPointer(false);
    // No scroll event between the flips, so the second restore starts from the first one's result.
    expect(virtualizer.scrollToOffset.mock.calls[1]?.[0]).toBeCloseTo(300, 2);
  });
});
