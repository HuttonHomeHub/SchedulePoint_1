import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { buildSelectionBarContext } from './build-selection-context';
import {
  SelectionActionsBar,
  selectionActionItems,
  type SelectionBarContext,
} from './selection-actions';

import { anActivity } from '@/test/activity-fixture';

vi.mock('@/components/ui/announcer', () => ({ useAnnounce: () => vi.fn() }));

/**
 * **Set code…** on the single-activity bar (P6 activity codes, M3-T4): omitted while the plan has no
 * code type, shaded with the pen's sentence otherwise, and a popover whose panel the host supplies —
 * this feature never learns what a code type is.
 */
const panel = vi.fn((_gate: unknown, ref: React.RefObject<HTMLSelectElement | null>) => (
  <select aria-label="Code" ref={ref}>
    <option>Area</option>
  </select>
));

function ctx(over: Partial<SelectionBarContext> = {}): SelectionBarContext {
  return {
    canvas: null,
    targetName: 'Pour slab',
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
    conflictKeys: [],
    clearPlacement: { enabled: true, reason: null },
    onClearVisualPlacement: vi.fn(),
    onOpenEditorAt: vi.fn(),
    onOpenLogic: vi.fn(),
    onEdit: vi.fn(),
    onDelete: vi.fn(),
    onDissolve: vi.fn(),
    onDuplicate: vi.fn(),
    onDuplicateBand: vi.fn(),
    onResources: vi.fn(),
    onProgress: vi.fn(),
    setCode: { panel },
    ...over,
  };
}

const trigger = (): HTMLElement => screen.getByRole('button', { name: 'Set code…' });

describe('the selection bar — Set code…', () => {
  it('is omitted, not shaded, while the plan has no code type', () => {
    render(<SelectionActionsBar context={ctx({ setCode: null })} />);
    expect(screen.queryByRole('button', { name: 'Set code…' })).toBeNull();
  });

  it('sits after Move to swimlane… and before Delete, labelled, with no Gantt row-menu activation', () => {
    render(<SelectionActionsBar context={ctx()} />);
    const items = [
      ...screen
        .getByRole('toolbar', { name: 'Actions for Pour slab' })
        .querySelectorAll<HTMLElement>('[data-toolbar-item]'),
    ].map((el) => el.getAttribute('data-toolbar-item'));
    expect(items.indexOf('set-code')).toBeGreaterThan(items.indexOf('edit'));
    expect(items.indexOf('set-code')).toBeLessThan(items.indexOf('delete'));
    const item = selectionActionItems.find((i) => i.id === 'set-code');
    expect(item?.labelVisibility).toBe('always');
    expect(item?.order).toBeGreaterThan(5.7);
    // `GanttRowMenu` keeps only items with `onActivate`, so a popover item stays off the row menu.
    expect(item?.onActivate).toBeUndefined();
    expect(item?.lostReason).toBe('Not available here: the plan has no codes.');
  });

  it('opens the host’s panel with focus on its first field', () => {
    render(<SelectionActionsBar context={ctx()} />);
    fireEvent.click(trigger());
    expect(screen.getByLabelText('Code')).toHaveFocus();
    expect(panel).toHaveBeenLastCalledWith({ writable: true, reason: null }, expect.anything());
  });

  it('returns focus to the trigger on Escape and keeps the arrows in the panel', () => {
    render(<SelectionActionsBar context={ctx()} />);
    fireEvent.click(trigger());
    fireEvent.keyDown(screen.getByLabelText('Code'), { key: 'ArrowRight' });
    expect(screen.getByLabelText('Code')).toHaveFocus();
    fireEvent.keyDown(screen.getByLabelText('Code'), { key: 'Escape' });
    expect(screen.queryByLabelText('Code')).toBeNull();
    expect(trigger()).toHaveFocus();
  });

  it('is shaded with the pen’s sentence for a reader who cannot write', () => {
    render(
      <SelectionActionsBar
        context={ctx({
          canEditSchedule: false,
          scheduleRefusal: () => 'Start editing to change this activity.',
        })}
      />,
    );
    expect(trigger()).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(trigger());
    expect(screen.queryByLabelText('Code')).toBeNull();
    expect(trigger()).toHaveAccessibleDescription(/Start editing to change this activity/);
  });
});

describe('the shared builder — setCodePanel', () => {
  const input = {
    canvas: null,
    activities: [anActivity({ id: 'a', name: 'Pour slab' })],
    selectedId: 'a',
    selectionCount: 1,
    canEditSchedule: true,
    scheduleRefusal: () => null,
    canReportProgress: true,
    canWriteNotes: true,
    onOpenLogic: vi.fn(),
    onEdit: vi.fn(),
    onDelete: vi.fn(),
  };

  it('leaves setCode null without a host panel, and hands the panel its activity with one', () => {
    expect(buildSelectionBarContext(input)?.setCode).toBeNull();
    const render_ = vi.fn(() => null);
    const built = buildSelectionBarContext({ ...input, setCodePanel: render_ });
    const gate = { writable: true, reason: null };
    const ref = { current: null };
    void built?.setCode?.panel(gate, ref);
    expect(render_).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }), gate, ref);
  });
});
