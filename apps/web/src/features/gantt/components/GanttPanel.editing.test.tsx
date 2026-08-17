import type { ActivitySummary, DependencySummary } from '@repo/types';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { GanttBarDrag } from '../model/bar-drag';
import { IDLE, reduceCellEdit, type GanttGridEditing } from '../model/cell-edit';
import { ganttCellGate, type GanttCellGate } from '../model/cell-gate';

import { GANTT_ROW_HEIGHT, GanttPanel } from './GanttPanel';

import { deriveActivityEditorGating } from '@/features/activities/lib/activity-editor-gating';
import { anActivity } from '@/test/activity-fixture';

/**
 * jsdom has no layout, so the real virtualizer measures a zero-height scroller and renders no rows
 * at all. Stubbed to a pass-through exactly as `GanttPanel.test.tsx` does — that virtualization
 * really windows is a browser property and belongs to the journey, not here.
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

/**
 * **M2 — the grid with editing wired in.**
 *
 * The point of the `editing` prop being **optional** is that its absence is the read-only grid,
 * byte-for-byte; `GanttPanel.test.tsx` asserts that path and passed unchanged through this work.
 * This file asserts the other one.
 *
 * What it deliberately does not do is prove a write. `commitCell`'s status branches are unit tests
 * against an injected mutation, and the real write is `e2e-gantt-editing/grid-edit.spec.ts` — a
 * mocked fetch accepts any `version`, so only a real server can show the optimistic check is armed.
 * Asserting a "save" here would be asserting the mock.
 */

const OPEN: GanttCellGate = { writable: true, readable: true, readOnly: false, reason: null };
const SHUT: GanttCellGate = {
  writable: false,
  readable: true,
  readOnly: true,
  reason: 'Start editing to change this.',
};

const activity = (over: Partial<ActivitySummary> = {}): ActivitySummary =>
  anActivity({
    id: 'a1',
    code: 'A1',
    name: 'Foundations',
    durationDays: 5,
    durationMinutes: 2400,
    earlyStart: '2026-01-05',
    earlyFinish: '2026-01-09',
    totalFloat: 0,
    ...over,
  });

function editingBundle(over: Partial<GanttGridEditing> = {}): GanttGridEditing {
  return {
    state: IDLE,
    hasComputedSchedule: true,
    gateFor: () => OPEN,
    begin: vi.fn(),
    change: vi.fn(),
    commit: vi.fn(),
    cancel: vi.fn(),
    errorMessage: null,
    onCellClosed: vi.fn(),
    ...over,
  };
}

const renderGrid = (editing: GanttGridEditing | undefined, activities = [activity()]) =>
  render(<GanttPanel activities={activities} editing={editing} />);

/** The cell under a given column header, on the first activity row. */
function cellUnder(label: string): HTMLElement {
  const headers = screen.getAllByRole('columnheader');
  const index = headers.findIndex((h) => (h.textContent ?? '').trim().startsWith(label));
  expect(index, `no column headed ${label}`).toBeGreaterThanOrEqual(0);
  const row = screen.getAllByRole('row').find((r) => r.getAttribute('aria-rowindex') === '2');
  expect(row, 'no first activity row').toBeDefined();
  const cells = within(row!).getAllByRole('gridcell');
  return cells[index]!;
}

describe('with no editing bundle', () => {
  it('renders no editable cell at all — the read-only grid, unchanged', () => {
    renderGrid(undefined);
    // Nothing is aria-readonly, because nothing claims to be a cell you could otherwise type into.
    expect(document.querySelector('[aria-readonly]')).toBeNull();
    fireEvent.doubleClick(cellUnder('Activity'));
    expect(screen.queryByRole('textbox')).toBeNull();
  });
});

describe('with editing wired in', () => {
  it('opens the cell on double-click, seeded from what the row reads', () => {
    const begin = vi.fn();
    renderGrid(editingBundle({ begin }));

    fireEvent.doubleClick(cellUnder('Duration'));
    // Seeded from the RENDERED text, not re-derived — so the planner edits the value they can see,
    // including its unit. Re-deriving would be a second answer to "how long is this?".
    expect(begin).toHaveBeenCalledWith({ activityId: 'a1', key: 'duration' }, '5 d');
  });

  it('shows the field only in the open cell, and the other cells stay text', () => {
    const state = reduceCellEdit(IDLE, {
      type: 'begin',
      target: { activityId: 'a1', key: 'duration' },
      seed: '5 d',
    });
    renderGrid(editingBundle({ state }));

    expect(screen.getAllByRole('textbox')).toHaveLength(1);
    expect(within(cellUnder('Duration')).getByRole('textbox')).toBeInTheDocument();
    expect(within(cellUnder('Activity')).queryByRole('textbox')).toBeNull();
  });

  it('shades a shut cell read-only with its reason, and leaves the value readable', () => {
    renderGrid(editingBundle({ gateFor: () => SHUT }));
    const cell = cellUnder('Duration');

    expect(cell).toHaveAttribute('aria-readonly', 'true');
    expect(cell).not.toHaveAttribute('aria-disabled');
    // The whole ADR-0083 point: the reader still gets the number.
    expect(cell).toHaveTextContent('5 d');
    const describedBy = cell.getAttribute('aria-describedby');
    expect(document.getElementById(describedBy!)).toHaveTextContent(
      'Start editing to change this.',
    );
  });

  it('keeps the summary emphasis and the off-path marker inside the editable name cell', () => {
    // Both used to live in the plain cell branch. An editable cell that dropped them would look
    // right and lose a WCAG 1.4.1 text equivalent — the exact half-applied-pattern shape this
    // register keeps recording.
    renderGrid(editingBundle(), [activity({ type: 'WBS_SUMMARY', name: 'Substructure' })]);
    expect(cellUnder('Activity')).toHaveTextContent('Substructure');
    expect(cellUnder('Activity').querySelector('.font-semibold')).not.toBeNull();
  });

  it('leaves the non-editable columns as plain cells', () => {
    // `code` and `totalFloat` are engine output or identity nobody types here. They must not become
    // read-only-looking cells, because that would promise an editing capability that does not exist.
    renderGrid(editingBundle({ gateFor: () => SHUT }));
    expect(cellUnder('Code')).not.toHaveAttribute('aria-readonly');
    expect(cellUnder('Float')).not.toHaveAttribute('aria-readonly');
  });
});

describe('on a plan that has not been calculated', () => {
  const unscheduled = () => activity({ earlyStart: null, earlyFinish: null, totalFloat: null });

  it('renders the grid, so the cells are reachable at all', () => {
    // The branch returned a sentence and NO grid until M2-T4, which made every cell unreachable on
    // precisely the plan a planner is most likely to be typing into: a fresh one, before the first
    // recalculation.
    renderGrid(editingBundle({ hasComputedSchedule: false }), [unscheduled()]);
    expect(screen.getByRole('treegrid')).toBeInTheDocument();
  });

  it('still says the plan has not been calculated', () => {
    // Showing the grid is the fix for "unreachable". It is not a reason to stop explaining why the
    // chart column is empty — and the explanation is a live region, so it is not sight-only.
    renderGrid(editingBundle({ hasComputedSchedule: false }), [unscheduled()]);
    expect(screen.getByRole('status')).toHaveTextContent('This plan has not been calculated');
  });

  it('keeps name and duration writable there — the half most likely to regress', () => {
    // Asserted through the REAL gate rather than a stub, because this is the decision itself: a
    // duration is an input, not a rollup, so it does not depend on a computed schedule the way a
    // date does. The first draft made it read-only and the ux re-review corrected it.
    renderGrid(
      {
        ...editingBundle({ hasComputedSchedule: false }),
        gateFor: (key) =>
          ganttCellGate({
            key,
            activity: { type: 'TASK' },
            gating: deriveActivityEditorGating({
              penManaged: true,
              holdsPen: true,
              canWrite: true,
              canProgress: true,
              canReadCost: true,
            }),
            hasComputedSchedule: false,
          }),
      },
      [unscheduled()],
    );

    expect(cellUnder('Activity')).not.toHaveAttribute('aria-readonly');
    expect(cellUnder('Duration')).not.toHaveAttribute('aria-readonly');
    // And the dates are shut with an action, not a report of unavailability.
    const start = cellUnder('Start');
    expect(start).toHaveAttribute('aria-readonly', 'true');
    expect(document.getElementById(start.getAttribute('aria-describedby')!)).toHaveTextContent(
      /Recalculate/i,
    );
  });
});

describe('keyboard entry into a cell', () => {
  const grid = () => screen.getByRole('treegrid');

  it('opens the first writable cell on F2', () => {
    const begin = vi.fn();
    renderGrid(editingBundle({ begin }));

    fireEvent.keyDown(grid(), { key: 'F2' });
    // The Activity column is the first editable one, so that is where F2 lands. Seeded from the
    // rendered text like the pointer path — one seed, not two.
    expect(begin).toHaveBeenCalledWith({ activityId: 'a1', key: 'name' }, 'Foundations');
  });

  it('skips a cell the gate has shut and opens the next writable one', () => {
    // Otherwise F2 would appear to do nothing on a row whose first editable column happens to be
    // read-only — a dead key, which is the lit-but-inert shape one keystroke along.
    const begin = vi.fn();
    renderGrid(
      editingBundle({
        begin,
        gateFor: (key) => (key === 'name' ? SHUT : OPEN),
      }),
    );

    fireEvent.keyDown(grid(), { key: 'F2' });
    expect(begin).toHaveBeenCalledWith({ activityId: 'a1', key: 'duration' }, '5 d');
  });

  it('does nothing on F2 when every editable cell is shut', () => {
    const begin = vi.fn();
    renderGrid(editingBundle({ begin, gateFor: () => SHUT }));
    fireEvent.keyDown(grid(), { key: 'F2' });
    expect(begin).not.toHaveBeenCalled();
  });

  it('does nothing on F2 with no editing bundle at all', () => {
    renderGrid(undefined);
    fireEvent.keyDown(grid(), { key: 'F2' });
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('returns to row mode on Escape', () => {
    const cancel = vi.fn();
    const state = reduceCellEdit(IDLE, {
      type: 'begin',
      target: { activityId: 'a1', key: 'duration' },
      seed: '5 d',
    });
    renderGrid(editingBundle({ state, cancel }));

    fireEvent.keyDown(grid(), { key: 'Escape' });
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('leaves Escape alone when no cell is open, so the rung below still gets it', () => {
    // Escape is a ladder (ADR-0064/ADR-0080): the cell, then the grid, then whatever the workspace
    // does with it. Swallowing it here unconditionally would take a rung away from a planner who
    // has no cell open at all.
    const cancel = vi.fn();
    renderGrid(editingBundle({ cancel }));
    fireEvent.keyDown(grid(), { key: 'Escape' });
    expect(cancel).not.toHaveBeenCalled();
  });
});

describe('moving a bar from the keyboard', () => {
  const grid = () => screen.getByRole('treegrid');

  const dragBundle = (over: Partial<GanttBarDrag> = {}): GanttBarDrag => ({
    canEdit: true,
    reason: null,
    plannedStartIso: '2026-01-01',
    moveTo: vi.fn(),
    resizeTo: vi.fn(),
    announce: vi.fn(),
    ...over,
  });

  const renderWithDrag = (drag: GanttBarDrag, activities = [activity()]) =>
    render(<GanttPanel activities={activities} drag={drag} />);

  it('nudges the start on Alt+ArrowRight, counting from plannedStart', () => {
    const moveTo = vi.fn();
    renderWithDrag(dragBundle({ moveTo }));

    fireEvent.keyDown(grid(), { key: 'ArrowRight', altKey: true });
    // 5 Jan is day 4 from a 1 Jan plannedStart; one day later is day 5. The conversion is the
    // module's, not restated here — this asserts the wiring reaches it.
    expect(moveTo).toHaveBeenCalledWith('a1', 5);
  });

  it('nudges backwards on Alt+ArrowLeft', () => {
    const moveTo = vi.fn();
    renderWithDrag(dragBundle({ moveTo }));
    fireEvent.keyDown(grid(), { key: 'ArrowLeft', altKey: true });
    expect(moveTo).toHaveBeenCalledWith('a1', 3);
  });

  it('leaves the BARE arrows to disclosure, which they were already bound to', () => {
    // The plan said bare arrows until the accessibility re-review. They are treegrid disclosure
    // keys in this very handler, so the original would have collided with a shipped binding.
    const moveTo = vi.fn();
    renderWithDrag(dragBundle({ moveTo }));
    fireEvent.keyDown(grid(), { key: 'ArrowRight' });
    fireEvent.keyDown(grid(), { key: 'ArrowLeft' });
    expect(moveTo).not.toHaveBeenCalled();
  });

  it('announces the move, because a bar that moved off-screen said nothing otherwise', () => {
    const announce = vi.fn();
    renderWithDrag(dragBundle({ announce }));
    fireEvent.keyDown(grid(), { key: 'ArrowRight', altKey: true });
    expect(announce).toHaveBeenCalledWith(expect.stringContaining('2026-01-06'));
  });

  it('refuses with a spoken reason rather than doing nothing', () => {
    // A nudge that neither moves nor speaks is indistinguishable from a dead key — the lit-but-inert
    // shape, one keystroke along.
    const moveTo = vi.fn();
    const announce = vi.fn();
    renderWithDrag(
      dragBundle({ canEdit: false, reason: 'Start editing to change this.', moveTo, announce }),
    );

    fireEvent.keyDown(grid(), { key: 'ArrowRight', altKey: true });
    expect(moveTo).not.toHaveBeenCalled();
    expect(announce).toHaveBeenCalledWith('Start editing to change this.');
  });

  it('will not move a summary, and says why that is about the object', () => {
    // A summary's dates are an engine rollup of its children (ADR-0038): there is nothing on it to
    // drag, and no good answer to what dragging one would mean for the activities inside it.
    const moveTo = vi.fn();
    const announce = vi.fn();
    renderWithDrag(dragBundle({ moveTo, announce }), [activity({ type: 'WBS_SUMMARY' })]);

    fireEvent.keyDown(grid(), { key: 'ArrowRight', altKey: true });
    expect(moveTo).not.toHaveBeenCalled();
    expect(announce).toHaveBeenCalledWith(expect.stringMatching(/summary/i));
  });

  it('does nothing at all with no drag bundle — the read-only chart', () => {
    renderGrid(undefined);
    // No throw, no binding. The parity contract `editing` carries, one prop along.
    expect(() => fireEvent.keyDown(grid(), { key: 'ArrowRight', altKey: true })).not.toThrow();
  });
});

describe('the bar gestures in the rendered row', () => {
  const dragBundle = (over: Partial<GanttBarDrag> = {}): GanttBarDrag => ({
    canEdit: true,
    reason: null,
    plannedStartIso: '2026-01-01',
    moveTo: vi.fn(),
    resizeTo: vi.fn(),
    announce: vi.fn(),
    ...over,
  });

  const bars = () => document.querySelectorAll('[data-activity-id] span[aria-hidden="true"]');

  it('offers a resize handle only where the bar can be moved', () => {
    const { container, unmount } = render(
      <GanttPanel activities={[activity()]} drag={dragBundle()} />,
    );
    expect(container.querySelectorAll('.cursor-ew-resize')).toHaveLength(1);
    unmount();

    // Shut: no handle at all rather than an inert grab zone. A handle that does nothing is the
    // lit-but-inert shape, and on a pointer affordance there is no reason text to explain it.
    const shut = render(
      <GanttPanel activities={[activity()]} drag={dragBundle({ canEdit: false })} />,
    );
    expect(shut.container.querySelectorAll('.cursor-ew-resize')).toHaveLength(0);
  });

  it('offers no handle on a milestone, which has no length to change', () => {
    const { container } = render(
      <GanttPanel
        activities={[activity({ type: 'START_MILESTONE', durationDays: 0, durationMinutes: 0 })]}
        drag={dragBundle()}
      />,
    );
    expect(container.querySelectorAll('.cursor-ew-resize')).toHaveLength(0);
  });

  it('renders no gesture affordance at all with no drag bundle', () => {
    const { container } = render(<GanttPanel activities={[activity()]} />);
    expect(container.querySelectorAll('.cursor-ew-resize')).toHaveLength(0);
    expect(bars().length).toBeGreaterThan(0);
  });
});

describe('the logic overlay', () => {
  /**
   * The endpoint NAMES come from the dependency payload, not from the activity list —
   * `predecessorSummary` reads what the API sends on the edge rather than joining back to a row.
   * The first version of this fixture derived them from the ids and asserted a name no code path
   * produces; the test caught it, which is the fixture being wrong rather than the product.
   */
  const dep = (id: string, from: string, to: string, fromName: string) =>
    ({
      id,
      type: 'FS',
      predecessor: { id: from, code: null, name: fromName },
      successor: { id: to, code: null, name: 'Second' },
    }) as unknown as DependencySummary;

  const two = () => [
    activity({ id: 'a1', name: 'First' }),
    activity({ id: 'a2', name: 'Second', earlyStart: '2026-01-12', earlyFinish: '2026-01-16' }),
  ];

  it('draws nothing with no dependencies at all — the chart as it was', () => {
    const { container } = render(<GanttPanel activities={two()} />);
    expect(container.querySelector('svg')).toBeNull();
  });

  it('draws nothing with the toggle off and no selection', () => {
    const { container } = render(
      <GanttPanel activities={two()} dependencies={[dep('d1', 'a1', 'a2', 'First')]} />,
    );
    expect(container.querySelector('svg')).toBeNull();
  });

  it('draws the selected row links with the toggle OFF', () => {
    // The toggle's off-state: "why is this bar here?" is answerable without turning anything on.
    const { container } = render(
      <GanttPanel
        activities={two()}
        dependencies={[dep('d1', 'a1', 'a2', 'First')]}
        selectedActivityId="a1"
      />,
    );
    expect(container.querySelectorAll('svg path')).toHaveLength(1);
  });

  it('draws every windowed link with the toggle ON', () => {
    const { container } = render(
      <GanttPanel
        activities={two()}
        dependencies={[dep('d1', 'a1', 'a2', 'First')]}
        showAllLinks
      />,
    );
    expect(container.querySelectorAll('svg path')).toHaveLength(1);
  });

  it('hides the arrows from assistive technology and says it in words instead', () => {
    // The SVG is aria-hidden because an elbow is not readable; without the sentence the overlay
    // would be the first graphical-only carrier on a surface whose own docblock forbids that.
    const { container } = render(
      <GanttPanel
        activities={two()}
        dependencies={[dep('d1', 'a1', 'a2', 'First')]}
        showAllLinks
      />,
    );
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByText('Follows First.')).toBeInTheDocument();
  });

  it('takes no pointer events, so an arrow is never a hole in the drag surface', () => {
    // Without this the resize handle under a passing link stops responding — silently, and on
    // exactly the dense plans where both features matter.
    const { container } = render(
      <GanttPanel
        activities={two()}
        dependencies={[dep('d1', 'a1', 'a2', 'First')]}
        showAllLinks
      />,
    );
    // `getAttribute`, not `.className`: on an SVGElement that property is an SVGAnimatedString and
    // `toContain` against it silently compares an object. The first version asserted `[]`.
    expect(container.querySelector('svg')?.getAttribute('class')).toContain('pointer-events-none');
  });
});

/**
 * **A row's TEXT no longer identifies the row, and the float-paths journey found out in CI.**
 *
 * `linkSummary` is rendered as a direct child of the row (the arrows' textual equivalent, GV-3), so
 * a successor's row now contains its predecessors' NAMES. That is correct and deliberate — but it
 * means a locator of the form "the first row whose text contains `Branch`" can resolve to the
 * TARGET's row rather than Branch's own, because Target's row reads "Follows Driving, Branch, …".
 *
 * `e2e-float-paths` did exactly that. Its fixture puts Target at `laneIndex: 0`, and the default
 * sort is `wbs` ascending, so Target is the FIRST row: both `drivingRow` and `branchRow` collapsed
 * onto it, which is why one assertion passed and its neighbour failed on the same element. The
 * journey now scopes to the name cell; this pins the property that made the old locator wrong, so
 * nobody restores it.
 */
describe('what a row says it is', () => {
  const successorDep = (id: string, fromId: string, fromName: string) =>
    ({
      id,
      type: 'FS',
      predecessor: { id: fromId, code: null, name: fromName },
      successor: { id: 'target', code: null, name: 'Target' },
    }) as unknown as DependencySummary;

  const network = () => [
    activity({ id: 'target', name: 'Target', laneIndex: 0 }),
    activity({ id: 'driving', name: 'Driving', laneIndex: 1 }),
    activity({ id: 'branch', name: 'Branch', laneIndex: 2 }),
  ];

  const deps = () => [
    successorDep('d1', 'driving', 'Driving'),
    successorDep('d2', 'branch', 'Branch'),
  ];

  it("puts a predecessor's name inside the SUCCESSOR's row", () => {
    render(<GanttPanel activities={network()} dependencies={deps()} showAllLinks />);
    const target = screen.getAllByRole('row').find((row) => row.textContent?.includes('Follows'));
    expect(target?.textContent).toContain('Follows Driving, Branch.');
    // It is the TARGET's row that carries it — the successor, not either predecessor.
    expect(within(target as HTMLElement).getByRole('gridcell', { name: 'Target' })).toBeVisible();
  });

  it('so the first row whose TEXT contains a name may not be that activity row', () => {
    // The CI failure, reduced. Not a defect to fix in the product — the sentence belongs there —
    // but a property any row locator has to respect.
    render(<GanttPanel activities={network()} dependencies={deps()} showAllLinks />);
    const first = screen.getAllByRole('row').find((row) => row.textContent?.includes('Branch'));
    expect(first?.textContent?.startsWith('Branch')).toBe(false);
  });

  it('while the NAME CELL identifies the row unambiguously', () => {
    // Which is what the journey's locator now uses. The summary is a row-level child, never a
    // gridcell, so scoping to the cell cannot pick it up.
    render(<GanttPanel activities={network()} dependencies={deps()} showAllLinks />);
    const named = screen
      .getAllByRole('gridcell')
      .filter((cell) => cell.textContent?.trim() === 'Branch');
    expect(named).toHaveLength(1);
  });
});
