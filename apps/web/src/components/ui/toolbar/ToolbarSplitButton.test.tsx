import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import * as React from 'react';
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

/**
 * **A description for an ENABLED primary** (`docs/specs/foot-row/spec.md` D3).
 *
 * The primitive had a channel for a reason on a shut control and none for a hint on a live one —
 * the gap ADR-0094 M5 found in `MenuItem` and fixed there. It exists because withdrawing the armed
 * mode statements had to give their two undocumented shortcuts somewhere to go, and `title` is not
 * that place: no mainstream browser shows a tooltip on keyboard focus, which this file's own
 * `disabledReason` docblock records as the house failure pattern caught four times.
 */
describe('ToolbarSplitButton — a description on a live primary', () => {
  // **Not `Partial<ToolbarSplitButtonProps>` spread in.** `exactOptionalPropertyTypes` is on, so a
  // partial's `foo?: string` is `string | undefined` and will not assign to a target `foo?: string`.
  // Naming the three fields this harness varies keeps the spread honest.
  function Harness({
    primaryDescription,
    primaryDisabledReason,
    disabled,
  }: {
    primaryDescription?: string;
    primaryDisabledReason?: string;
    disabled?: boolean;
  } = {}): React.ReactElement {
    const primaryRef = React.useRef<HTMLButtonElement>(null);
    const caretRef = React.useRef<HTMLButtonElement>(null);
    return (
      <ToolbarSplitButton
        itemProps={{}}
        primaryRef={primaryRef}
        caretRef={caretRef}
        pressed
        open={false}
        label="Adding Task"
        caretLabel="Activity type"
        title="Add an activity"
        icon={<span aria-hidden="true">+</span>}
        onPrimary={() => {}}
        onOpenMenu={() => {}}
        {...(primaryDescription !== undefined ? { primaryDescription } : {})}
        {...(primaryDisabledReason !== undefined ? { primaryDisabledReason } : {})}
        {...(disabled !== undefined ? { disabled } : {})}
      />
    );
  }

  it('announces it after the name, without joining it', () => {
    render(<Harness primaryDescription="Drag to set its length. Esc to stop." />);
    const primary = screen.getByRole('button', { name: 'Adding Task' });

    // The NAME is exactly the label — a planner scanning a control list is not read a sentence.
    expect(primary).toHaveAccessibleName('Adding Task');
    expect(primary).toHaveAccessibleDescription('Drag to set its length. Esc to stop.');
  });

  it('yields to a reason when the control is shut, because a hint about the unusable is noise', () => {
    render(
      <Harness
        disabled
        primaryDescription="Drag to set its length. Esc to stop."
        primaryDisabledReason="Start editing to add activities."
      />,
    );
    const primary = screen.getByRole('button', { name: 'Adding Task' });
    expect(primary).toHaveAccessibleDescription('Start editing to add activities.');
  });

  it('leaves the description off entirely when none is given', () => {
    render(<Harness />);
    const primary = screen.getByRole('button', { name: 'Adding Task' });
    // Not an empty description: a dangling `aria-describedby` reads as one, which is why the
    // primitive only sets the attribute when there is something to point at.
    expect(primary).not.toHaveAttribute('aria-describedby');
  });
});
