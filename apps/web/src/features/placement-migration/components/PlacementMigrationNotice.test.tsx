import type { PlacementMigrationRow } from '@repo/types';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { PlacementMigrationNotice } from './PlacementMigrationNotice';

function row(overrides: Partial<PlacementMigrationRow> = {}): PlacementMigrationRow {
  return {
    id: 'row-1',
    activityId: 'act-1',
    activityCode: 'A100',
    activityName: 'Pour slab',
    priorConstraintType: 'SNET',
    priorConstraintDate: '2026-03-04',
    priorVisualStart: null,
    migratedAt: '2026-09-21T09:00:00.000Z',
    ...overrides,
  };
}

describe('PlacementMigrationNotice', () => {
  /**
   * **The consequence, in the future tense.** The migration writes `visual_start` and clears the
   * constraint; it cannot touch `early_start`, `total_float` or `is_critical`, because the engine
   * is TypeScript and a SQL migration cannot call it. So the float has NOT moved at the moment
   * this is read, and it moves at the next recalculation. The first version said "may now show
   * more float", which a planner could have checked and found false.
   */
  it('says the float changes at the next recalculation, not that it already has', () => {
    render(<PlacementMigrationNotice count={3} rows={[row()]} onDismiss={vi.fn()} />);

    const message = screen.getByText(/became hand-placements/);
    expect(message).toHaveTextContent('The bars did not move');
    expect(message).toHaveTextContent('once this plan is next recalculated');
    expect(message).not.toHaveTextContent('may now show');
  });

  /**
   * One is one. `docs/specs/one-planning-surface/` inherits ADR-0143 M7's recorded defect here —
   * a count appended to a fixed noun produced "One reading — 2 readings" on the commonest press in
   * that panel — so the singular is a case rather than a hope.
   */
  it('reads as a singular for one converted constraint', () => {
    render(<PlacementMigrationNotice count={1} rows={[row()]} onDismiss={vi.fn()} />);

    expect(screen.getByText(/became a hand-placement/)).toBeInTheDocument();
    expect(screen.getByText(/1 start constraint on this plan/)).toBeInTheDocument();
  });

  it('reads as a plural for more than one', () => {
    render(
      <PlacementMigrationNotice
        count={2}
        rows={[row(), row({ id: 'row-2' })]}
        onDismiss={vi.fn()}
      />,
    );

    expect(screen.getByText(/2 start constraints on this plan/)).toBeInTheDocument();
    expect(screen.getByText(/became hand-placements/)).toBeInTheDocument();
  });

  /**
   * **The rows have a consumer**, which is the whole argument for the report endpoint existing.
   * A strip that reported only a count would leave `placement_migrations` effectively write-only —
   * the state FC-10's rails say the endpoint exists to prevent — and would leave the obvious next
   * question ("which ones?") unanswerable from the product.
   */
  it('lists the converted activities on request', async () => {
    render(
      <PlacementMigrationNotice
        count={2}
        rows={[row(), row({ id: 'row-2', activityCode: 'B200', activityName: 'Glazing' })]}
        onDismiss={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'See which' }));

    expect(await screen.findByText('A100 — Pour slab')).toBeInTheDocument();
    expect(screen.getByText('B200 — Glazing')).toBeInTheDocument();
    // The date the constraint carried — which is the value the activity's placement now holds, so
    // a planner can see where each bar was pinned.
    // Formatted through the shared `formatCalendarDate`, not printed raw. It was `2026-03-04`
    // until the M-J gate pass; every other date surface in this product is en-GB `dd MMM yyyy`.
    expect(screen.getAllByText('04 Mar 2026')).toHaveLength(2);
  });

  /** An activity with no code is named by its name alone, not by "null — name". */
  it('names an activity that has no code', async () => {
    render(
      <PlacementMigrationNotice
        count={1}
        rows={[row({ activityCode: null })]}
        onDismiss={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'See which' }));

    expect(await screen.findByText('Pour slab')).toBeInTheDocument();
  });

  it('dismisses through its own button', () => {
    const onDismiss = vi.fn();
    render(<PlacementMigrationNotice count={1} rows={[row()]} onDismiss={onDismiss} />);

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss this notice' }));

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  /**
   * **No live region at all**, which is ADR-0132's rule for a standing condition — and this test
   * asserted the wrong half of it until the M-J gate pass.
   *
   * The reasoning it carried was right ("a standing fact about something that happened on a
   * deploy… it reads identically to somebody who arrives five minutes later — ADR-0132's
   * discriminator") and the conclusion was wrong: it chose between `alert` and `status` when the
   * choice ADR-0132 poses is between a role and **none**. `status` is still an event-shaped
   * announcement. A test can invoke the right rule by name and still land on the wrong side of it,
   * which is why this one now asserts the absence rather than the politeness.
   */
  it('renders no live region, because a historical fact is not an event', () => {
    render(<PlacementMigrationNotice count={1} rows={[row()]} onDismiss={vi.fn()} />);

    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    // The sentence is still on screen and still reachable in DOM order — dropping the role removes
    // the announcement, not the content.
    expect(screen.getByText(/The bars did not move/)).toBeInTheDocument();
  });

  /**
   * **Dismissing must not strand focus at `<body>`** (WCAG 2.4.3). The button is a child of the
   * thing it removes, so without an explicit hand-off the focused element simply ceases to exist —
   * and on the plan workspace that also silently disables every keyboard accelerator, because they
   * are a React `onKeyDown` on the workspace root. This repository records shipping that exact
   * defect at least four times.
   */
  it('hands focus to the host’s anchor when dismissed, after the dismissal', () => {
    const order: string[] = [];
    render(
      <PlacementMigrationNotice
        count={1}
        rows={[row()]}
        onDismiss={() => order.push('dismiss')}
        restoreFocus={() => order.push('focus')}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss this notice' }));

    // Order matters: `onDismiss` is what unmounts the button, so focus must be sent afterwards, to
    // something that still exists.
    expect(order).toEqual(['dismiss', 'focus']);
  });

  /** A host with nothing to return to is not forced to invent an anchor. */
  it('dismisses without a restoreFocus, and does not throw', () => {
    const onDismiss = vi.fn();
    render(<PlacementMigrationNotice count={1} rows={[row()]} onDismiss={onDismiss} />);

    expect(() =>
      fireEvent.click(screen.getByRole('button', { name: 'Dismiss this notice' })),
    ).not.toThrow();
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
