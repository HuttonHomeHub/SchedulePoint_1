import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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

  it('moves focus to a shaded caret instead of silently doing nothing', () => {
    // The caret is `tabIndex={-1}` — the pair is one roving stop — so the arrows are its ONLY
    // keyboard route. Gating them on `!caretOff` switched that route off in exactly the state where
    // there is something to explain, leaving a sighted keyboard-only planner with no focus stop, no
    // announcement, and (the caret had no disabled treatment of its own) no visual difference.
    // Verified red: before the fix `document.activeElement` stayed on the primary.
    const { primary, caret, onOpenMenu } = renderSplit({
      caretDisabled: true,
      caretDisabledReason: "Set the plan's start date first",
    });
    fireEvent.keyDown(primary, { key: 'ArrowDown' });
    expect(onOpenMenu).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(caret);
    expect(caret).toHaveAccessibleDescription("Set the plan's start date first");
  });

  it('shades the caret visibly, not only in the accessibility tree', () => {
    // The wrapper's wash only fires when BOTH halves are shut, so a caret shaded beside a live
    // primary rendered identically to a live one.
    const { caret } = renderSplit({ caretDisabled: true });
    expect(caret.className).toMatch(/opacity-50/);
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

describe('ToolbarSplitButton — a shaded half says why (ADR-0082)', () => {
  /**
   * **`title` is not a reason.** No mainstream browser shows one on keyboard focus, so a sighted
   * keyboard-only planner tabbing to a shaded control got a dimmed button and nothing else — the
   * defect this repository has now recorded four times, and which this composite still had until
   * ADR-0091 M7 gave it a consumer whose two halves are shut for different reasons.
   *
   * These test the PRIMITIVE. The behaviour was previously exercised only through one consumer's
   * caret path and another's primary path, which is exactly how "fixed on one control and not its
   * neighbour" survives.
   */
  function reasonOf(el: HTMLElement): string | null {
    const id = el.getAttribute('aria-describedby');
    return id ? (document.getElementById(id)?.textContent ?? null) : null;
  }

  it('associates each half with its own reason rather than its neighbour’s', () => {
    const { primary, caret } = renderSplit({
      primaryDisabled: true,
      caretDisabled: true,
      primaryDisabledReason: 'Add an activity first',
      caretDisabledReason: "Set the plan's start date first",
    });
    expect(reasonOf(primary)).toBe('Add an activity first');
    expect(reasonOf(caret)).toBe("Set the plan's start date first");
  });

  it('keeps the accessible name off the reason', () => {
    // The reason span lives inside the button, and a button's name comes from its content — so
    // without the `aria-label` pin the name becomes "Today Add an activity first".
    const { primary } = renderSplit({
      primaryDisabled: true,
      primaryDisabledReason: 'Add an activity first',
    });
    expect(primary).toHaveAccessibleName('Today');
    expect(primary).toHaveAccessibleDescription('Add an activity first');
  });

  it('renders no dangling description when a half is shut with nothing to say', () => {
    // An `aria-describedby` pointing at an element that renders nothing reads as an empty
    // description to some AT rather than as absence.
    const { primary, caret } = renderSplit({ disabled: true });
    expect(primary).not.toHaveAttribute('aria-describedby');
    expect(caret).not.toHaveAttribute('aria-describedby');
  });

  it('says nothing while a half is live, even if a reason was supplied', () => {
    const { primary } = renderSplit({ primaryDisabledReason: 'Add an activity first' });
    expect(primary).not.toHaveAttribute('aria-describedby');
    expect(primary).not.toHaveAttribute('title', 'Add an activity first');
  });

  it('dims the wrapper only when both halves are shut', () => {
    // A live caret inside a washed-out control looks inert, which is a lie about what you can press.
    const { primary } = renderSplit({ primaryDisabled: true });
    expect(primary.parentElement?.className).not.toMatch(/opacity-50/);
    cleanup();
    const both = renderSplit({ disabled: true });
    expect(both.primary.parentElement?.className).toMatch(/opacity-50/);
  });
});
