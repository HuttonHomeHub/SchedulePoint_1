import type { ClientSummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { Profiler, useReducer } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { HierarchyTree } from './HierarchyTree';

import { AnnouncerProvider } from '@/components/ui/announcer';

/**
 * **Scrolling must not re-render the tree, and a pointer flip costs two commits and one
 * `measure()`** (dense-row-touch-targets M2, performance review). The scroll position the flip
 * re-anchors from lives in a ref written on every `scroll` event: were it ever promoted to state,
 * a fling would re-render the whole tree at event rate. A count rather than a timing, because
 * jsdom has no layout to time and a count does not flake (the shape of
 * `ActivitiesTable.render-count.test.tsx`).
 *
 * The virtualizer is a recording stub, so its own scroll-driven renders (which the library does
 * for the window and `isScrolling`) cannot mask the tree's: whatever commits here, `HierarchyTree`
 * caused. The stub re-renders on `measure()` as the library does.
 */
const virtualizer = vi.hoisted(() => ({ measure: vi.fn() }));

vi.mock('@tanstack/react-virtual', async (importActual) => ({
  defaultRangeExtractor: (await importActual<{ defaultRangeExtractor: unknown }>())
    .defaultRangeExtractor,
  useVirtualizer: (options: { count: number; estimateSize: (index: number) => number }) => {
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
      scrollToOffset: () => {},
    };
  },
}));

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
  useParams: () => ({}),
}));

const clients: ClientSummary[] = Array.from({ length: 30 }, (_, i) => ({
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

let coarse = false;
const listeners = new Set<() => void>();
const realMatchMedia = window.matchMedia;
let commits = 0;

beforeEach(() => {
  coarse = false;
  commits = 0;
  listeners.clear();
  virtualizer.measure.mockReset();
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
        <Profiler
          id="tree"
          onRender={() => {
            commits += 1;
          }}
        >
          <HierarchyTree orgSlug="acme" />
        </Profiler>
      </AnnouncerProvider>
    </QueryClientProvider>,
  );
  await screen.findByRole('treeitem', { name: /Client 29/ });
  return screen.getByRole('tree');
}

describe('HierarchyTree render count', () => {
  it('does not re-render on scroll events', async () => {
    const tree = await renderTree();
    const before = commits;
    for (let top = 40; top <= 400; top += 40) {
      Object.defineProperty(tree, 'scrollTop', { configurable: true, value: top });
      fireEvent.scroll(tree);
    }
    expect(commits - before).toBe(0);
  });

  it('flips the pointer in at most two commits and one measure()', async () => {
    await renderTree();
    const before = commits;
    coarse = true;
    act(() => {
      for (const listener of listeners) listener();
    });
    expect(commits - before).toBeLessThanOrEqual(2);
    expect(virtualizer.measure).toHaveBeenCalledTimes(1);
  });
});
