import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { pluralMoveHint } from '../model/reposition-announcement';

import { BulkSelectionBar, type BulkActionGate } from './BulkSelectionBar';

import { TOOLTIP_OPEN_DELAY_MS } from '@/components/ui/tooltip';

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

  it('carries the marker the foot row reads to set the plan facts aside on a short window', () => {
    renderBar({ count: 3 });
    expect(screen.getByTestId('bulk-selection-bar')).toHaveAttribute('data-selection-bar');
  });

  it('reads as a short caption, and keeps the subject sentence off the screen', () => {
    renderBar({ count: 12, primaryName: 'Pour slab' });
    const bar = screen.getByTestId('bulk-selection-bar');
    expect(bar).toHaveTextContent(/^12 selected/);
    // Visible text is the caption and the actions: the long sentence is not on screen.
    expect(bar).not.toHaveTextContent(/subject of single-activity/);
    expect(screen.getByText('12 selected')).toBeVisible();
  });

  it('names the count and the primary as its accessible description, so which bar Edit acts on is not a guess', () => {
    renderBar({ count: 12, primaryName: 'Pour slab' });
    const bar = screen.getByRole('group', { name: 'Selected activities' });
    expect(bar).toHaveAccessibleDescription(
      '12 activities selected — “Pour slab” is the subject of single-activity actions.',
    );
  });

  it('describes the count alone when no primary is known', () => {
    renderBar({ count: 3, primaryName: null });
    expect(screen.getByRole('group', { name: 'Selected activities' })).toHaveAccessibleDescription(
      '3 activities selected.',
    );
  });
});

describe('one line, no overflow', () => {
  it('shows every action at once, with no More menu or menu button', () => {
    renderBar({
      moveToSwimlane: {
        assignment: { source: 'MANUAL' } as never,
        ids: ['a', 'b'],
        names: ['A', 'B'],
        gate: { writable: true, reason: null },
      },
      codeAction: <button type="button">Set code…</button>,
    });
    const names = screen.getAllByRole('button').map((b) => b.textContent?.trim());
    expect(names).toEqual([
      'Link in sequence…',
      'Move to swimlane…',
      'Set code…',
      'Delete',
      'Clear selection',
    ]);
    expect(screen.queryByRole('menu')).toBeNull();
    expect(screen.queryByRole('button', { name: /more/i })).toBeNull();
  });

  it('wraps rather than clips, asks the dock for its own line, and never ellipsises the caption', () => {
    renderBar({ primaryName: 'Fabricate and erect precast stair cores, blk B' });
    const bar = screen.getByTestId('bulk-selection-bar');
    expect(bar).toHaveAttribute('data-dock-row');
    expect(bar).toHaveClass('flex-wrap', 'min-w-0');
    expect(bar).not.toHaveAttribute('title');
    expect(screen.getByText('5 selected').closest('p')).not.toHaveClass('truncate');
  });

  it('has no visible sentence at all while nothing is refused', () => {
    renderBar({ canMove: true });
    expect(screen.queryByRole('status')).toBeNull();
    const bar = screen.getByTestId('bulk-selection-bar');
    // The caption's paragraph is the only one, and the move hint is not in the document yet.
    expect(bar.querySelectorAll('p')).toHaveLength(1);
    expect(bar).not.toHaveTextContent(/moves all/i);
  });

  it('shows exactly one sentence, the refusal, when something is refused', () => {
    renderBar({
      canMove: true,
      link: shut('Start editing to change this plan.'),
      remove: shut('Start editing to change this plan.'),
    });
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(screen.getByRole('status')).toHaveTextContent('Start editing to change this plan.');
    expect(screen.getByTestId('bulk-selection-bar').querySelectorAll('p')).toHaveLength(2);
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
      link: shut('Start editing to change this plan.'),
      remove: shut('Start editing to change this plan.'),
    });
    const button = deleteButton();
    expect(button).toHaveAttribute('aria-disabled', 'true');
    // Not merely adjacent: proximity is association for a sighted reader and nothing at all in the
    // accessibility tree (the ADR-0073 C2.5 finding, in a fix written for exactly this).
    const describedBy = button.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy!)).toHaveTextContent(/start editing/i);
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
      link: shut('Start editing to change this plan.'),
      remove: shut('Start editing to change this plan.'),
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
    renderBar({ remove: shut('Start editing to change this plan.') });
    const bar = screen.getByTestId('bulk-selection-bar');
    expect(bar).toHaveTextContent(/start editing/i);
  });

  /**
   * The bar used to carry a third sentence here — "moving these will pin a start-no-earlier-than
   * date on all N" — for a plural drag that was never wired, and it was removed rather than left
   * (`docs/TECH_DEBT.md` #108). The gesture is wired now and the hint says so, true in both modes
   * (ADR-0033); since M7 it is the caption's tooltip rather than a line of the bar, and the
   * mode-specific wording stays forbidden.
   */
  describe('the move hint is a tooltip on the caption', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => {
      vi.runOnlyPendingTimers();
      vi.useRealTimers();
    });
    const tip = (): HTMLElement | null => document.querySelector('[data-tooltip]');

    it('opens on hover with the same sentence the panel speaks, without claiming a mode', () => {
      renderBar({ canMove: true });
      fireEvent.pointerEnter(screen.getByText('5 selected'), { pointerType: 'mouse' });
      act(() => void vi.advanceTimersByTime(TOOLTIP_OPEN_DELAY_MS));
      expect(tip()).toHaveTextContent(pluralMoveHint(5));
      expect(tip()).toHaveTextContent(/pressing alt with an arrow key/i);
      expect(tip()).not.toHaveTextContent(/start-no-earlier-than/i);
    });

    it('is a visual echo only: the tip is hidden from assistive technology, so it is never heard twice', () => {
      renderBar({ canMove: true });
      fireEvent.pointerEnter(screen.getByText('5 selected'), { pointerType: 'mouse' });
      act(() => void vi.advanceTimersByTime(TOOLTIP_OPEN_DELAY_MS));
      expect(tip()).toHaveAttribute('aria-hidden', 'true');
      expect(screen.getByText('5 selected')).not.toHaveAttribute('aria-describedby');
    });

    // The hint is a claim about what the keys do, so a viewer — or a planner without the pen — is
    // not told it works. `canMove` defaults to false for exactly that reason.
    it('says nothing about moving unless the caller can move', () => {
      renderBar({});
      fireEvent.pointerEnter(screen.getByText('5 selected'), { pointerType: 'mouse' });
      act(() => void vi.advanceTimersByTime(TOOLTIP_OPEN_DELAY_MS));
      expect(tip()).toBeNull();
    });

    it('keeps the hint out of every control’s description', () => {
      renderBar({ canMove: true, link: shut('No pen.') });
      const id = linkButton().getAttribute('aria-describedby');
      expect(document.getElementById(id!)).not.toHaveTextContent(/moves all/i);
    });
  });
});

describe('the way out', () => {
  it('Clear selection is never gated — it is how a planner leaves', () => {
    renderBar({ busy: true, link: shut('nope'), remove: shut('nope') });
    fireEvent.click(screen.getByRole('button', { name: /clear selection/i }));
    expect(onClear).toHaveBeenCalledOnce();
  });
});

describe('Set code… (the host-supplied codeAction slot)', () => {
  it('renders the slot after Link and before Delete, and nothing when absent', () => {
    const { unmount } = renderBar();
    expect(screen.queryByRole('button', { name: 'Set code…' })).toBeNull();
    unmount();
    renderBar({ codeAction: <button type="button">Set code…</button> });
    const names = screen.getAllByRole('button').map((b) => b.textContent);
    const at = names.indexOf('Set code…');
    expect(at).toBeGreaterThan(names.indexOf('Link in sequence…'));
    expect(at).toBeLessThan(names.indexOf('Delete'));
  });
});
