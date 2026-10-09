import { act, fireEvent, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';

import {
  GanttRowMenu,
  type GanttRowMenuHandle,
  type GanttRowStructureActions,
} from './GanttRowMenu';

import type { SelectionBarContext } from '@/features/plan-actions/selection-actions';

/**
 * **M5-T3's menu, actually driven.**
 *
 * It shipped with zero behavioural coverage and the M6 test-engineering gate caught it — and
 * `coverage.structural.test.ts` could not, by its own stated blind spot: it matches action LABELS
 * against the journey corpus, and this menu shares its labels with the docked bar the journeys do
 * drive. So the gate was satisfied while an entire surface went unexercised, which is the shape
 * ADR-0081 exists about, one layer along from where that decision found it.
 *
 * `selection-duplication.structural.test.ts` proves the roster is not a second copy. That is a
 * static text scan and never executes the component; these cases are the other half.
 */

const context = (over: Partial<SelectionBarContext> = {}): SelectionBarContext => ({
  canvas: null,
  targetName: 'Foundations',
  // Make milestone… does not apply to this fixture's activity (ADR-0162 decision 4).
  definitionGate: null,
  makeMilestone: { applies: false },
  onMakeMilestone: vi.fn(),
  floatPathsOpen: false,
  toggleFloatPaths: null,
  canEditSchedule: true,
  scheduleRefusal: () => null,
  canReportProgress: true,
  canWriteNotes: true,
  onNotes: vi.fn(),
  isSummary: false,
  hasPlacement: false,
  conflictKey: null,
  clearPlacement: { enabled: false, reason: 'Nothing to clear' },
  // Visible unless a case says otherwise — the fixtures' status quo (M1).
  onOpenLogic: vi.fn(),
  onEdit: vi.fn(),
  onDelete: vi.fn(),
  onDissolve: vi.fn(),
  onDuplicate: vi.fn(),
  onDuplicateBand: vi.fn(),
  onResources: vi.fn(),
  onProgress: vi.fn(),
  onClearVisualPlacement: vi.fn(),
  onOpenEditorAt: vi.fn(),
  ...over,
});

const openMenu = (ctx = context()) => {
  render(<GanttRowMenu context={() => ctx} activityName="Foundations" />);
  fireEvent.click(screen.getByRole('button', { name: 'Actions for Foundations' }));
  return ctx;
};

describe('the trigger', () => {
  it('names its own row, so forty rows are not forty identical buttons', () => {
    render(<GanttRowMenu context={() => context()} activityName="Piling" />);
    expect(screen.getByRole('button', { name: 'Actions for Piling' })).toBeInTheDocument();
  });

  it('is NOT a tab stop — the grid keeps one roving stop', () => {
    // Rendered once per mounted row, so a tabbable trigger means Tab visits ~40 buttons instead of
    // leaving the widget. Both sibling copies of this control set it explicitly; this one did not
    // until the M6 component gate.
    render(<GanttRowMenu context={() => context()} activityName="Piling" />);
    expect(screen.getByRole('button', { name: 'Actions for Piling' })).toHaveAttribute(
      'tabindex',
      '-1',
    );
  });

  it('does not select the row it sits in', () => {
    // A menu press must not change the selection out from under the planner.
    //
    // A REACT handler on a real `role="row"`, which is what the grid actually has. A native
    // `addEventListener` on an ancestor was the first attempt and cannot test this: React attaches
    // at the root container, so a native listener partway up fires during the native bubble BEFORE
    // React's synthetic handler runs, and `stopPropagation` in the handler is therefore powerless
    // over it. The test would have failed against correct code.
    const onRowClick = vi.fn();
    render(
      <div role="treegrid">
        <div role="row" tabIndex={-1} onClick={onRowClick} onKeyDown={() => undefined}>
          <GanttRowMenu context={() => context()} activityName="Foundations" />
        </div>
      </div>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Actions for Foundations' }));
    expect(onRowClick).not.toHaveBeenCalled();
  });
});

describe('the items', () => {
  it('offers the dock roster and none of the canvas-only actions', () => {
    openMenu();
    expect(screen.getByRole('menuitem', { name: /^Progress/ })).toBeInTheDocument();
    // `canvas: null`, so zoom-to-selection and isolate are ABSENT rather than shaded — things the
    // object cannot do in this projection, not things this reader may not do (ADR-0082's omit).
    expect(screen.queryByRole('menuitem', { name: /Zoom to selection/ })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: /Isolate logic path/ })).toBeNull();
  });

  it('invokes the registry action, not a copy of it', () => {
    const ctx = openMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: /^Progress/ }));
    expect(ctx.onProgress).toHaveBeenCalledTimes(1);
  });

  it('offers Float paths, never pen-gated, and runs the host toggle (toolbar-redesign M2-T4)', () => {
    // The item came off the command deck into the object roster, so the Gantt row menu gets it by
    // derivation. It is an analysis, not a canvas command: it must be present with `canvas: null`,
    // and a reader without the pen must still be able to open it.
    const toggleFloatPaths = vi.fn();
    openMenu(context({ canEditSchedule: false, toggleFloatPaths }));
    // A checkbox, because it is a standing panel: the item says whether it is on.
    const item = screen.getByRole('menuitemcheckbox', { name: /^Float paths/ });
    expect(item).toHaveAttribute('aria-checked', 'false');
    expect(item).not.toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(item);
    expect(toggleFloatPaths).toHaveBeenCalledTimes(1);
  });

  it('omits Float paths when the host has no panel to open, rather than lighting it inert', () => {
    openMenu(context({ toggleFloatPaths: null }));
    expect(screen.queryByRole('menuitemcheckbox', { name: /^Float paths/ })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: /^Float paths/ })).toBeNull();
  });

  it('says the panel is on for its own row', () => {
    openMenu(context({ floatPathsOpen: true, toggleFloatPaths: vi.fn() }));
    expect(screen.getByRole('menuitemcheckbox', { name: /^Float paths/ })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  it('puts the looking tools before the edits and Delete last', () => {
    openMenu(context({ toggleFloatPaths: vi.fn() }));
    const names = [...screen.getByRole('menu').querySelectorAll('[role^="menuitem"]')].map(
      (el) => el.textContent?.trim() ?? '',
    );
    const at = (label: RegExp): number => names.findIndex((n) => label.test(n));
    expect(at(/^Float paths/)).toBeGreaterThan(-1);
    expect(at(/^Float paths/)).toBeLessThan(at(/^Edit/));
    expect(at(/^Delete/), 'Delete is not last').toBe(names.length - 1);
  });

  it('offers Make milestone… on a zero-duration task and converts it (ADR-0162 decision 4)', () => {
    // Every other fixture in this file sets `applies: false`, so this menu's copy of the item was
    // never rendered or pressed by any test — the docked bar the journey drives is a different
    // surface (M6 component gate). The mechanism is shared; this case proves the surface.
    const ctx = openMenu(
      context({
        definitionGate: { readable: true, writable: true, reason: null },
        makeMilestone: { applies: true, enabled: true, reason: null },
      }),
    );
    fireEvent.click(screen.getByRole('menuitem', { name: /^Make milestone…/ }));
    expect(ctx.onMakeMilestone).toHaveBeenCalledTimes(1);
  });

  it('shades Make milestone… with its reason rather than dropping it', () => {
    openMenu(
      context({
        definitionGate: {
          readable: true,
          writable: false,
          reason: 'Start editing to change this.',
        },
        makeMilestone: { applies: true, enabled: false, reason: 'Start editing to change this.' },
      }),
    );
    const item = screen.getByRole('menuitem', { name: /^Make milestone…/ });
    expect(item).toHaveAttribute('aria-disabled', 'true');
    expect(item).toHaveAccessibleDescription('Start editing to change this.');
  });

  it('shades a shut item with a reason instead of dropping it', () => {
    // ADR-0082: the option stays visible and focusable so its reason is readable by keyboard. That
    // decision's load-bearing change was making `Menu`'s roving focus reach a shaded item at all.
    openMenu(
      context({
        canEditSchedule: false,
        scheduleRefusal: () => 'Start editing to change this.',
      }),
    );
    const edit = screen.getByRole('menuitem', { name: /^Edit/ });
    expect(edit).toHaveAttribute('aria-disabled', 'true');
    expect(edit).not.toBeDisabled();
  });
});

/**
 * **The grid's own gestures** (ADR-0095 M5-T4), which are NOT in the shared roster.
 *
 * Indent and Outdent are about a row's place in a grid; the canvas expresses the same hierarchy as
 * a band ADR-0063 made select-only, because a summary's dates are an engine rollup with nothing to
 * drag. Offering them there would be three controls the surface cannot honour.
 *
 * `selection-duplication.structural.test.ts` still passes, and that is not luck: it forbids this
 * file naming an action the SHARED registry owns. These are not.
 */
describe('the structure gestures', () => {
  const structure = (over: Partial<GanttRowStructureActions> = {}): GanttRowStructureActions => ({
    indent: { run: vi.fn(), refusal: null },
    outdent: { run: vi.fn(), refusal: null },
    canEditSchedule: true,
    penRefusal: null,
    ...over,
  });

  const openWith = (s: GanttRowStructureActions) => {
    render(<GanttRowMenu context={() => context()} activityName="Foundations" structure={s} />);
    fireEvent.click(screen.getByRole('button', { name: 'Actions for Foundations' }));
  };

  it('offers Indent and Outdent', () => {
    openWith(structure());
    expect(screen.getByRole('menuitem', { name: /^Indent/ })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /^Outdent/ })).toBeInTheDocument();
  });

  it('runs the gesture the row resolved', () => {
    const s = structure();
    openWith(s);
    fireEvent.click(screen.getByRole('menuitem', { name: /^Indent/ }));
    expect(s.indent.run).toHaveBeenCalledTimes(1);
  });

  it('shades a refused gesture with the reason, still focusable', () => {
    // ADR-0082: the option keeps its place so its reason is readable by keyboard. "There is no
    // summary above this row" is a fact a planner can act on — by making one.
    openWith(
      structure({ indent: { run: vi.fn(), refusal: 'There is no summary above this row.' } }),
    );
    const item = screen.getByRole('menuitem', { name: /^Indent/ });
    expect(item).toHaveAttribute('aria-disabled', 'true');
    expect(item).not.toBeDisabled();
  });

  it('states the PEN first, not the gesture reason', () => {
    // A planner without the pen told "there is no summary above this row" has been given a true
    // and useless sentence — they cannot act on it, and the thing stopping them is elsewhere.
    openWith(
      structure({
        canEditSchedule: false,
        penRefusal: 'Start editing to change this.',
        indent: { run: vi.fn(), refusal: 'There is no summary above this row.' },
      }),
    );
    expect(screen.getByRole('menuitem', { name: /^Indent/ })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  it('renders NO Insert item while that milestone is unbuilt', () => {
    // Absent, not shaded. A control whose only reason is "nobody has written this yet" is the
    // lit-but-inert shape inverted.
    openWith(structure());
    expect(screen.queryByRole('menuitem', { name: /Insert/ })).toBeNull();
  });

  it('renders nothing structural when the host supplies no writer', () => {
    render(<GanttRowMenu context={() => context()} activityName="Foundations" />);
    fireEvent.click(screen.getByRole('button', { name: 'Actions for Foundations' }));
    expect(screen.queryByRole('menuitem', { name: /^Indent/ })).toBeNull();
  });
});

describe('the openAt handle (ADR-0177 D3)', () => {
  const setup = (resolve: () => SelectionBarContext | null) => {
    const ref = createRef<GanttRowMenuHandle>();
    const row = document.createElement('div');
    row.tabIndex = -1;
    document.body.appendChild(row);
    render(<GanttRowMenu ref={ref} context={resolve} activityName="Foundations" />);
    return { ref, row };
  };

  it('opens the menu at the point, with the same items as the trigger', () => {
    const { ref, row } = setup(() => context());
    act(() => {
      expect(ref.current?.openAt({ x: 40, y: 50 }, row)).toBe(true);
    });
    const viaHandle = screen.getAllByRole('menuitem').map((el) => el.textContent);
    expect(screen.getByRole('menu', { name: 'Actions for Foundations' })).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });

    fireEvent.click(screen.getByRole('button', { name: 'Actions for Foundations' }));
    expect(screen.getAllByRole('menuitem').map((el) => el.textContent)).toEqual(viaHandle);
  });

  it('reports false and opens nothing when the row has no context', () => {
    const { ref, row } = setup(() => null);
    act(() => {
      expect(ref.current?.openAt({ x: 40, y: 50 }, row)).toBe(false);
    });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('builds the context once for a menu that is already open', () => {
    const resolve = vi.fn(() => context());
    const { ref, row } = setup(resolve);
    act(() => void ref.current?.openAt({ x: 40, y: 50 }, row));
    act(() => void ref.current?.openAt({ x: 90, y: 90 }, row));
    expect(resolve).toHaveBeenCalledOnce();
  });

  it('hands focus to the element it was given, not the trigger, on close', () => {
    const { ref, row } = setup(() => context());
    act(() => void ref.current?.openAt({ x: 40, y: 50 }, row));
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    expect(row).toHaveFocus();
  });

  it('still hands focus to the trigger when the trigger opened it', () => {
    const { ref, row } = setup(() => context());
    act(() => void ref.current?.openAt({ x: 40, y: 50 }, row));
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    const trigger = screen.getByRole('button', { name: 'Actions for Foundations' });
    fireEvent.click(trigger);
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    expect(trigger).toHaveFocus();
  });
});
