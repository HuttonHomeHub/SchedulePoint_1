import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { GANTT_COLUMNS } from '../layout/grid-columns';
import { DEFAULT_HIDDEN_COLUMNS } from '../model/gantt-view-state';

import { GANTT_ROW_HEIGHT, GanttPanel } from './GanttPanel';
import { GanttPrintSurface } from './GanttPrintSurface';

import type { SelectionBarContext } from '@/features/plan-actions/selection-actions';
import { anActivity } from '@/test/activity-fixture';

/**
 * **The summary row's arrow sits beside the activity name** (ADR-0177 D4, Q-M2-1 = C).
 *
 * The arrow is a 24 × 24 box in the Activity column, behind the depth indent; the Code column is
 * plain. What jsdom can say is which element carries which class and where it is: whether a finger
 * lands on it, and what it does not overlap, is `e2e-gantt/disclosure.spec.ts`, in a browser.
 */
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  WBS_IMPROVEMENTS_ENABLED: true,
}));

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

const NESTED = [
  anActivity({ id: 'p', type: 'WBS_SUMMARY', code: 'P', name: 'Substructure', laneIndex: 0 }),
  anActivity({
    id: 'c',
    parentId: 'p',
    code: 'C',
    name: 'Piling',
    laneIndex: 1,
    earlyStart: '2026-02-02',
    earlyFinish: '2026-02-06',
  }),
  anActivity({
    id: 'l',
    code: 'L',
    name: 'Loose end',
    laneIndex: 5,
    earlyStart: '2026-03-02',
    earlyFinish: '2026-03-06',
  }),
];

const rowOf = (name: string): HTMLElement => screen.getByRole('row', { name: new RegExp(name) });
const cellOf = (row: HTMLElement, colindex: number): HTMLElement =>
  row.querySelector<HTMLElement>(`[role="gridcell"][aria-colindex="${colindex}"]`)!;
const arrow = (row: HTMLElement): HTMLElement =>
  row.querySelector<HTMLElement>('[data-gantt-disclosure]')!;

const rowContext = (): SelectionBarContext => ({
  canvas: null,
  targetName: 'Substructure',
  definitionGate: null,
  makeMilestone: { applies: false },
  onMakeMilestone: vi.fn(),
  canEditSchedule: true,
  scheduleRefusal: () => null,
  canReportProgress: true,
  canWriteNotes: true,
  onNotes: vi.fn(),
  isSummary: true,
  hasPlacement: false,
  conflictKey: null,
  clearPlacement: { enabled: false, reason: 'Nothing to clear' },
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
});

describe('the summary row arrow', () => {
  it('is a 24 px box in the Activity cell, hidden from the accessibility tree', () => {
    render(<GanttPanel activities={NESTED} />);
    const button = arrow(rowOf('Substructure'));
    expect(button).toHaveClass('size-6');
    expect(button).toHaveAttribute('aria-hidden', 'true');
    expect(button).toHaveAttribute('tabindex', '-1');
    // Code is column 1 and Activity column 2 by default.
    expect(button.closest('[role="gridcell"]')).toBe(cellOf(rowOf('Substructure'), 2));
    expect(cellOf(rowOf('Substructure'), 2)).toHaveTextContent('Substructure');
  });

  it('keeps depth indentation out of the Code cell and puts it before the Activity name', () => {
    render(<GanttPanel activities={NESTED} />);
    const child = rowOf('Piling');
    expect(cellOf(child, 1).style.paddingLeft).toBe('');
    expect(cellOf(child, 1).querySelector('[class*="size-6"]')).toBeNull();
    // A leaf draws the same 24 px slot, empty, pushed in by its depth.
    const slot = cellOf(child, 2).firstElementChild as HTMLElement;
    expect(slot).toHaveClass('size-6');
    expect(slot).toBeEmptyDOMElement();
    expect(slot.style.marginLeft).toBe('14px');
    expect(arrow(child)).toBeNull();
  });

  it('draws the same slot on a bucket row, as a decorative span', () => {
    render(<GanttPanel activities={NESTED} />);
    const bucket = rowOf('Unassigned');
    const slot = cellOf(bucket, 2).firstElementChild as HTMLElement;
    expect(slot.tagName).toBe('SPAN');
    expect(slot).toHaveClass('size-6');
    expect(slot).toHaveAttribute('aria-hidden', 'true');
    expect(arrow(bucket)).toBeNull();
    expect(cellOf(bucket, 1)).toBeEmptyDOMElement();
  });

  it('toggles on a tap without selecting the row', () => {
    const onSelectActivity = vi.fn();
    render(<GanttPanel activities={NESTED} onSelectActivity={onSelectActivity} />);
    fireEvent.click(arrow(rowOf('Substructure')));
    expect(rowOf('Substructure')).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Piling')).not.toBeInTheDocument();
    expect(onSelectActivity).not.toHaveBeenCalled();
  });

  it('does not toggle on the click a hold that opened the menu ends in, and only that one', () => {
    render(
      <GanttPanel
        activities={NESTED}
        rowMenuContextFor={rowContext}
        rowStructure={{
          canEditSchedule: true,
          penRefusal: null,
          onReparent: () => {},
          onInsert: () => {},
        }}
        onSelectActivity={() => {}}
      />,
    );
    const button = arrow(rowOf('Substructure'));
    fireEvent.pointerDown(button, { pointerType: 'touch', button: 0, clientX: 20, clientY: 10 });
    fireEvent.contextMenu(button, { clientX: 20, clientY: 10 });
    expect(screen.getByRole('menu')).toBeInTheDocument();
    fireEvent.click(button);
    expect(rowOf('Substructure')).toHaveAttribute('aria-expanded', 'true');

    // The swallow is consumed: the next tap is an ordinary one.
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    fireEvent.pointerDown(button, { pointerType: 'touch', button: 0, clientX: 20, clientY: 10 });
    fireEvent.click(button);
    expect(rowOf('Substructure')).toHaveAttribute('aria-expanded', 'false');
  });

  it('does not open the name editor on a double-click', () => {
    const begin = vi.fn();
    render(
      <GanttPanel
        activities={NESTED}
        editing={{
          state: { status: 'idle' },
          hasComputedSchedule: true,
          errorMessage: null,
          gateFor: () => ({ readable: true, writable: true, readOnly: false, reason: null }),
          begin,
          change: vi.fn(),
          commit: vi.fn(),
          cancel: vi.fn(),
          onCellClosed: vi.fn(),
        }}
      />,
    );
    fireEvent.doubleClick(arrow(rowOf('Substructure')));
    expect(begin).not.toHaveBeenCalled();
  });
});

describe('the printed programme', () => {
  it('has no disclosure slot and no arrow', () => {
    const { container } = render(
      <GanttPrintSurface
        columns={GANTT_COLUMNS.filter((c) => !DEFAULT_HIDDEN_COLUMNS.includes(c.key))}
        dependencies={[]}
        title="North Tower"
        subtitle="As of 2026-02-01"
        activities={NESTED}
      />,
    );
    expect(container.querySelector('[data-gantt-disclosure]')).toBeNull();
    expect(container.querySelector('[class*="size-6"]')).toBeNull();
    // The child is still printed, indented by its own rule — only the slot is absent.
    expect(container.textContent).toContain('Piling');
  });
});
