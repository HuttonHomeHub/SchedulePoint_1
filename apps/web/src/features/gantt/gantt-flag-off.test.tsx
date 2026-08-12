import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

/**
 * The **rollback contract** (ADR-0059 §5).
 *
 * With `VITE_GANTT_VIEW` off the workspace must be byte-for-byte the surface that shipped before
 * this epic: no view switch in the toolbar, and no way to reach the Gantt — including by URL. That
 * last part is the one worth testing, because it is the one a reviewer would miss: a `?view=gantt`
 * link pasted from a flag-on colleague, or left in a bookmark after a rollback, must resolve to
 * the diagram rather than mounting a surface this deployment does not have.
 *
 * These suites are kept and pinned rather than weakened when the flag flips (the ADR-0053 M6
 * precedent) — a rollback path nobody tests is not a rollback path.
 */
vi.mock('@/config/env', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, GANTT_VIEW_ENABLED: false };
});

const navigate = vi.fn();
let search: Record<string, unknown> = {};

vi.mock('@tanstack/react-router', () => ({
  useSearch: () => search,
  useNavigate: () => navigate,
}));

// Imported after the mocks.
import { usePlanViewMode } from './use-plan-view-mode';

import { buildTsldToolbarItems } from '@/features/tsld/toolbar/tsld-toolbar-items';

describe('flag-off: the toolbar', () => {
  it('registers no view switch', () => {
    const items = buildTsldToolbarItems();
    const viewItems = items.filter((i) => i.id === 'view-tsld' || i.id === 'view-gantt');
    expect(viewItems).toHaveLength(2);
    // Registered but never painted — the seam stays in the code, the surface stays dark.
    for (const item of viewItems) {
      // The band is irrelevant here — this seam is flag-gated, not width-gated — but the predicate
      // now takes it, and passing the roomiest band is the strongest form of the claim: not even a
      // row with every pixel it wants paints this item.
      expect(item.isVisible?.({} as never, { layout: 'comfortable' })).toBe(false);
    }
  });
});

describe('flag-off: the URL cannot reach the Gantt', () => {
  it('resolves ?view=gantt to the diagram', () => {
    search = { view: 'gantt' };
    const { result } = renderHook(() => usePlanViewMode());
    expect(result.current[0]).toBe('tsld');
  });

  it('resolves an absent view to the diagram', () => {
    search = {};
    const { result } = renderHook(() => usePlanViewMode());
    expect(result.current[0]).toBe('tsld');
  });

  it('refuses to navigate when asked to switch', () => {
    search = {};
    const { result } = renderHook(() => usePlanViewMode());
    result.current[1]('gantt');
    expect(navigate).not.toHaveBeenCalled();
  });
});
