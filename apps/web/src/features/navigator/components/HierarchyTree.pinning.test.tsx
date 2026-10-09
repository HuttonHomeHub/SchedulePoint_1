import type { ClientSummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { NavigatorCrudProvider, type NavigatorCrudApi } from '../lib/navigator-crud-context';

import { HierarchyTree } from './HierarchyTree';

import { AnnouncerProvider } from '@/components/ui/announcer';

/**
 * **Focus survives a pointer change, against the REAL virtualizer** (dense-row-touch-targets M2,
 * ADR-0111). `HierarchyTree.test.tsx` and its siblings replace `useVirtualizer` with a stub that
 * renders every row and never calls `rangeExtractor`, so they cannot see a pinned row at all: the
 * pinning could be deleted and every one of them would stay green. Here the library is real, the
 * scroller is given a 600 px height, and the focused row sits well outside the window it would
 * otherwise mount — so it is on the page only because `pinnedRange` put it there.
 *
 * What this does NOT prove: that a browser leaves focus on a node whose `top`/`height` changed.
 * jsdom has no layout, so the check is the DOM identity (`document.activeElement` is the same
 * node, still connected) and the virtualizer's own geometry. Playwright cannot flip the pointer
 * mid-session, so the fold-with-focus step is on the device sheet.
 */
const clients: ClientSummary[] = Array.from({ length: 50 }, (_, i) => ({
  id: `c${String(i)}`,
  name: `Client ${String(i)}`,
  description: null,
  version: 1,
  createdAt: '',
  updatedAt: '',
}));

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
  useParams: () => ({}),
}));

vi.mock('@/lib/api/client', () => ({
  apiFetch: () => Promise.resolve(clients),
  apiFetchAllPages: () => Promise.resolve(clients),
}));

let coarse = false;
const listeners = new Set<() => void>();
const realMatchMedia = window.matchMedia;
const realScrollTo = Element.prototype.scrollTo;
const realOffsetHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight');
const scrollTo = vi.fn();

function setPointer(next: boolean): void {
  coarse = next;
  act(() => {
    for (const listener of listeners) listener();
  });
}

beforeEach(() => {
  coarse = false;
  listeners.clear();
  scrollTo.mockClear();
  window.matchMedia = ((query: string) => ({
    get matches() {
      return query.includes('pointer: coarse') && coarse;
    },
    media: query,
    addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
  })) as unknown as typeof window.matchMedia;
  // The virtualizer sizes its window from the scroller's `offsetHeight` (jsdom: 0, which would
  // window every row out) and `Element.prototype.scrollTo` (jsdom: absent).
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
    configurable: true,
    get: () => 600,
  });
  Element.prototype.scrollTo = scrollTo;
});

afterEach(() => {
  window.matchMedia = realMatchMedia;
  Element.prototype.scrollTo = realScrollTo;
  if (realOffsetHeight)
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', realOffsetHeight);
  else Reflect.deleteProperty(HTMLElement.prototype, 'offsetHeight');
});

const crud: NavigatorCrudApi = {
  canWrite: true,
  onNodeAction: () => {},
  onCreateClient: () => {},
  afterDelete: null,
};

/** Renders the tree and focuses the LAST row by keyboard, far outside the default window. */
async function renderWithFarRowFocused(): Promise<HTMLElement> {
  sessionStorage.clear();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <AnnouncerProvider>
        <NavigatorCrudProvider value={crud}>
          <HierarchyTree orgSlug="acme" />
        </NavigatorCrudProvider>
      </AnnouncerProvider>
    </QueryClientProvider>,
  );
  const first = await screen.findByRole('treeitem', { name: /Client 0/ });
  // 600 px / 28 px plus the overscan of 10 mounts about 32 rows: the last of 50 is not among them.
  expect(screen.queryByRole('treeitem', { name: /Client 49/ })).toBeNull();
  first.focus();
  fireEvent.keyDown(screen.getByRole('tree'), { key: 'End' });
  return screen.findByRole('treeitem', { name: /Client 49/ });
}

describe('HierarchyTree pins the focused row through a pointer change', () => {
  it('keeps the focused row mounted, focused and at index × 44 across the flip', async () => {
    const row = await renderWithFarRowFocused();
    expect(document.activeElement).toBe(row);
    expect(row.style.transform).toBe(`translateY(${String(49 * 28)}px)`);

    setPointer(true);

    expect(document.activeElement).toBe(row);
    expect(row.isConnected).toBe(true);
    expect(row.style.height).toBe('44px');
    // `measure()` is what moves it: the virtualizer would otherwise keep its cached 28 px sizes.
    expect(row.style.transform).toBe(`translateY(${String(49 * 44)}px)`);
  });

  it('keeps focus on the row’s own “⋯” button, which is not a tab stop', async () => {
    const row = await renderWithFarRowFocused();
    const more = row.querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]');
    if (!more) throw new Error('the focused row has no “⋯” button');
    more.focus();
    expect(document.activeElement).toBe(more);

    setPointer(true);

    expect(document.activeElement).toBe(more);
    expect(more.isConnected).toBe(true);
    expect(row.style.transform).toBe(`translateY(${String(49 * 44)}px)`);

    setPointer(false);

    expect(document.activeElement).toBe(more);
    expect(row.style.transform).toBe(`translateY(${String(49 * 28)}px)`);
  });

  it('lands on the same rows: the final scroll is scrollTop × 44/28 against a real-height sizer', async () => {
    await renderWithFarRowFocused();
    const tree = screen.getByRole('tree');
    const sizer = tree.firstElementChild as HTMLElement;
    // jsdom has no layout (scrollHeight and clientHeight are 0, so every clamp would be to 0). Give
    // the scroller what a browser gives it: a viewport of 600 and a scrollable height that FOLLOWS
    // THE SIZER'S CURRENT style.height (plus the scroller's 8 px of vertical padding). That is the
    // property the defect turns on — the virtualizer clamps `scrollToOffset` to this maximum, and
    // in the commit where the pointer flips the sizer is still the old height.
    Object.defineProperty(tree, 'clientHeight', { configurable: true, value: 600 });
    Object.defineProperty(tree, 'scrollHeight', {
      configurable: true,
      get: () => Number.parseFloat(sizer.style.height) + 8,
    });
    // 70 % of the 1400 px range: past the ~60 % where a clamp to the OLD maximum (808) bites.
    Object.defineProperty(tree, 'scrollTop', { configurable: true, value: 1000 });
    fireEvent.scroll(tree);
    scrollTo.mockClear();

    setPointer(true);

    const lastTop = (scrollTo.mock.lastCall?.[0] as { top: number } | undefined)?.top;
    // 1000 px at 28 px is row 35.7; at 44 px that is 1571.43 — inside the new maximum of 1608.
    expect(lastTop).toBeCloseTo((1000 * 44) / 28, 1);
  });
});
