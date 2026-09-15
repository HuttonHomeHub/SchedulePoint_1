import type { RecentlyChangedPlan } from '@repo/types';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { RecentlyChangedRow } from './RecentlyChangedRow';

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, ...rest }: { children: React.ReactNode }) => <a {...rest}>{children}</a>,
}));

const NOW = new Date('2026-09-15T12:00:00.000Z');

function plan(over: Partial<RecentlyChangedPlan> = {}): RecentlyChangedPlan {
  return {
    planId: 'p1',
    planName: 'Northgate — Phase 1',
    projectId: 'pr1',
    projectName: 'Northgate',
    clientName: 'Bellway',
    status: 'ACTIVE',
    changedAt: '2026-09-15T11:40:00.000Z',
    scheduleComputedAt: '2026-09-15T11:50:00.000Z',
    editedSinceCalculated: false,
    changedBy: { kind: 'MEMBER', name: 'Sarah Okonkwo' },
    ...over,
  };
}

const renderRow = (over: Partial<RecentlyChangedPlan> = {}) =>
  render(<RecentlyChangedRow plan={plan(over)} orgSlug="acme" now={NOW} />);

/**
 * R1's three states, and the one that renders nothing is the one worth a test.
 *
 * "Never calculated" and "edited since it was calculated" are different facts a planner acts on
 * differently, and "current" is silence — a line saying so would be decoration on most rows and
 * would claim more than the check can know (the copy contract, gated separately by
 * `freshness-copy.structural.test.ts`).
 */
describe('the freshness line', () => {
  it('says nothing at all when the plan is calculated and untouched since', () => {
    renderRow();

    expect(screen.getByText('Northgate — Phase 1')).toBeVisible();
    expect(screen.queryByText(/calculated/i)).toBeNull();
  });

  it('says a plan has never been calculated, rather than calling it stale', () => {
    // `null` is a state. Collapsing it into "edited since" would tell the reader to recalculate
    // something that has no previous calculation to be stale against.
    renderRow({ scheduleComputedAt: null, editedSinceCalculated: false });

    expect(screen.getByText('Not yet calculated')).toBeVisible();
    expect(screen.queryByText(/Edited since/)).toBeNull();
  });

  it('says a plan has been edited since, and when that calculation was', () => {
    renderRow({
      scheduleComputedAt: '2026-09-15T09:00:00.000Z',
      editedSinceCalculated: true,
    });

    expect(screen.getByText(/Edited since it was last calculated/)).toBeVisible();
    // The instant is in the markup, not a hover `title` — a keyboard or touch reader never sees
    // one (the row's own rule for `changedAt`, applied to the second timestamp it now carries).
    expect(screen.getByText(/\(3 hours ago\)/)).toHaveAttribute(
      'datetime',
      '2026-09-15T09:00:00.000Z',
    );
  });

  it('prefers "never calculated" over "edited since" if both somehow arrive', () => {
    // The server cannot send this pair — `editedSinceCalculated` is false whenever
    // `scheduleComputedAt` is null — but a component that renders "edited since … (—)" for it
    // would be printing a relative time for an instant that does not exist. Pinned so a later
    // refactor of the two conditions cannot reorder them into that.
    renderRow({ scheduleComputedAt: null, editedSinceCalculated: true });

    expect(screen.getByText('Not yet calculated')).toBeVisible();
    expect(screen.queryByText(/Edited since/)).toBeNull();
  });
});
