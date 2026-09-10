import type { CrossPlanCorrelation, CrossPlanCorrelationRow } from '@repo/types';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { RevisionCorrelationSummary } from './RevisionCorrelationSummary';

/**
 * The coverage block's own suite. It had none: coverage was indirect, through the symmetry test
 * (which asserts sentences and never expands a list) and the journey (which cannot run here). The
 * M4 component review named the gap, and the M4 ux review found a defect inside it that neither
 * instrument could see — so this pins the interactive behaviour where a regression is cheap to
 * catch rather than expensive.
 */

const FROM_PLAN = 'plan-old';
const TO_PLAN = 'plan-new';

const row = (over: Partial<CrossPlanCorrelationRow> = {}): CrossPlanCorrelationRow => ({
  activityId: null,
  code: 'A100',
  name: 'Groundworks',
  planId: FROM_PLAN,
  planName: 'Rev A',
  ...over,
});

const correlation = (over: Partial<CrossPlanCorrelation> = {}): CrossPlanCorrelation => ({
  key: 'CODE',
  matched: 3,
  fromUnmatched: 0,
  toUnmatched: 0,
  fromUncoded: 0,
  toUncoded: 0,
  fromUnmatchedRows: [],
  toUnmatchedRows: [],
  uncodedRows: [],
  cap: 200,
  ...over,
});

const renderSummary = (over: Partial<CrossPlanCorrelation> = {}) =>
  render(
    <RevisionCorrelationSummary
      correlation={correlation(over)}
      fromPlanId={FROM_PLAN}
      fromPlanName="Rev A"
      toPlanId={TO_PLAN}
      toPlanName="Rev B"
    />,
  );

describe('RevisionCorrelationSummary', () => {
  it('leads with the coverage sentence, which is what the block exists for', () => {
    renderSummary();
    expect(screen.getByText(/All 3 activities matched by activity code/)).toBeInTheDocument();
  });

  it('omits a list whose total is zero rather than rendering an empty disclosure', () => {
    // An expandable control over nothing is a control that does nothing — and the zero is already
    // in the sentence above, so the row would say the same thing twice.
    renderSummary();
    expect(screen.queryByRole('button', { name: /only in/i })).not.toBeInTheDocument();
  });

  it('renders a list collapsed, and expands it on click', () => {
    renderSummary({
      fromUnmatched: 1,
      fromUnmatchedRows: [row({ code: 'GONE', name: 'Site hoarding' })],
    });
    const disclosure = screen.getByRole('button', { name: /Only in Rev A/ });
    expect(disclosure).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText(/Site hoarding/)).not.toBeInTheDocument();
    fireEvent.click(disclosure);
    expect(disclosure).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(/Site hoarding/)).toBeInTheDocument();
  });

  it('states "showing N of M" only when the server capped the list', () => {
    // The cap and the total are BOTH the server's — a client that computed either would eventually
    // disagree with the sentence above it.
    renderSummary({
      fromUnmatched: 137,
      fromUnmatchedRows: [row({ code: 'GONE', name: 'Site hoarding' })],
      cap: 1,
    });
    fireEvent.click(screen.getByRole('button', { name: /Only in Rev A/ }));
    // The SHARED sentence, not a local one: `truncationNote(shown, total, cap)`. The first version
    // of this component wrote its own wording beside `MovedSection`'s, which is the drift the one
    // sentence module exists to prevent.
    expect(screen.getByText(/Showing the first 1 of 137/)).toBeInTheDocument();
  });

  it('does not state it when nothing was withheld', () => {
    renderSummary({
      fromUnmatched: 1,
      fromUnmatchedRows: [row({ code: 'GONE', name: 'Site hoarding' })],
    });
    fireEvent.click(screen.getByRole('button', { name: /Only in Rev A/ }));
    expect(screen.queryByText(/Showing/)).not.toBeInTheDocument();
  });

  it('splits the UNCODED rows by side, naming each plan', () => {
    /**
     * **They were one merged list with a combined total**, while the two lists directly above
     * correctly split earlier from later. That withheld the single piece of diagnostic information
     * this block exists to supply: a planner debugging a poor match could not tell whether the
     * data-quality problem was in the earlier import or the later one. `planId` was on every row
     * from the first commit and nothing rendered it. Found by the M4 ux review.
     */
    renderSummary({
      fromUncoded: 1,
      toUncoded: 1,
      uncodedRows: [
        row({ code: null, name: 'Old snagging', planId: FROM_PLAN, planName: 'Rev A' }),
        row({ code: null, name: 'New snagging', planId: TO_PLAN, planName: 'Rev B' }),
      ],
    });

    const earlier = screen.getByRole('button', { name: /No activity code in Rev A/ });
    const later = screen.getByRole('button', { name: /No activity code in Rev B/ });
    // Each carries its OWN side's count, not the sum.
    expect(within(earlier).getByText('1')).toBeInTheDocument();
    expect(within(later).getByText('1')).toBeInTheDocument();

    fireEvent.click(earlier);
    expect(screen.getByText(/Old snagging/)).toBeInTheDocument();
    expect(screen.queryByText(/New snagging/)).not.toBeInTheDocument();
  });

  it('shows only the side that has uncoded rows, when one side has none', () => {
    // The zero-total omission rule, applied per side — which a merged list structurally could not
    // do: with a combined total of 1 it would render one row and name neither plan.
    renderSummary({
      fromUncoded: 2,
      toUncoded: 0,
      uncodedRows: [
        row({ code: null, name: 'Old snagging', planId: FROM_PLAN }),
        row({ code: null, name: 'Old handover', planId: FROM_PLAN }),
      ],
    });
    expect(screen.getByRole('button', { name: /No activity code in Rev A/ })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /No activity code in Rev B/ }),
    ).not.toBeInTheDocument();
  });
});
