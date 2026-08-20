import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ContextDrawer, ContextDrawerEmpty } from './context-drawer';
import { CONTEXT_DRAWER_MAX_WIDTH, CONTEXT_DRAWER_MIN_WIDTH } from './use-context-drawer-prefs';

/**
 * The **context drawer** (ADR-0099 D2) — the first non-modal persistent panel in this codebase, so
 * every protection a modal gets for free is a decision here and is pinned as one (plan.md §A16).
 */
describe('ContextDrawer', () => {
  const props = {
    title: 'Excavate to formation',
    onClose: vi.fn(),
    width: 300,
    onResize: vi.fn(),
  };

  it('names itself by its subject, as a landmark and a heading', () => {
    render(
      <ContextDrawer {...props}>
        <div />
      </ContextDrawer>,
    );
    // A reader arriving by landmark and a reader arriving by heading both need to learn the
    // subject, and neither can see the rail button that chose it.
    expect(
      screen.getByRole('complementary', { name: 'Excavate to formation' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Excavate to formation', level: 2 })).toBeVisible();
  });

  it('offers a close control and does not invent an Escape handler', () => {
    const onClose = vi.fn();
    render(
      <ContextDrawer {...props} onClose={onClose}>
        <div />
      </ContextDrawer>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Close context drawer' }));
    expect(onClose).toHaveBeenCalledTimes(1);

    // **Escape belongs to the workspace's ladder, not to this component.** A `window` listener here
    // would fire wherever focus is — the ADR-0079 defect, which cost a planner the Link tool
    // mid-search. Asserted by behaviour rather than by reading the source: pressing Escape must not
    // reach `onClose` from here.
    onClose.mockClear();
    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.keyDown(screen.getByRole('complementary', { name: props.title }), { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });

  /**
   * The splitter is on the drawer's LEADING edge, so a pointer drag to the left grows it. Without
   * `reverseKeys` the arrow keys would grow it the other way, and a keyboard user and a mouse user
   * would disagree about which direction is "wider" — a disagreement neither can see.
   */
  it('resizes from the leading edge, keyboard and pointer agreeing on direction', () => {
    const onResize = vi.fn();
    render(
      <ContextDrawer {...props} onResize={onResize}>
        <div />
      </ContextDrawer>,
    );
    const splitter = screen.getByRole('separator', { name: 'Resize context drawer' });
    expect(splitter).toHaveAttribute('aria-valuenow', '300');
    expect(splitter).toHaveAttribute('aria-valuemin', String(CONTEXT_DRAWER_MIN_WIDTH));
    expect(splitter).toHaveAttribute('aria-valuemax', String(CONTEXT_DRAWER_MAX_WIDTH));

    fireEvent.keyDown(splitter, { key: 'ArrowLeft' });
    expect(onResize).toHaveBeenCalledWith(316);
    fireEvent.keyDown(splitter, { key: 'ArrowRight' });
    expect(onResize).toHaveBeenLastCalledWith(284);
  });

  it('renders its subject content, and an explicit empty state when there is none', () => {
    const { rerender } = render(
      <ContextDrawer {...props}>
        <p>Duration 8 d</p>
      </ContextDrawer>,
    );
    expect(screen.getByText('Duration 8 d')).toBeVisible();

    // The failure being designed against is the opposite of a missing state: a panel still showing
    // the last activity after the selection cleared reads as current and is not.
    rerender(
      <ContextDrawer {...props} title="Properties">
        <ContextDrawerEmpty>Select an activity to see its properties.</ContextDrawerEmpty>
      </ContextDrawer>,
    );
    expect(screen.queryByText('Duration 8 d')).not.toBeInTheDocument();
    expect(screen.getByText('Select an activity to see its properties.')).toBeVisible();
  });
});
