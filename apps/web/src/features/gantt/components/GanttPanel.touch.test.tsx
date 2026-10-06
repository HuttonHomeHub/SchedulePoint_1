import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { GanttBarDrag } from '../model/bar-drag';
import { TOUCH_ARM_HINT } from '../model/touch-note';

import { GANTT_ROW_HEIGHT, GanttPanel } from './GanttPanel';

import type { SelectionBarContext } from '@/features/plan-actions/selection-actions';
import { anActivity } from '@/test/activity-fixture';

/**
 * **The Gantt under a finger and a stylus** (ADR-0177) — the wiring, in jsdom.
 *
 * What jsdom cannot say is whether a browser scrolls instead of dragging: that is `touch-action`
 * read at `pointerdown`, and `e2e-gantt-editing/touch.spec.ts` drives it. This file asserts what the
 * panel DECIDES — which classes a bar carries, what a selection says, and what `contextmenu` does —
 * which is all in React and all checkable here.
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

const task = (over: Partial<Parameters<typeof anActivity>[0]> = {}) =>
  anActivity({
    id: 'a1',
    code: 'A1',
    name: 'Excavate',
    earlyStart: '2026-01-05',
    earlyFinish: '2026-01-09',
    ...over,
  });

const dragBundle = (over: Partial<GanttBarDrag> = {}): GanttBarDrag => ({
  canEdit: true,
  reason: null,
  plannedStartIso: '2026-01-01',
  isWorkingDay: null,
  moveTo: vi.fn(() => Promise.resolve()),
  resizeTo: vi.fn(() => Promise.resolve()),
  resizeStart: vi.fn(() => Promise.resolve()),
  announce: vi.fn(),
  ...over,
});

const rowContext = (): SelectionBarContext => ({
  canvas: null,
  targetName: 'Excavate',
  definitionGate: null,
  makeMilestone: { applies: false },
  onMakeMilestone: vi.fn(),
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
});

const rowStructure = {
  canEditSchedule: true,
  penRefusal: null,
  onReparent: () => {},
  onInsert: () => {},
};

const bar = (container: HTMLElement) =>
  container.querySelector<HTMLElement>('[data-activity-id] span[style*="cursor"]')!;
const edge = (container: HTMLElement, which: 'start' | 'finish') =>
  container.querySelector(`[data-bar-edge="${which}"]`);

beforeEach(() => window.sessionStorage.clear());

describe('a selected bar is armed for a finger (ADR-0177 D2)', () => {
  it('carries pan-y, touch-none edges and a shape cue only while selected', () => {
    const unselected = render(<GanttPanel activities={[task()]} drag={dragBundle()} />);
    expect(bar(unselected.container)).not.toHaveClass('touch-pan-y');
    expect(bar(unselected.container)).not.toHaveAttribute('data-bar-armed');
    expect(edge(unselected.container, 'start')).not.toHaveClass('touch-none');
    expect(edge(unselected.container, 'finish')).not.toHaveClass('touch-none');
    unselected.unmount();

    const selected = render(
      <GanttPanel activities={[task()]} drag={dragBundle()} selectedActivityId="a1" />,
    );
    expect(bar(selected.container)).toHaveClass('touch-pan-y');
    expect(bar(selected.container)).toHaveAttribute('data-bar-armed', 'true');
    expect(edge(selected.container, 'start')).toHaveClass('touch-none');
    expect(edge(selected.container, 'finish')).toHaveClass('touch-none');
    // Not colour alone (WCAG 1.4.1): an offset outline AND grip marks, both shapes.
    expect(bar(selected.container)).toHaveClass('outline-2');
    expect(selected.container.querySelector('[data-bar-grip]')?.children).toHaveLength(3);
  });

  it('does not arm a selected bar that cannot move', () => {
    const { container } = render(
      <GanttPanel
        activities={[task({ type: 'WBS_SUMMARY' })]}
        drag={dragBundle()}
        selectedActivityId="a1"
      />,
    );
    const summary = container.querySelector<HTMLElement>('[data-activity-id] span[title]')!;
    expect(summary).not.toHaveClass('touch-pan-y');
    expect(summary).not.toHaveAttribute('data-bar-armed');
  });

  it('puts no gesture class behind a pointer-coarse variant (D1)', () => {
    // Gesture remedies key on the event and `touch-action`, never on the media query: the Surface
    // reports `pointer: fine` with the cover attached (ADR-0118 D7), so a media-keyed gesture fix
    // would reach nobody in that posture.
    const here = join(__dirname);
    for (const file of ['GanttPanel.tsx', '../model/use-bar-pointer-drag.ts']) {
      const source = readFileSync(join(here, file), 'utf8');
      expect(source, file).not.toMatch(/pointer-coarse:[^\s"'`]*touch-/);
      expect(source, file).not.toMatch(/pointer-coarse:[^\s"'`]*(?:cursor|select-none)/);
    }
  });
});

describe('what a finger or stylus is told when it selects a bar', () => {
  const touchClick = (target: Element, pointerType: string) => {
    fireEvent.pointerDown(target, { pointerType, button: 0, clientX: 100 });
    window.dispatchEvent(new PointerEvent('pointerup', { pointerType }));
    fireEvent.click(target);
  };

  it('shows a refused bar its reason in a status node, and not for a mouse', () => {
    const reason = 'Start editing to change this activity.';
    const view = render(
      <GanttPanel
        activities={[task()]}
        drag={dragBundle({ canEdit: false, reason })}
        selectedActivityId="a1"
        onSelectActivity={() => {}}
      />,
    );
    const row = screen.getByRole('row', { name: /Excavate/ });
    touchClick(row, 'mouse');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    touchClick(row, 'touch');
    expect(screen.getByRole('status')).toHaveTextContent(reason);
    view.unmount();
  });

  it('says it for a stylus too', () => {
    render(
      <GanttPanel
        activities={[task({ type: 'WBS_SUMMARY' })]}
        drag={dragBundle()}
        selectedActivityId="a1"
        onSelectActivity={() => {}}
      />,
    );
    touchClick(screen.getByRole('row', { name: /Excavate/ }), 'pen');
    expect(screen.getByRole('status')).toHaveTextContent('A summary follows');
  });

  it('gives the first touch selection of a session the hint, and later ones nothing', () => {
    const view = render(
      <GanttPanel
        activities={[task()]}
        drag={dragBundle()}
        selectedActivityId="a1"
        onSelectActivity={() => {}}
      />,
    );
    const row = screen.getByRole('row', { name: /Excavate/ });
    touchClick(row, 'touch');
    expect(screen.getByRole('status')).toHaveTextContent(TOUCH_ARM_HINT);

    view.rerender(
      <GanttPanel
        activities={[task()]}
        drag={dragBundle()}
        selectedActivityId={undefined}
        onSelectActivity={() => {}}
      />,
    );
    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    view.rerender(
      <GanttPanel
        activities={[task()]}
        drag={dragBundle()}
        selectedActivityId="a1"
        onSelectActivity={() => {}}
      />,
    );
    touchClick(row, 'touch');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});

describe('a row opens its menu on contextmenu (ADR-0177 D3)', () => {
  const renderRow = (over: { selected?: boolean; onSelectActivity?: () => void } = {}) =>
    render(
      <GanttPanel
        activities={[task(), task({ id: 'a2', code: 'A2', name: 'Pour slab' })]}
        drag={dragBundle()}
        rowMenuContextFor={rowContext}
        rowStructure={rowStructure}
        {...(over.selected === true ? { selectedActivityId: 'a1' } : {})}
        onSelectActivity={over.onSelectActivity ?? (() => {})}
      />,
    );
  const row = () => screen.getByRole('row', { name: /Excavate/ });
  const itemNames = () => screen.getAllByRole('menuitem').map((el) => el.textContent);

  it('opens the same items the ⋯ opens, named for the activity', () => {
    renderRow();
    fireEvent.click(screen.getByRole('button', { name: 'Actions for Excavate' }));
    const viaButton = itemNames();
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();

    fireEvent.contextMenu(row(), { clientX: 120, clientY: 40 });
    expect(screen.getByRole('menu', { name: 'Actions for Excavate' })).toBeInTheDocument();
    expect(itemNames()).toEqual(viaButton);
    expect(itemNames()).toContain('Indent');
  });

  it('cancels preventDefault for the browser only when it opened a menu', () => {
    renderRow();
    expect(fireEvent.contextMenu(row(), { clientX: 120, clientY: 40 })).toBe(false);
  });

  it('leaves Shift+right-click to the browser', () => {
    renderRow();
    expect(fireEvent.contextMenu(row(), { clientX: 120, clientY: 40, shiftKey: true })).toBe(true);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('leaves an event inside an open cell input to the browser', () => {
    renderRow();
    const input = document.createElement('input');
    row().appendChild(input);
    expect(fireEvent.contextMenu(input, { clientX: 120, clientY: 40 })).toBe(true);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('opens nothing where the host supplies no menu context', () => {
    render(<GanttPanel activities={[task()]} drag={dragBundle()} />);
    expect(fireEvent.contextMenu(row(), { clientX: 120, clientY: 40 })).toBe(true);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('anchors a keyboard-origin event to the row, and does not open a second menu', () => {
    renderRow();
    fireEvent.contextMenu(row(), { clientX: 0, clientY: 0 });
    expect(screen.getAllByRole('menu')).toHaveLength(1);
    // The keydown path may already have opened it; a second event must not stack another.
    fireEvent.contextMenu(row(), { clientX: 0, clientY: 0 });
    expect(screen.getAllByRole('menu')).toHaveLength(1);
  });

  it('hands focus back to the row when it closes', () => {
    renderRow();
    fireEvent.contextMenu(row(), { clientX: 120, clientY: 40 });
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(row()).toHaveFocus();
  });

  it('does not change the selection, including the click a touch hold ends in', () => {
    const onSelectActivity = vi.fn();
    renderRow({ selected: true, onSelectActivity });
    fireEvent.pointerDown(row(), { pointerType: 'touch', button: 0, clientX: 120, clientY: 40 });
    fireEvent.contextMenu(row(), { clientX: 120, clientY: 40 });
    fireEvent.click(row());
    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(onSelectActivity).not.toHaveBeenCalled();

    // Only that one click: the next real press selects as ever.
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    fireEvent.pointerDown(row(), { pointerType: 'touch', button: 0, clientX: 120, clientY: 40 });
    fireEvent.click(row());
    expect(onSelectActivity).toHaveBeenCalledOnce();
  });

  describe('against a live drag', () => {
    const press = (container: HTMLElement) => {
      fireEvent.pointerDown(bar(container), {
        pointerType: 'touch',
        button: 0,
        clientX: 100,
        pointerId: 1,
      });
    };
    const moveTo = (clientX: number) =>
      act(() => {
        window.dispatchEvent(new PointerEvent('pointermove', { clientX, pointerId: 1 }));
      });

    it('a hold on the still bar cancels the drag first: no ghost, no Escape listener', () => {
      const removed = vi.spyOn(window, 'removeEventListener');
      const view = render(
        <GanttPanel
          activities={[task()]}
          drag={dragBundle()}
          selectedActivityId="a1"
          rowMenuContextFor={rowContext}
          onSelectActivity={() => {}}
        />,
      );
      press(view.container);
      expect(bar(view.container).style.opacity).toBe('0.75');

      fireEvent.contextMenu(row(), { clientX: 100, clientY: 40 });
      expect(screen.getByRole('menu')).toBeInTheDocument();
      expect(bar(view.container).style.opacity).not.toBe('0.75');
      expect(removed).toHaveBeenCalledWith('keydown', expect.any(Function), true);
      removed.mockRestore();
    });

    it('a press that has moved past the threshold opens nothing, and the drag carries on', () => {
      const moveSpy = vi.fn(() => Promise.resolve());
      const view = render(
        <GanttPanel
          activities={[task()]}
          drag={dragBundle({ moveTo: moveSpy })}
          selectedActivityId="a1"
          rowMenuContextFor={rowContext}
          onSelectActivity={() => {}}
        />,
      );
      press(view.container);
      moveTo(140);
      expect(fireEvent.contextMenu(row(), { clientX: 140, clientY: 40 })).toBe(true);
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();

      act(() => {
        window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1 }));
      });
      expect(moveSpy).toHaveBeenCalledOnce();
    });
  });
});
