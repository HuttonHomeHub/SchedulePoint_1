import { fireEvent, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { ToolbarSplitButton } from './ToolbarSplitButton';

/**
 * **The split button's two halves can be two different commands** (ADR-0091 C3).
 *
 * Until now every consumer (`Add ▾`, `Link ▾`) used the pair as two faces of ONE command, so a
 * single `disabled` gating both halves was right. ADR-0091 C4 merges `Go to today` with `Go to
 * date`, which have genuinely different gates — today needs a computed diagram in the canvas view,
 * go-to-date needs only an anchored plan. Under one prop the caret would inherit the primary's
 * gate, and **Go to date would become unreachable on an empty or Gantt-viewed plan**: a capability a
 * planner has today, removed by a layout change. That is the ADR-0081 dead-end shape, and it was
 * not in the milestone's plan — a design review found it.
 *
 * These tests were verified red against the single-`disabled` version.
 */

function renderSplit(over: Partial<Parameters<typeof ToolbarSplitButton>[0]> = {}) {
  const onPrimary = vi.fn();
  const onOpenMenu = vi.fn();
  render(
    <ToolbarSplitButton
      itemProps={{}}
      primaryRef={createRef<HTMLButtonElement>()}
      caretRef={createRef<HTMLButtonElement>()}
      pressed={false}
      open={false}
      title="Go to today"
      icon={null}
      label="Today"
      caretLabel="Go to date"
      onPrimary={onPrimary}
      onOpenMenu={onOpenMenu}
      {...over}
    />,
  );
  return {
    onPrimary,
    onOpenMenu,
    primary: screen.getByRole('button', { name: 'Today' }),
    caret: screen.getByRole('button', { name: 'Go to date' }),
  };
}

describe('ToolbarSplitButton — per-half gating', () => {
  it('shades the primary while leaving the caret live, and the caret still opens', () => {
    const { primary, caret, onPrimary, onOpenMenu } = renderSplit({ primaryDisabled: true });

    expect(primary).toHaveAttribute('aria-disabled', 'true');
    expect(caret).not.toHaveAttribute('aria-disabled');

    fireEvent.click(primary);
    expect(onPrimary).not.toHaveBeenCalled();

    // The half that matters: a planner on an empty plan can still reach Go to date.
    fireEvent.click(caret);
    expect(onOpenMenu).toHaveBeenCalledOnce();
  });

  it('keeps the arrow-key route to the menu open when only the primary is shaded', () => {
    // The arrows are the KEYBOARD route to the caret's menu, and they live on the primary because
    // the pair is one roving stop. Gating them on the primary's own state would take the menu away
    // from keyboard users while leaving it clickable — reachable by pointer only, WCAG 2.1.1.
    const { primary, onOpenMenu } = renderSplit({ primaryDisabled: true });
    fireEvent.keyDown(primary, { key: 'ArrowDown' });
    expect(onOpenMenu).toHaveBeenCalledOnce();
  });

  it('shades the caret alone without disarming the primary', () => {
    const { primary, caret, onPrimary, onOpenMenu } = renderSplit({ caretDisabled: true });
    expect(caret).toHaveAttribute('aria-disabled', 'true');
    expect(primary).not.toHaveAttribute('aria-disabled');
    fireEvent.click(caret);
    expect(onOpenMenu).not.toHaveBeenCalled();
    fireEvent.click(primary);
    expect(onPrimary).toHaveBeenCalledOnce();
  });

  it('still gates both halves from the shared `disabled`, the shape every existing consumer uses', () => {
    const { primary, caret, onPrimary, onOpenMenu } = renderSplit({ disabled: true });
    expect(primary).toHaveAttribute('aria-disabled', 'true');
    expect(caret).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(primary);
    fireEvent.click(caret);
    expect(onPrimary).not.toHaveBeenCalled();
    expect(onOpenMenu).not.toHaveBeenCalled();
  });
});

describe('ToolbarSplitButton — haspopup and compact', () => {
  it('announces a menu by default and a dialog on request', () => {
    const { caret } = renderSplit();
    expect(caret).toHaveAttribute('aria-haspopup', 'menu');
    screen.getByRole('button', { name: 'Today' }); // sanity: default render is intact
  });

  it('announces a dialog when the caret opens a panel rather than a menu', () => {
    const { caret } = renderSplit({ haspopup: 'dialog' });
    expect(caret).toHaveAttribute('aria-haspopup', 'dialog');
  });

  it('keeps the name when it withholds the visible label', () => {
    // `compact` may not cost the control its name — an icon-only button with no accessible name is
    // the blank-button defect ADR-0090 M3 shipped once.
    renderSplit({ compact: true });
    const primary = screen.getByRole('button', { name: 'Today' });
    expect(primary).toHaveTextContent('');
  });
});
