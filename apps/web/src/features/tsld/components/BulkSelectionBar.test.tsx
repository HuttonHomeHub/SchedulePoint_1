import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { BulkSelectionBar, type BulkActionGate } from './BulkSelectionBar';

/**
 * The bulk selection bar's four gate states (`docs/specs/canvas-multi-select/` M4-T7).
 *
 * The assertion that carries the most weight is the **`aria-disabled`** one. This repo has now
 * shipped the native-`disabled` defect three times (ADR-0060 M6's Save buttons, ADR-0063 M6's
 * Assign, ADR-0064 §7's Cancel) and each was found at an enablement pass rather than a review, so
 * it is pinned here rather than trusted to a convention: these buttons flip twice per action, and a
 * natively disabled button blurs to `<body>` the instant it flips (WCAG 2.4.3).
 */
const open: BulkActionGate = { enabled: true, reason: null };
const shut = (reason: string): BulkActionGate => ({ enabled: false, reason });

const onLink = vi.fn();
const onDelete = vi.fn();
const onClear = vi.fn();

function renderBar(over: Partial<React.ComponentProps<typeof BulkSelectionBar>> = {}) {
  onLink.mockClear();
  onDelete.mockClear();
  onClear.mockClear();
  return render(
    <BulkSelectionBar
      count={5}
      primaryName="Pour slab"
      link={open}
      remove={open}
      onLink={onLink}
      onDelete={onDelete}
      onClear={onClear}
      {...over}
    />,
  );
}

const linkButton = () => screen.getByRole('button', { name: /link in sequence/i });
const deleteButton = () => screen.getByRole('button', { name: /^delete$/i });

describe('when to render at all', () => {
  it('renders nothing below two selected — the floating per-object bar owns that case', () => {
    const { container } = renderBar({ count: 1 });
    expect(container).toBeEmptyDOMElement();
  });

  it('names the count and the primary, so which bar Edit still acts on is not a guess', () => {
    renderBar({ count: 12, primaryName: 'Pour slab' });
    expect(screen.getByTestId('bulk-selection-bar')).toHaveTextContent(
      /12 activities selected — “Pour slab” is the subject of single-activity actions/,
    );
  });
});

describe('the four gate states', () => {
  it('writable: both actions fire', () => {
    renderBar();
    fireEvent.click(linkButton());
    fireEvent.click(deleteButton());
    expect(onLink).toHaveBeenCalledOnce();
    expect(onDelete).toHaveBeenCalledOnce();
  });

  it('no pen: both are shaded with the reason, and the reason is LINKED to the control', () => {
    renderBar({
      link: shut('Take the edit lock to change this plan.'),
      remove: shut('Take the edit lock to change this plan.'),
    });
    const button = deleteButton();
    expect(button).toHaveAttribute('aria-disabled', 'true');
    // Not merely adjacent: proximity is association for a sighted reader and nothing at all in the
    // accessibility tree (the ADR-0073 C2.5 finding, in a fix written for exactly this).
    const describedBy = button.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy!)).toHaveTextContent(/take the edit lock/i);
  });

  it('nothing to do: the chain is shut with its own reason while Delete stays live', () => {
    renderBar({ link: shut('These can’t be linked in sequence — open the preview to see why.') });
    expect(linkButton()).toHaveAttribute('aria-disabled', 'true');
    expect(deleteButton()).not.toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(deleteButton());
    expect(onDelete).toHaveBeenCalledOnce();
  });

  it('busy: both go inert without either leaving the tab order', () => {
    renderBar({ busy: true });
    for (const button of [linkButton(), deleteButton()]) {
      expect(button).toHaveAttribute('aria-disabled', 'true');
      expect(button).toHaveAttribute('aria-busy', 'true');
      // The whole point of `aria-disabled`: the control is still focusable.
      expect(button).not.toHaveAttribute('disabled');
    }
  });
});

describe('inertness is real, not just announced', () => {
  it('a shaded action does not fire on click', () => {
    renderBar({ remove: shut('You don’t have permission to delete activities.') });
    fireEvent.click(deleteButton());
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('uses aria-disabled rather than the native attribute on every action', () => {
    // Pinned across ALL states, because the defect this guards has shipped three times and each
    // time it was one control in a group that had it right.
    renderBar({ busy: true, link: shut('nope'), remove: shut('nope') });
    for (const button of screen.getAllByRole('button')) {
      expect(button).not.toHaveAttribute('disabled');
    }
  });
});

describe('the reason is reachable from every control it explains', () => {
  /**
   * The regression test for a WCAG 4.1.2 failure both the accessibility and the UX review
   * reproduced. The bar renders ONE status line, but each button used to carry its own `useId()`;
   * in the commonest gated state — no pen, so both actions shut for the same reason — only the
   * Delete button's id was rendered, and Link (first in tab order) pointed at an id that was not in
   * the DOM. A screen-reader user heard "Link in sequence, dimmed" and no reason at all.
   */
  it('points BOTH shut actions at the one rendered status line', () => {
    renderBar({
      link: shut('Take the edit lock to change this plan.'),
      remove: shut('Take the edit lock to change this plan.'),
    });
    for (const name of [/link in sequence/i, /^delete$/i]) {
      const id = screen.getByRole('button', { name }).getAttribute('aria-describedby');
      expect(id, `${String(name)} has no aria-describedby`).not.toBeNull();
      expect(
        document.getElementById(id ?? ''),
        `${String(name)} points at a missing element`,
      ).not.toBeNull();
    }
  });

  it('points at nothing when nothing is shut — an empty reference is worse than none', () => {
    renderBar({});
    for (const name of [/link in sequence/i, /^delete$/i]) {
      expect(screen.getByRole('button', { name })).not.toHaveAttribute('aria-describedby');
    }
  });
});

describe('the status line', () => {
  it('states the reason that STOPS an action, and states it once', () => {
    renderBar({ remove: shut('Take the edit lock to change this plan.') });
    const bar = screen.getByTestId('bulk-selection-bar');
    expect(bar).toHaveTextContent(/take the edit lock/i);
  });

  /**
   * The bar used to carry a third sentence here — "moving these will pin a start-no-earlier-than
   * date on all N" — for a plural drag that was never wired. Its model, its undo command and its
   * endpoint all landed; the gesture did not, so the sentence described something a planner could
   * not do. Removed rather than left (`docs/TECH_DEBT.md` #108), and asserted absent so it cannot
   * come back ahead of the gesture that makes it true.
   */
  it('says nothing about moving, because the plural drag is not wired yet', () => {
    renderBar({});
    expect(screen.getByTestId('bulk-selection-bar')).not.toHaveTextContent(
      /start-no-earlier-than/i,
    );
  });
});

describe('the way out', () => {
  it('Clear selection is never gated — it is how a planner leaves', () => {
    renderBar({ busy: true, link: shut('nope'), remove: shut('nope') });
    fireEvent.click(screen.getByRole('button', { name: /clear selection/i }));
    expect(onClear).toHaveBeenCalledOnce();
  });
});
