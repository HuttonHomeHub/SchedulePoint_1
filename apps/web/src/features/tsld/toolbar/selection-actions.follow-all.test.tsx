import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  SelectionActionsBar,
  type SelectionBarContext,
} from '@/features/plan-actions/selection-actions';

/**
 * **The arrow on Follow logic** (ADR-0216 D6, the short-window route to the whole-plan offer).
 *
 * Whether a bar gets the arrow at all is the builder's decision (`build-selection-context.follow-all.test.ts`).
 * What is left here is the control: that it is today's plain button when the host offers nothing, a split
 * button when it does, that the menu item names the count and calls the host's write once, and that every
 * way it can be shaded says why and stays focusable (ADR-0082, ADR-0204).
 */
const spies = {
  onOpenLogic: vi.fn(),
  onEdit: vi.fn(),
  onDelete: vi.fn(),
  onResources: vi.fn(),
  onProgress: vi.fn(),
  onDissolve: vi.fn(),
  onDuplicate: vi.fn(),
  onDuplicateBand: vi.fn(),
  onClearVisualPlacement: vi.fn(),
  onFollowAll: vi.fn(),
  onOpenEditorAt: vi.fn(),
};

function ctx(over: Partial<SelectionBarContext> = {}): SelectionBarContext {
  return {
    canvas: null,
    targetName: 'Excavate',
    // Make milestone… does not apply to this fixture's activity (ADR-0162 decision 4).
    definitionGate: null,
    makeMilestone: { applies: false },
    onMakeMilestone: vi.fn(),
    floatPathsOpen: false,
    toggleFloatPaths: null,
    canEditSchedule: true,
    scheduleRefusal: (action: string) => `Start editing to ${action}.`,
    canReportProgress: true,
    canWriteNotes: true,
    onNotes: vi.fn(),
    isSummary: false,
    // This whole suite is about a control that only exists for a PLACED activity (M-F-T6).
    hasPlacement: true,
    conflictKey: null,
    conflictKeys: [],
    clearPlacement: { enabled: true, reason: null },
    // Visible unless a case says otherwise — the fixtures' status quo (M1).
    onClearVisualPlacement: spies.onClearVisualPlacement,
    onOpenEditorAt: spies.onOpenEditorAt,
    onOpenLogic: spies.onOpenLogic,
    onEdit: spies.onEdit,
    onDelete: spies.onDelete,
    onResources: spies.onResources,
    onProgress: spies.onProgress,
    onDissolve: spies.onDissolve,
    onDuplicate: spies.onDuplicate,
    onDuplicateBand: spies.onDuplicateBand,
    ...over,
  };
}

const followAll = (over: Partial<NonNullable<SelectionBarContext['followAll']>> = {}) => ({
  count: 3,
  reason: null,
  onFollowAll: spies.onFollowAll,
  ...over,
});

const bar = (): HTMLElement => screen.getByRole('toolbar', { name: 'Actions for Excavate' });
const primary = (): HTMLElement => within(bar()).getByRole('button', { name: 'Follow logic' });
const arrow = (): HTMLElement =>
  within(bar()).getByRole('button', { name: 'More Follow logic choices' });

beforeEach(() => vi.clearAllMocks());

describe('the arrow on Follow logic', () => {
  it("is today's plain button when the host offers nothing, or offers null", () => {
    const { rerender } = render(<SelectionActionsBar context={ctx()} />);
    expect(within(bar()).queryByRole('button', { name: 'More Follow logic choices' })).toBeNull();
    rerender(<SelectionActionsBar context={ctx({ followAll: null })} />);
    expect(within(bar()).queryByRole('button', { name: 'More Follow logic choices' })).toBeNull();
    fireEvent.click(primary());
    expect(spies.onClearVisualPlacement).toHaveBeenCalledOnce();
    expect(primary()).toHaveAttribute('data-toolbar-item', 'clear-visual-placement');
  });

  it('keeps the primary half for this bar only, and the pair is one roving stop', () => {
    render(<SelectionActionsBar context={ctx({ followAll: followAll() })} />);
    fireEvent.click(primary());
    expect(spies.onClearVisualPlacement).toHaveBeenCalledOnce();
    expect(spies.onFollowAll).not.toHaveBeenCalled();
    expect(primary()).toHaveAttribute('data-toolbar-item', 'clear-visual-placement');
    expect(arrow()).toHaveAttribute('tabindex', '-1');
    expect(arrow()).toHaveAttribute('aria-haspopup', 'menu');
  });

  it.each([
    [2, 'Let all 2 bars follow their logic'],
    [3, 'Let all 3 bars follow their logic'],
    [12, 'Let all 12 bars follow their logic'],
  ])('names the count it will move: %i', (count, name) => {
    render(<SelectionActionsBar context={ctx({ followAll: followAll({ count }) })} />);
    fireEvent.click(arrow());
    expect(screen.getByRole('menuitem', { name })).toBeInTheDocument();
  });

  it('presses once and closes, returning focus to the primary rather than the arrow', () => {
    render(<SelectionActionsBar context={ctx({ followAll: followAll() })} />);
    fireEvent.click(arrow());
    fireEvent.click(screen.getByRole('menuitem', { name: 'Let all 3 bars follow their logic' }));
    expect(spies.onFollowAll).toHaveBeenCalledOnce();
    expect(spies.onClearVisualPlacement).not.toHaveBeenCalled();
    expect(screen.queryByRole('menu')).toBeNull();
    expect(primary()).toHaveFocus();
  });

  it('opens from the primary with ArrowDown, and Escape puts focus back on it', () => {
    render(<SelectionActionsBar context={ctx({ followAll: followAll() })} />);
    primary().focus();
    fireEvent.keyDown(primary(), { key: 'ArrowDown' });
    expect(screen.getByRole('menu', { name: 'Follow logic choices' })).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(primary()).toHaveFocus();
  });

  it('shades the item with its reason, keeps it focusable, and never calls the write', () => {
    render(
      <SelectionActionsBar
        context={ctx({
          followAll: followAll({ reason: 'Already moving these bars; wait for it to finish.' }),
        })}
      />,
    );
    fireEvent.click(arrow());
    const item = screen.getByRole('menuitem', { name: 'Let all 3 bars follow their logic' });
    expect(item).toHaveAttribute('aria-disabled', 'true');
    expect(item).toHaveAccessibleDescription('Already moving these bars; wait for it to finish.');
    fireEvent.click(item);
    expect(spies.onFollowAll).not.toHaveBeenCalled();
  });

  it('shades both halves with the pen sentence the plain button carries, and says it on each', () => {
    render(
      <SelectionActionsBar
        context={ctx({
          followAll: followAll(),
          clearPlacement: { enabled: false, reason: 'Take the edit lock to change this plan.' },
        })}
      />,
    );
    for (const half of [primary(), arrow()]) {
      expect(half).toHaveAttribute('aria-disabled', 'true');
      expect(half).toHaveAccessibleDescription('Take the edit lock to change this plan.');
    }
    fireEvent.click(primary());
    fireEvent.click(arrow());
    expect(spies.onClearVisualPlacement).not.toHaveBeenCalled();
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('is reachable by keyboard while shaded, so its reason can be read', () => {
    render(
      <SelectionActionsBar
        context={ctx({
          followAll: followAll(),
          clearPlacement: { enabled: false, reason: 'Take the edit lock to change this plan.' },
        })}
      />,
    );
    primary().focus();
    fireEvent.keyDown(primary(), { key: 'ArrowDown' });
    expect(arrow()).toHaveFocus();
  });

  it('keeps the conflict reason as the description of the plain and the split primary alike', () => {
    const conflicted = {
      conflictKey: 'visualEarlierThanLogic',
      conflictKeys: ['visualEarlierThanLogic'],
    } as const;
    const { rerender } = render(<SelectionActionsBar context={ctx({ ...conflicted })} />);
    const reason = primary().getAttribute('aria-describedby');
    expect(reason).not.toBeNull();
    const plainDescription = document.getElementById(reason ?? '')?.textContent;
    expect(plainDescription).toBeTruthy();
    rerender(<SelectionActionsBar context={ctx({ ...conflicted, followAll: followAll() })} />);
    expect(primary()).toHaveAccessibleName('Follow logic');
    expect(primary()).toHaveAccessibleDescription(plainDescription);
  });

  it('Escape inside the menu closes only the menu: nothing above the bar hears it', () => {
    const onClear = vi.fn();
    const heard = vi.fn();
    document.addEventListener('keydown', heard);
    render(<SelectionActionsBar context={ctx({ followAll: followAll() })} onClear={onClear} />);
    fireEvent.click(arrow());
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    document.removeEventListener('keydown', heard);
    expect(screen.queryByRole('menu')).toBeNull();
    expect(onClear).not.toHaveBeenCalled();
    expect(heard.mock.calls.filter(([e]) => (e as KeyboardEvent).key === 'Escape')).toHaveLength(0);
  });

  it('Enter on the shaded menu item writes nothing', () => {
    render(
      <SelectionActionsBar
        context={ctx({ followAll: followAll({ reason: 'Too many to follow at once.' }) })}
      />,
    );
    fireEvent.click(arrow());
    fireEvent.keyDown(screen.getByRole('menuitem'), { key: 'Enter' });
    expect(spies.onFollowAll).not.toHaveBeenCalled();
  });

  it('the split primary is a command: it carries no aria-pressed', () => {
    render(<SelectionActionsBar context={ctx({ followAll: followAll() })} />);
    expect(primary()).not.toHaveAttribute('aria-pressed');
  });
});
