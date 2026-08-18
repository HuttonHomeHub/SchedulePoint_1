import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { GANTT_ROW_HEIGHT, GanttPanel } from './GanttPanel';

import { MAX_COLLAPSED_IN_URL } from '@/features/gantt/model/gantt-view-state';
import type { GanttViewStateBundle } from '@/features/gantt/model/use-gantt-view-state';
import { anActivity } from '@/test/activity-fixture';

/**
 * **The collapse cap has to SAY what it withheld — the sibling of the link cap.**
 *
 * `serialiseCollapsed` computed `withheld` from the day it shipped, its docblock said the count was
 * "reported rather than silently truncated", and both ADR-0095 and `docs/TECH_DEBT.md` #136
 * recorded it as reported. Nothing read it. A planner with more than 40 collapsed phases reloaded,
 * watched some re-expand, and was told nothing — a reader drawing a conclusion from an absence that
 * is an artefact.
 *
 * The unit case that existed (`gantt-view-state.test.ts` "reports what the cap withheld") passed
 * throughout, because it drives the pure function the UI never called. That is exactly why this one
 * renders the panel instead: the gap was never in the arithmetic, it was in whether anything asked.
 *
 * Verified RED before the banner was added.
 */

vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getTotalSize: () => count * GANTT_ROW_HEIGHT,
    getVirtualItems: () =>
      Array.from({ length: count }, (_, index) => ({
        index,
        key: index,
        start: index * GANTT_ROW_HEIGHT,
        size: GANTT_ROW_HEIGHT,
      })),
    scrollToIndex: () => {},
  }),
}));

const ROWS = [anActivity({ id: 'a', name: 'Excavate' })];

function bundle(withheld: number): GanttViewStateBundle {
  return {
    sort: { key: 'name', direction: 'asc' },
    hiddenColumns: new Set(),
    collapsed: new Set(),
    onSortChange: () => {},
    onHiddenColumnsChange: () => {},
    onCollapsedChange: () => {},
    collapsedWithheld: withheld,
  };
}

function renderPanel(viewState?: GanttViewStateBundle) {
  return render(<GanttPanel activities={ROWS} {...(viewState ? { viewState } : {})} />);
}

describe('the collapse cap', () => {
  it('tells the reader when the URL could not carry every collapsed section', () => {
    renderPanel(bundle(3));
    const status = screen
      .getAllByRole('status')
      .find((el) => /collapsed/.test(el.textContent ?? ''));
    expect(status, 'no status names the withheld collapse count').toBeDefined();
    expect(status?.textContent).toContain('3');
    // The cap itself is named, so the reader can tell a limit from a fault.
    expect(status?.textContent).toContain(String(MAX_COLLAPSED_IN_URL));
  });

  it('says nothing when nothing was withheld', () => {
    // A banner that is always present is a banner nobody reads, and "0 sections withheld" states a
    // problem the planner does not have.
    renderPanel(bundle(0));
    expect(
      screen.queryAllByRole('status').filter((el) => /collapsed/.test(el.textContent ?? '')),
    ).toHaveLength(0);
  });

  it('says nothing when the panel has no view state at all', () => {
    // The parity contract: a panel with no `viewState` — the print surface and every pre-existing
    // test — renders exactly what it always did.
    renderPanel();
    expect(
      screen.queryAllByRole('status').filter((el) => /collapsed/.test(el.textContent ?? '')),
    ).toHaveLength(0);
  });
});
