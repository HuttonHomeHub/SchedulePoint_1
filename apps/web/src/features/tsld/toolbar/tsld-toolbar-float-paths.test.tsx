import type { ActivitySummary } from '@repo/types';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { makeTsldToolbarContext } from './test-helpers';
import type { TsldToolbarContext } from './tsld-toolbar-context';
import { buildTsldToolbarItems } from './tsld-toolbar-items';

import { Toolbar, splitByRow } from '@/components/ui/toolbar';

/**
 * The **Float paths** toolbar item, flag ON (audit F4).
 *
 * Two of these tests exist because the ui-architect review found the plan's ladder wrong:
 *
 * - the item must be **live in the Gantt**, because it is an analysis and not a viewport command
 *   (the ADR-0059 M6 lesson inverted — shade what only the canvas can do, never what both can); and
 * - it must gate on the plan's **activity count**, not `hasDiagram`. `hasDiagram` means *computed*
 *   (it requires a non-null `earlyStart`), while this endpoint runs its own `computeSchedule` per
 *   request — so gating on it would shade the item with "Add an activity first" on a plan that is
 *   full of activities and simply has not been recalculated.
 *
 * The flag-off shape (the item **absent**, not a "Coming soon" stub) is pinned by the parity suite
 * beside this one.
 */

vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  FLOAT_PATHS_ENABLED: true,
  CANVAS_NAV_ENABLED: true,
}));

const SELECTED = { id: 'a1', version: 1, name: 'Excavate' } as unknown as ActivitySummary;

const toggleFloatPaths = vi.fn();

function ctx(over: Partial<TsldToolbarContext> = {}): TsldToolbarContext {
  return makeTsldToolbarContext({
    toggleFloatPaths,
    activityCount: 12,
    selectedActivity: SELECTED,
    ...over,
  });
}

function renderRows(context: TsldToolbarContext) {
  const rows = splitByRow(buildTsldToolbarItems());
  return render(
    <Toolbar
      items={rows.look}
      context={context}
      label="View and navigate"
      authoringEnabled
      alignEndGroup="object"
    />,
  );
}

const floatPathsButton = () => screen.getByRole('button', { name: /float paths/i });

beforeEach(() => vi.clearAllMocks());

describe('TSLD toolbar — Float paths (flag on)', () => {
  it('opens the analysis when activated with an activity selected', () => {
    renderRows(ctx());
    fireEvent.click(floatPathsButton());
    expect(toggleFloatPaths).toHaveBeenCalledOnce();
  });

  it('carries the panel open state as aria-pressed, and closes when pressed again', () => {
    renderRows(ctx({ floatPathsOpen: true }));
    const button = floatPathsButton();
    expect(button).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(button);
    expect(toggleFloatPaths).toHaveBeenCalledOnce();
  });

  it('shades with "Select an activity first" when nothing is selected', () => {
    renderRows(ctx({ selectedActivity: undefined }));
    const button = floatPathsButton();
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button.getAttribute('title')).toMatch(/select an activity first/i);
  });

  it('shades with "Add an activity first" on a genuinely empty plan', () => {
    renderRows(ctx({ activityCount: 0, selectedActivity: undefined }));
    expect(floatPathsButton().getAttribute('title')).toMatch(/add an activity first/i);
  });

  it('stays ENABLED on a plan that has never been recalculated', () => {
    // The endpoint computes the schedule itself. `hasDiagram: false` means "no early dates yet",
    // which is exactly the spec's own edge case — and gating on it would make that case
    // unreachable while telling the planner to add activities they already have.
    renderRows(ctx({ hasDiagram: false }));
    expect(floatPathsButton()).not.toHaveAttribute('aria-disabled', 'true');
  });

  it('stays live in the Gantt view — it is an analysis, not a canvas viewport command', () => {
    renderRows(ctx({ planView: 'gantt', canvasActive: false }));
    expect(floatPathsButton()).not.toHaveAttribute('aria-disabled', 'true');
  });

  it('is never pen-gated: it stays live with authoring disabled', () => {
    const rows = splitByRow(buildTsldToolbarItems());
    render(
      <Toolbar
        items={rows.look}
        context={ctx({ canEditSchedule: false })}
        label="View and navigate"
        authoringEnabled={false}
        alignEndGroup="object"
      />,
    );
    expect(floatPathsButton()).not.toHaveAttribute('aria-disabled', 'true');
  });

  it('shades Isolate in the Gantt, where it drives a canvas that is not mounted', () => {
    // Not a Float-paths behaviour, but a defect this epic made reachable: the Gantt now feeds the
    // workspace selection, so Isolate would otherwise be lit and inert there.
    renderRows(ctx({ planView: 'gantt', canvasActive: false }));
    // The main button of the split control (the chevron is 'Isolate logic path options').
    const isolate = screen.getByRole('button', { name: 'Isolate logic path' });
    expect(isolate).toHaveAttribute('aria-disabled', 'true');
    expect(isolate.getAttribute('title')).toMatch(/only in the diagram view/i);
  });
});
