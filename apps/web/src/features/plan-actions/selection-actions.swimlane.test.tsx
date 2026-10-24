import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SelectionActionsBar, type SelectionBarContext } from './selection-actions';

import type { SwimlaneAssignment } from '@/features/tsld/model/swimlane-assignment';

vi.mock('@/components/ui/announcer', () => ({ useAnnounce: () => vi.fn() }));

/**
 * **Move to swimlane…** on the single-activity selection bar (swimlanes M2-T10, US-3): a popover
 * with the shared `SelectField`, omitted where the plan offers no swimlanes and shaded with the
 * pen's reason where the reader may not write.
 */
const assign = vi.fn();
const assignment: SwimlaneAssignment = {
  choices: [
    { id: 's1', name: 'Civil' },
    { id: null, name: 'No swimlane' },
  ],
  currentOf: () => null,
  assign,
};

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
    moveToSwimlane: { assignment, ids: ['a'], names: ['Pour slab'] },
    ...over,
  };
}

const trigger = (): HTMLElement => screen.getByRole('button', { name: /move to swimlane/i });

beforeEach(() => {
  assign.mockReset();
  assign.mockResolvedValue({ applied: true, conflict: null, moved: 1 });
});

describe('the selection bar — Move to swimlane…', () => {
  it('is omitted, not shaded, while the plan offers no swimlanes', () => {
    render(<SelectionActionsBar context={ctx({ moveToSwimlane: null })} />);
    expect(screen.queryByRole('button', { name: /move to swimlane/i })).toBeNull();
    // A host that never heard of swimlanes (the Gantt's row menu) builds no such key at all.
    const { moveToSwimlane: _absent, ...hostWithout } = ctx();
    render(<SelectionActionsBar context={hostWithout} />);
    expect(screen.queryByRole('button', { name: /move to swimlane/i })).toBeNull();
  });

  it('sits between the activity’s own actions and Delete, as a popover on the roving toolbar', () => {
    render(<SelectionActionsBar context={ctx()} />);
    const items = [
      ...screen
        .getByRole('toolbar', { name: 'Actions for Pour slab' })
        .querySelectorAll<HTMLElement>('[data-toolbar-item]'),
    ].map((el) => el.getAttribute('data-toolbar-item'));
    expect(items.indexOf('move-to-swimlane')).toBeGreaterThan(items.indexOf('edit'));
    expect(items.indexOf('move-to-swimlane')).toBeLessThan(items.indexOf('delete'));
    expect(trigger()).toHaveAttribute('aria-haspopup', 'dialog');
  });

  it('opens the shared control and assigns the selected activity', async () => {
    render(<SelectionActionsBar context={ctx()} />);
    fireEvent.click(trigger());
    const select = screen.getByLabelText('Swimlane');
    fireEvent.change(select, { target: { value: 's1' } });
    await act(() => Promise.resolve(fireEvent.click(screen.getByRole('button', { name: 'Move' }))));
    expect(assign).toHaveBeenCalledWith(['a'], 's1');
  });

  it('is shaded with the pen’s reason for a reader who cannot write', () => {
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
    expect(screen.queryByLabelText('Swimlane')).toBeNull();
    expect(trigger()).toHaveAccessibleDescription(/Start editing to change this activity/);
  });
});
