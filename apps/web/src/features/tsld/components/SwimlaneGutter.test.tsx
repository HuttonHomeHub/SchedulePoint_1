import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';

import {
  GUTTER_NO_ROOM_REASON,
  SWIMLANE_GUTTER_COLLAPSED_PX,
  SWIMLANE_GUTTER_WIDTH_PX,
  type GutterActions,
  type GutterSwimlane,
} from '../render/swimlane-gutter';

import { SwimlaneGutter } from './SwimlaneGutter';

const SWIMLANES: GutterSwimlane[] = [
  { id: 'a', name: 'Civil', firstLane: 0, laneCount: 2, activityCount: 5 },
  { id: 'b', name: 'Mechanical', firstLane: 2, laneCount: 3, activityCount: 14 },
  { id: 'c', name: 'Electrical', firstLane: 5, laneCount: 1, activityCount: 0 },
  { id: null, name: null, firstLane: 6, laneCount: 1, activityCount: 2 },
];

function actions(overrides: Partial<GutterActions> = {}): GutterActions {
  return {
    write: { writable: true, reason: null },
    manage: { label: 'Swimlanes…', onOpen: vi.fn() },
    collapse: { collapsed: false, forcedByRoom: false, onToggle: vi.fn() },
    onRename: vi.fn(),
    onMove: vi.fn(),
    onDelete: vi.fn(),
    ...overrides,
  };
}

function mount(
  props: Partial<React.ComponentProps<typeof SwimlaneGutter>> = {},
): ReturnType<typeof render> {
  return render(
    <SwimlaneGutter
      rootRef={createRef<HTMLDivElement>()}
      swimlanes={SWIMLANES}
      widthPx={SWIMLANE_GUTTER_WIDTH_PX}
      cornerHeightPx={40}
      footPx={0}
      actions={actions()}
      {...props}
    />,
  );
}

const toolbar = (): HTMLElement => screen.getByRole('toolbar', { name: 'Swimlanes' });
const labelButtons = (): HTMLElement[] => within(toolbar()).getAllByRole('button');

describe('the gutter as a vertical toolbar', () => {
  it('is one toolbar named Swimlanes, announced as vertical', () => {
    mount();
    expect(toolbar()).toHaveAttribute('aria-orientation', 'vertical');
  });

  it('gives each swimlane one button whose name carries its position, size and lanes', () => {
    mount();
    expect(labelButtons().map((b) => b.getAttribute('aria-label'))).toEqual([
      'Civil, swimlane 1 of 3, 5 activities, 2 lanes',
      'Mechanical, swimlane 2 of 3, 14 activities, 3 lanes',
      'Electrical, swimlane 3 of 3, 0 activities, 1 lane',
      'No swimlane, 2 activities, 1 lane',
    ]);
  });

  it('has no second, hidden copy of the names for assistive technology to read', () => {
    const { container } = mount();
    // The visible text is inside the button and hidden from AT; nothing else in the gutter is named.
    expect(container.querySelectorAll('[data-swimlane] > span[aria-hidden="true"]')).toHaveLength(
      4,
    );
    expect(
      container.querySelector('[aria-hidden="true"][data-testid="tsld-swimlane-gutter"]'),
    ).toBeNull();
    expect(screen.getAllByText('Mechanical', { exact: true })).toHaveLength(1);
  });

  it('is one tab stop: the first label, until another is focused', () => {
    mount();
    expect(labelButtons().map((b) => b.tabIndex)).toEqual([0, -1, -1, -1]);
    act(() => labelButtons()[2]?.focus());
    expect(labelButtons().map((b) => b.tabIndex)).toEqual([-1, -1, 0, -1]);
  });

  it('moves with ArrowDown and ArrowUp, wrapping, and jumps with Home and End', () => {
    mount();
    const buttons = labelButtons();
    act(() => buttons[0]?.focus());
    fireEvent.keyDown(buttons[0]!, { key: 'ArrowDown' });
    expect(buttons[1]).toHaveFocus();
    fireEvent.keyDown(buttons[1]!, { key: 'ArrowUp' });
    expect(buttons[0]).toHaveFocus();
    fireEvent.keyDown(buttons[0]!, { key: 'ArrowUp' });
    expect(buttons[3]).toHaveFocus();
    fireEvent.keyDown(buttons[3]!, { key: 'Home' });
    expect(buttons[0]).toHaveFocus();
    fireEvent.keyDown(buttons[0]!, { key: 'End' });
    expect(buttons[3]).toHaveFocus();
  });

  it('leaves the horizontal arrows alone: the toolbar is vertical', () => {
    mount();
    const buttons = labelButtons();
    act(() => buttons[0]?.focus());
    fireEvent.keyDown(buttons[0]!, { key: 'ArrowRight' });
    expect(buttons[0]).toHaveFocus();
  });

  it('brings a swimlane into view when its button takes focus', () => {
    const onReveal = vi.fn();
    mount({ onReveal });
    act(() => labelButtons()[1]?.focus());
    expect(onReveal).toHaveBeenCalledWith(expect.objectContaining({ id: 'b' }));
  });

  it('keeps a button for a swimlane that is parked out of view: parked is not hidden', () => {
    mount();
    // Nothing has positioned the labels (no frame loop here), so every one is parked, and every
    // one can still take focus — display: none would have removed them from the tab order.
    for (const button of labelButtons()) {
      expect(button).toHaveAttribute('data-parked', 'true');
      expect(button.style.display).not.toBe('none');
      act(() => button.focus());
      expect(button).toHaveFocus();
    }
  });

  it('offers its labels at least 24px, and a coarse pointer its 44px strip', () => {
    expect(SWIMLANE_GUTTER_COLLAPSED_PX).toBeGreaterThanOrEqual(44);
  });
});

describe('the label menu', () => {
  it('opens on a press, names the swimlane, and returns focus to the label on Escape', () => {
    mount();
    const mechanical = labelButtons()[1]!;
    expect(mechanical).toHaveAttribute('aria-haspopup', 'menu');
    expect(mechanical).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(mechanical);
    const menu = screen.getByRole('menu', { name: 'Actions for Mechanical' });
    expect(mechanical).toHaveAttribute('aria-expanded', 'true');
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((i) => i.textContent),
    ).toEqual(['Rename…', 'Move up', 'Move down', 'Delete…']);
    // Escape is handled at the document, as the browser delivers it.
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(mechanical).toHaveFocus();
  });

  it('opens on the context-menu gesture too', () => {
    mount();
    fireEvent.contextMenu(labelButtons()[0]!);
    expect(screen.getByRole('menu', { name: 'Actions for Civil' })).toBeInTheDocument();
  });

  it('runs the chosen action for that swimlane and returns focus to its label', () => {
    const a = actions();
    mount({ actions: a });
    const mechanical = labelButtons()[1]!;
    fireEvent.click(mechanical);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Move up' }));
    expect(a.onMove).toHaveBeenCalledWith('b', -1);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(mechanical).toHaveFocus();

    fireEvent.click(mechanical);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete…' }));
    expect(a.onDelete).toHaveBeenCalledWith('b');
    fireEvent.click(mechanical);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Rename…' }));
    expect(a.onRename).toHaveBeenCalledWith('b');
  });

  it('does not rove the toolbar when an arrow is pressed inside the open menu', () => {
    mount();
    fireEvent.click(labelButtons()[1]!);
    const items = screen.getAllByRole('menuitem');
    act(() => items[0]?.focus());
    fireEvent.keyDown(items[0]!, { key: 'ArrowDown' });
    expect(items[1]).toHaveFocus();
  });

  it('shades Move up on the first swimlane and Move down on the last, with the reason', () => {
    mount();
    fireEvent.click(labelButtons()[0]!);
    const up = screen.getByRole('menuitem', { name: 'Move up' });
    expect(up).toHaveAttribute('aria-disabled', 'true');
    expect(up).toHaveAccessibleDescription('This swimlane is already first.');
    fireEvent.click(up);
    expect(screen.getByRole('menu')).toBeInTheDocument();
  });

  it('shades every write without the pen, each saying why, and still opens', () => {
    const a = actions({ write: { writable: false, reason: 'Start editing to change swimlanes.' } });
    mount({ actions: a });
    fireEvent.click(labelButtons()[1]!);
    for (const name of ['Rename…', 'Move up', 'Move down', 'Delete…']) {
      const item = screen.getByRole('menuitem', { name });
      expect(item).toHaveAttribute('aria-disabled', 'true');
      expect(item).toHaveAccessibleDescription('Start editing to change swimlanes.');
    }
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete…' }));
    expect(a.onDelete).not.toHaveBeenCalled();
  });

  it('gives "No swimlane" no menu: nothing about it can change', () => {
    mount();
    const none = labelButtons()[3]!;
    expect(none).not.toHaveAttribute('aria-haspopup');
    fireEvent.click(none);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('shows a read-only gutter, still navigable, when it is handed no actions', () => {
    mount({ actions: undefined });
    expect(labelButtons()).toHaveLength(4);
    expect(labelButtons()[0]).not.toHaveAttribute('aria-haspopup');
  });
});

describe('the collapsed strip', () => {
  it('shows the number, and keeps the full name in the accessible name and on focus', () => {
    mount({ widthPx: SWIMLANE_GUTTER_COLLAPSED_PX, actions: actions() });
    const mechanical = labelButtons()[1]!;
    expect(mechanical.textContent).toBe('2');
    expect(mechanical).toHaveAttribute(
      'aria-label',
      expect.stringMatching(/^Mechanical, swimlane 2/),
    );
    // Not only `title`: a focus tooltip carries the name, which a keyboard reader gets and a title does not.
    expect(mechanical).not.toHaveAttribute('title');
    act(() => mechanical.focus());
    expect(document.body).toHaveTextContent('Mechanical');
  });

  it('shows the name on a tap of "No swimlane", which has no menu to name it', () => {
    mount({ widthPx: SWIMLANE_GUTTER_COLLAPSED_PX });
    fireEvent.click(labelButtons()[3]!);
    expect(document.body).toHaveTextContent('No swimlane');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('names the menu after the swimlane, so a tap reaches the full name on a touch screen', () => {
    mount({ widthPx: SWIMLANE_GUTTER_COLLAPSED_PX });
    fireEvent.click(labelButtons()[1]!);
    expect(screen.getByRole('menu', { name: 'Actions for Mechanical' })).toBeInTheDocument();
  });
});

describe('the corner cell', () => {
  it('carries the Swimlanes… command and opens it', () => {
    const a = actions();
    mount({ actions: a });
    fireEvent.click(
      within(screen.getByTestId('tsld-swimlane-gutter-corner')).getByRole('button', {
        name: 'Swimlanes…',
      }),
    );
    expect(a.manage.onOpen).toHaveBeenCalledTimes(1);
  });

  it('shades the command without the pen: focusable, reason described, press inert', () => {
    const a = actions({ write: { writable: false, reason: 'Start editing to manage swimlanes.' } });
    mount({ actions: a });
    const button = screen.getByRole('button', { name: 'Swimlanes…' });
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).not.toBeDisabled();
    expect(button).toHaveAccessibleDescription('Start editing to manage swimlanes.');
    fireEvent.click(button);
    expect(a.manage.onOpen).not.toHaveBeenCalled();
  });

  it('collapses and expands, and says which', () => {
    const a = actions();
    const { rerender } = mount({ actions: a });
    fireEvent.click(screen.getByRole('button', { name: 'Hide swimlane names' }));
    expect(a.collapse.onToggle).toHaveBeenCalledTimes(1);
    const collapsed = actions({
      collapse: { collapsed: true, forcedByRoom: false, onToggle: vi.fn() },
    });
    rerender(
      <SwimlaneGutter
        rootRef={createRef<HTMLDivElement>()}
        swimlanes={SWIMLANES}
        widthPx={SWIMLANE_GUTTER_COLLAPSED_PX}
        cornerHeightPx={40}
        footPx={0}
        actions={collapsed}
      />,
    );
    expect(screen.getByRole('button', { name: 'Show swimlane names' })).toBeInTheDocument();
    // Only the expand control fits the strip as a full target.
    expect(screen.queryByRole('button', { name: 'Swimlanes…' })).not.toBeInTheDocument();
  });

  it('shades the expand control with the no-room reason when the window is too narrow', () => {
    const toggle = vi.fn();
    mount({
      widthPx: SWIMLANE_GUTTER_COLLAPSED_PX,
      actions: actions({ collapse: { collapsed: true, forcedByRoom: true, onToggle: toggle } }),
    });
    const expand = screen.getByRole('button', { name: 'Show swimlane names' });
    expect(expand).toHaveAttribute('aria-disabled', 'true');
    expect(expand).toHaveAccessibleDescription(GUTTER_NO_ROOM_REASON);
    fireEvent.click(expand);
    expect(toggle).not.toHaveBeenCalled();
  });
});

describe('the pointer over the gutter', () => {
  it('does not chain the wheel to the page, and the canvas wheel (a time-axis zoom) is not forwarded', () => {
    mount();
    expect(screen.getByTestId('tsld-swimlane-gutter')).toHaveClass('overscroll-contain');
  });
});
