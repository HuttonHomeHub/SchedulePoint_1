import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { MAKE_MILESTONE_LABEL, resourcedReason } from './make-milestone-gate';
import { SelectionActionsBar, type SelectionBarContext } from './selection-actions';

import { GanttRowMenu } from '@/features/gantt/components/GanttRowMenu';

/**
 * **Make milestone… on the selection bar and the Gantt row menu** (ADR-0162 decision 4, M4-T2).
 *
 * The bar renders it icon-only (M0-T5), so its name is the accessible name and the tooltip; the row
 * menu renders the same label as text. Both read the builder's `makeMilestone` verdict.
 */
const ctx = (over: Partial<SelectionBarContext> = {}): SelectionBarContext => ({
  canvas: null,
  targetName: 'Pour slab',
  definitionGate: { writable: true, reason: null, readable: true },
  makeMilestone: { applies: true, enabled: true, reason: null },
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

const bar = () => screen.getByRole('toolbar', { name: 'Actions for Pour slab' });

describe('the selection bar', () => {
  it('offers an icon-only control named Make milestone… that opens the dialog', () => {
    const context = ctx();
    render(<SelectionActionsBar context={context} />);
    const button = within(bar()).getByRole('button', { name: MAKE_MILESTONE_LABEL });
    // Icon-only: no painted text, the name rides `aria-label` (M0-T5, ADR-0117).
    expect(button).toHaveAttribute('aria-label', MAKE_MILESTONE_LABEL);
    expect(button.textContent?.includes(MAKE_MILESTONE_LABEL)).toBe(false);
    fireEvent.click(button);
    expect(context.onMakeMilestone).toHaveBeenCalledOnce();
  });

  it('hands focus to the bar’s restore target BEFORE opening the dialog (spec D4)', () => {
    // The dialog's native restore returns focus to whatever held it at `showModal()`, and this
    // button is gone once the task is a milestone — so the successor must hold focus first.
    const order: string[] = [];
    const context = ctx({ onMakeMilestone: () => order.push('open') });
    render(<SelectionActionsBar context={context} restoreFocus={() => order.push('focus')} />);
    fireEvent.click(within(bar()).getByRole('button', { name: MAKE_MILESTONE_LABEL }));
    expect(order).toEqual(['focus', 'open']);
  });

  it('is absent when the action does not apply', () => {
    render(<SelectionActionsBar context={ctx({ makeMilestone: { applies: false } })} />);
    expect(within(bar()).queryByRole('button', { name: MAKE_MILESTONE_LABEL })).toBeNull();
  });

  it('is shaded with the assignments reason, and does not fire', () => {
    const context = ctx({
      makeMilestone: { applies: true, enabled: false, reason: resourcedReason(2) },
    });
    render(<SelectionActionsBar context={context} />);
    const button = within(bar()).getByRole('button', { name: MAKE_MILESTONE_LABEL });
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).toHaveAccessibleDescription(resourcedReason(2));
    fireEvent.click(button);
    expect(context.onMakeMilestone).not.toHaveBeenCalled();
  });

  it('is shaded without the pen, with the derivation’s pen sentence', () => {
    const reason = 'Start editing to edit activity details.';
    render(
      <SelectionActionsBar
        context={ctx({
          canEditSchedule: false,
          makeMilestone: { applies: true, enabled: false, reason },
        })}
      />,
    );
    const button = within(bar()).getByRole('button', { name: MAKE_MILESTONE_LABEL });
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).toHaveAccessibleDescription(reason);
  });
});

describe('the Gantt row menu', () => {
  const openMenu = (context: SelectionBarContext) => {
    render(<GanttRowMenu context={() => context} activityName="Pour slab" />);
    fireEvent.click(screen.getByRole('button', { name: 'Actions for Pour slab' }));
  };

  it('offers the same item as text and runs the same handler', () => {
    const context = ctx();
    openMenu(context);
    fireEvent.click(screen.getByRole('menuitem', { name: MAKE_MILESTONE_LABEL }));
    expect(context.onMakeMilestone).toHaveBeenCalledOnce();
  });

  it('shades it with the assignments reason', () => {
    openMenu(ctx({ makeMilestone: { applies: true, enabled: false, reason: resourcedReason(1) } }));
    const item = screen.getByRole('menuitem', { name: MAKE_MILESTONE_LABEL });
    expect(item).toHaveAttribute('aria-disabled', 'true');
    expect(item).toHaveAccessibleDescription(resourcedReason(1));
  });

  it('omits it when it does not apply', () => {
    openMenu(ctx({ makeMilestone: { applies: false } }));
    expect(screen.queryByRole('menuitem', { name: MAKE_MILESTONE_LABEL })).toBeNull();
  });
});
