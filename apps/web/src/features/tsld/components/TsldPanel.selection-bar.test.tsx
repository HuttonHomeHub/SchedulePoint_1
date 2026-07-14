import type { ActivitySummary, DependencySummary } from '@repo/types';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TsldPanel } from './TsldPanel';

/**
 * The floating selection-actions bar (ADR-0031, TECH_DEBT #31a) is now **mounted**: when the host
 * wires the object actions (open-logic + edit + delete) and an activity is selected, TsldPanel
 * renders the portaled `SelectionActionsBar` over the canvas. It follows the canvas imperatively via
 * an anchor ref written each frame; under jsdom (no real layout) the anchor never resolves on-surface
 * so the bar stays `visibility:hidden` — which zeroes the accessible name, so we match the toolbar by
 * its `aria-label` attribute and its buttons by text/`aria-disabled`. Positioning + the a11y name are
 * covered against a real anchor in `selection-actions.test.tsx`; here we prove the wiring is live.
 */

function activity(over: Partial<ActivitySummary> = {}): ActivitySummary {
  return {
    id: 'a1',
    planId: 'p1',
    code: null,
    name: 'Survey',
    description: null,
    type: 'TASK',
    durationDays: 3,
    constraintType: null,
    constraintDate: null,
    laneIndex: 0,
    status: 'NOT_STARTED',
    percentComplete: 0,
    actualStart: null,
    actualFinish: null,
    earlyStart: '2026-01-01',
    earlyFinish: '2026-01-03',
    lateStart: '2026-01-01',
    lateFinish: '2026-01-03',
    totalFloat: 0,
    isCritical: false,
    isNearCritical: false,
    visualStart: null,
    visualEffectiveStart: null,
    visualEffectiveFinish: null,
    visualConflict: false,
    visualDriftDays: null,
    version: 1,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...over,
  };
}

const A = activity({ id: 'a1', name: 'Survey' });
const NO_DEPS: DependencySummary[] = [];

const handlers = () => ({
  onOpenLogic: vi.fn(),
  onEditActivity: vi.fn(),
  onDeleteActivity: vi.fn(),
});

/** Render the panel and select the first activity via the parallel listbox (as a keyboard user would). */
function renderWithSelection(props: Record<string, unknown>) {
  const utils = render(
    <TsldPanel activities={[A]} dependencies={NO_DEPS} dataDate="2026-01-01" {...props} />,
  );
  fireEvent.focus(screen.getByRole('listbox', { name: 'Activities in the diagram' }));
  return utils;
}

/** The floating bar, matched by its `aria-label` (its accessible name is zeroed while hidden). */
function selectionBar(): HTMLElement | undefined {
  return screen
    .queryAllByRole('toolbar', { hidden: true })
    .find((t) => t.getAttribute('aria-label') === 'Actions for Survey');
}

/** A bar button by its Tier-1 text label (name computation is unavailable on the hidden bar). */
function barButton(bar: HTMLElement, label: string): HTMLElement {
  const btn = within(bar)
    .getAllByRole('button', { hidden: true })
    .find((b) => b.textContent?.trim() === label);
  if (!btn) throw new Error(`no bar button labelled "${label}"`);
  return btn;
}

describe('TsldPanel — floating selection-actions bar (mount)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders no floating bar until the host wires the object actions', () => {
    // onOpenLogic alone (a read seam) does not mount the bar — edit + delete are required.
    renderWithSelection({ onOpenLogic: vi.fn() });
    expect(selectionBar()).toBeUndefined();
  });

  it('shows the bar for the selected activity once the object actions are wired', () => {
    renderWithSelection(handlers());
    expect(selectionBar()).toBeDefined();
  });

  it('opens logic from the bar even without edit rights', () => {
    const h = handlers();
    renderWithSelection({ ...h, canEdit: false });
    fireEvent.click(barButton(selectionBar()!, 'Open logic'));
    expect(h.onOpenLogic).toHaveBeenCalledWith(expect.objectContaining({ id: 'a1' }));
  });

  it('pen-gates edit/delete when the viewer cannot edit the schedule', () => {
    const h = handlers();
    renderWithSelection({ ...h, canEdit: false });
    const bar = selectionBar()!;
    for (const label of ['Edit activity', 'Delete activity']) {
      const btn = barButton(bar, label);
      expect(btn).toHaveAttribute('aria-disabled', 'true');
      fireEvent.click(btn);
    }
    expect(h.onEditActivity).not.toHaveBeenCalled();
    expect(h.onDeleteActivity).not.toHaveBeenCalled();
  });

  it('runs edit and delete on the selected activity when editing is allowed', () => {
    const h = handlers();
    renderWithSelection({ ...h, canEdit: true });
    const bar = selectionBar()!;
    fireEvent.click(barButton(bar, 'Edit activity'));
    fireEvent.click(barButton(bar, 'Delete activity'));
    expect(h.onEditActivity).toHaveBeenCalledWith(expect.objectContaining({ id: 'a1' }));
    expect(h.onDeleteActivity).toHaveBeenCalledWith(expect.objectContaining({ id: 'a1' }));
  });
});
