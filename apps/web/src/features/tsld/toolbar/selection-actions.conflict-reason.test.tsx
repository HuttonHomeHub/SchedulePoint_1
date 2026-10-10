import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  SelectionActionsBar,
  type SelectionBarContext,
} from '@/features/plan-actions/selection-actions';

/**
 * **The reason on the bar** (conflict-reason-on-object, ADR-0186). A flagged selection states why,
 * on its own line above the controls, in words; the control that answers it carries the same reason
 * as its description; and nothing about the line can take focus or speak on its own.
 *
 * Written red first: against the pre-change bar every case below fails (no caption exists, the
 * remedy has no description, Clear visual start has none).
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
    // A placement conflict presupposes a PLACEMENT, so the bar's clear action is present here by
    // construction (M-F-T6). Setting this false would make the remedy cases assert against a bar
    // that cannot hold the control they are about.
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

const bar = () => screen.getByRole('toolbar', { name: 'Actions for Excavate' });
const line = () => document.querySelector<HTMLElement>('[data-conflict-reason]');

beforeEach(() => vi.clearAllMocks());

describe('the conflict reason line', () => {
  it('renders nothing for an unflagged activity, so the bar is as it was', () => {
    render(<SelectionActionsBar context={ctx()} />);
    expect(line()).toBeNull();
  });

  it.each([
    ['constraintViolated', 'Constraint not met'],
    ['visualEarlierThanLogic', 'Placed before its logic allows'],
    ['visualLaterThanBound', 'Placed after its constraint date'],
    ['levelingWindowExceeded', "Can't be levelled within its window"],
  ] as const)('states the %s reason in words', (key, text) => {
    render(<SelectionActionsBar context={ctx({ conflictKey: key, conflictKeys: [key] })} />);
    expect(line()).toHaveTextContent(text);
  });

  it('names every reason of a two-flag activity, in flag order, with one capital', () => {
    render(
      <SelectionActionsBar
        context={ctx({
          conflictKey: 'constraintViolated',
          conflictKeys: ['constraintViolated', 'levelingWindowExceeded'],
        })}
      />,
    );
    expect(line()).toHaveTextContent("Constraint not met, can't be levelled within its window");
    // The remedy answers the LEADING reason only: one route, and not the levelling one.
    expect(within(bar()).getAllByRole('button', { name: /^Review / })).toHaveLength(1);
    expect(
      within(bar()).getByRole('button', { name: 'Review the constraint…' }),
    ).toBeInTheDocument();
    expect(within(bar()).queryByRole('button', { name: 'Review resources…' })).toBeNull();
  });

  it('names a second reason behind a leading barAction, which has no route control', () => {
    render(
      <SelectionActionsBar
        context={ctx({
          conflictKey: 'visualEarlierThanLogic',
          conflictKeys: ['visualEarlierThanLogic', 'levelingWindowExceeded'],
        })}
      />,
    );
    expect(line()).toHaveTextContent(
      "Placed before its logic allows, can't be levelled within its window",
    );
    expect(bar().querySelector('[data-toolbar-item="conflict-remedy"]')).toBeNull();
  });

  it('is not a control: no tabindex, role, live region, hidden flag or truncation', () => {
    render(
      <SelectionActionsBar
        context={ctx({ conflictKey: 'constraintViolated', conflictKeys: ['constraintViolated'] })}
      />,
    );
    const el = line();
    expect(el).not.toBeNull();
    for (const node of [el, ...(el?.querySelectorAll('*') ?? [])]) {
      expect(node?.hasAttribute('tabindex')).toBe(false);
      expect(node?.hasAttribute('role')).toBe(false);
      expect(node?.hasAttribute('aria-live')).toBe(false);
      expect(node?.hasAttribute('data-toolbar-focusable')).toBe(false);
      expect(node?.hasAttribute('data-toolbar-item')).toBe(false);
    }
    expect(el?.getAttribute('aria-hidden')).toBeNull();
    expect(el?.className).not.toMatch(/truncate|text-ellipsis|overflow-hidden/);
    // Its icon is decoration: the words carry the meaning (WCAG 1.4.1).
    expect(el?.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('is not part of the toolbar, so it can take no roving stop', () => {
    render(
      <SelectionActionsBar
        context={ctx({ conflictKey: 'constraintViolated', conflictKeys: ['constraintViolated'] })}
      />,
    );
    expect(bar().contains(line())).toBe(false);
  });

  it('is replaced in place when the selection moves, never stacked', () => {
    const { rerender } = render(
      <SelectionActionsBar
        context={ctx({ conflictKey: 'constraintViolated', conflictKeys: ['constraintViolated'] })}
      />,
    );
    rerender(
      <SelectionActionsBar
        context={ctx({
          conflictKey: 'visualLaterThanBound',
          conflictKeys: ['visualLaterThanBound'],
        })}
      />,
    );
    expect(document.querySelectorAll('[data-conflict-reason]')).toHaveLength(1);
    expect(line()).toHaveTextContent('Placed after its constraint date');
  });

  it('leaves when the conflict resolves, without remounting the toolbar', () => {
    const { rerender } = render(
      <SelectionActionsBar
        context={ctx({ conflictKey: 'constraintViolated', conflictKeys: ['constraintViolated'] })}
      />,
    );
    const toolbarBefore = bar();
    rerender(<SelectionActionsBar context={ctx()} />);
    expect(line()).toBeNull();
    expect(bar()).toBe(toolbarBefore);
  });
});

describe('the control that answers the conflict carries the reason as its description', () => {
  it('describes the route remedy with the leading reason and leaves its name alone', () => {
    render(
      <SelectionActionsBar
        context={ctx({
          conflictKey: 'constraintViolated',
          conflictKeys: ['constraintViolated', 'levelingWindowExceeded'],
        })}
      />,
    );
    const remedy = within(bar()).getByRole('button', { name: 'Review the constraint…' });
    expect(remedy).toHaveAccessibleDescription('Constraint not met');
    expect(remedy).toHaveAccessibleName('Review the constraint…');
  });

  it('describes Clear visual start when it IS the remedy', () => {
    render(
      <SelectionActionsBar
        context={ctx({
          conflictKey: 'visualEarlierThanLogic',
          conflictKeys: ['visualEarlierThanLogic'],
        })}
      />,
    );
    const clear = within(bar()).getByRole('button', { name: 'Clear visual start' });
    expect(clear).toHaveAccessibleDescription('Placed before its logic allows');
  });

  it('describes Clear visual start for a Viewer, whose button is shaded', () => {
    render(
      <SelectionActionsBar
        context={ctx({
          conflictKey: 'visualEarlierThanLogic',
          conflictKeys: ['visualEarlierThanLogic'],
          canEditSchedule: false,
          clearPlacement: { enabled: false, reason: 'Start editing to clear the placement.' },
        })}
      />,
    );
    const clear = within(bar()).getByRole('button', { name: 'Clear visual start' });
    expect(clear.getAttribute('aria-describedby')).toBeTruthy();
    expect(clear).toHaveAccessibleDescription(/Placed before its logic allows/);
  });

  it('gives Clear visual start NO reason when the route carries it (later-than-bound)', () => {
    render(
      <SelectionActionsBar
        context={ctx({
          conflictKey: 'visualLaterThanBound',
          conflictKeys: ['visualLaterThanBound'],
        })}
      />,
    );
    const clear = within(bar()).getByRole('button', { name: 'Clear visual start' });
    expect(clear).not.toHaveAccessibleDescription(/Placed after/);
  });

  it('every aria-describedby id on the bar resolves to an element', () => {
    render(
      <SelectionActionsBar
        context={ctx({ conflictKey: 'constraintViolated', conflictKeys: ['constraintViolated'] })}
      />,
    );
    for (const el of bar().querySelectorAll('[aria-describedby]')) {
      for (const id of (el.getAttribute('aria-describedby') ?? '').split(/\s+/)) {
        expect(document.getElementById(id), `#${id} must exist`).not.toBeNull();
      }
    }
  });

  it('a click on the line moves no focus onto it', () => {
    render(
      <SelectionActionsBar
        context={ctx({ conflictKey: 'constraintViolated', conflictKeys: ['constraintViolated'] })}
      />,
    );
    const el = line();
    if (!el) throw new Error('no line');
    fireEvent.mouseDown(el);
    fireEvent.click(el);
    expect(document.activeElement).not.toBe(el);
  });
});
