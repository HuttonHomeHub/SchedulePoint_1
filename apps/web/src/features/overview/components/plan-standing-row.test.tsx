import type { PlanStanding } from '@repo/types';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { PlanStandingRow } from './PlanStandingRow';

/**
 * The mock emits an `href`, unlike the sibling suites' — **because an `<a>` without one has no link
 * role at all**, so `getByRole('link')` finds nothing and the assertion silently becomes a test of
 * the mock rather than of the component. That cost three red cases here before it was spotted; the
 * sibling suites query by text and never noticed.
 */
vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    to,
    params,
    ...rest
  }: {
    children: React.ReactNode;
    to: string;
    params: Record<string, string>;
  }) => (
    <a
      href={Object.entries(params).reduce((path, [k, v]) => path.replace(`$${k}`, v), to)}
      {...rest}
    >
      {children}
    </a>
  ),
}));

function standing(over: Partial<PlanStanding> = {}): PlanStanding {
  return {
    planId: 'p1',
    planName: 'Northgate — Phase 1',
    projectName: 'Northgate',
    clientName: 'Bellway',
    status: 'ACTIVE',
    activityCount: 24,
    projectFinish: '2026-10-09',
    scheduleComputedAt: '2026-09-15T11:50:00.000Z',
    editedSinceCalculated: false,
    baselineMovement: {
      kind: 'MOVED',
      workingDays: 14,
      baselineFinish: '2026-09-25',
      baselineName: 'Contract award',
    },
    flags: {},
    ...over,
  };
}

const renderRow = (over: Partial<PlanStanding> = {}) =>
  render(<PlanStandingRow standing={standing(over)} orgSlug="acme" />);

/**
 * **The assertion this file exists for is that nothing renders as a dash.**
 *
 * `plan-standing.test.ts` (the model) proves the sentences are right as strings; what it cannot
 * prove is that the component reaches for one in every state — and a state the component forgot
 * renders as an empty cell, which reads as breakage rather than as absence (ADR-0061's
 * `ContextStrip` finding, which is the whole reason the copy module exists).
 */
describe('a standing row', () => {
  it('links the plan by name and says where it sits', () => {
    renderRow();
    expect(screen.getByRole('link', { name: 'Northgate — Phase 1' })).toBeVisible();
    expect(screen.getByText(/Northgate · Bellway/)).toBeVisible();
  });

  it('carries the finish as a machine-readable date beside the human one', () => {
    renderRow();
    // `<time datetime>` rather than a hover `title`: people accountable for dates need the exact
    // one, and a title is invisible to keyboard and touch (`docs/UX_STANDARDS.md` §6).
    //
    // Asserted on the ATTRIBUTE rather than the rendered words, deliberately: the visible form goes
    // through `toLocaleDateString` with the runner's locale, so pinning "9 Oct 2026" would pin
    // en-GB and go red the day CI runs anywhere else. The attribute is the contract.
    const time = document.querySelector('time');
    expect(time).toHaveAttribute('datetime', '2026-10-09');
    expect(time?.textContent ?? '').toContain('2026');
  });

  it('renders the finish in UTC, so it does not slide by a day for half the world', () => {
    // A `YYYY-MM-DD` is a calendar date with no time and no zone. Letting the browser parse it
    // locally moves it a day for anyone west of Greenwich — the classic off-by-one that shows up
    // only for some readers and is therefore never reported by the person who built it. New Year's
    // Day is the case where the slip changes the YEAR, which is assertable without a locale.
    renderRow({ projectFinish: '2026-01-01' });
    const time = document.querySelector('time');
    expect(time?.textContent ?? '').toContain('2026');
    expect(time?.textContent ?? '').not.toContain('2025');
  });

  it.each([
    ['NO_BASELINE'],
    ['BASELINE_HAS_NO_FINISH'],
    ['PLAN_NOT_SCHEDULED'],
    ['PLAN_EMPTY'],
    ['CALENDAR_UNUSABLE'],
  ] as const)('renders a SENTENCE for %s, never a dash', (reason) => {
    renderRow({ baselineMovement: { kind: 'NOT_ASSESSABLE', reason }, projectFinish: null });

    // Each of these states also has no finish date, which is the other place a dash would appear.
    expect(screen.getByText('No finish date yet')).toBeVisible();

    // **No ELEMENT is a dash**, which is the defect's real shape. A regex over the row's whole text
    // cannot express this: the copy legitimately uses em dashes as punctuation ("No baseline to
    // measure against — capture one…"), and the plan name in this fixture contains one, so a text
    // scan would fire on correct output. What reads as breakage is a cell whose ENTIRE content is
    // a dash, so that is what is asserted.
    for (const node of document.querySelectorAll('p, td, span, time, li')) {
      expect(['—', '–', '-', '', 'N/A']).not.toContain((node.textContent ?? '').trim());
    }
  });

  it('says which way the finish moved, in a word rather than a colour', () => {
    renderRow({
      baselineMovement: {
        kind: 'MOVED',
        workingDays: -3,
        baselineFinish: '2026-10-12',
        baselineName: 'Contract award',
      },
    });
    expect(screen.getByText(/3 working days earlier/)).toBeVisible();
  });

  it('lists each flag on its own line, and omits the section when there are none', () => {
    const { unmount } = renderRow({ flags: { constraintViolated: 2, visualConflict: 1 } });
    // Independent problems with independent remedies — a comma-separated run reads as one.
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    unmount();

    renderRow({ flags: {} });
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
  });

  it('badges a DRAFT and nothing else', () => {
    const { unmount } = renderRow({ status: 'DRAFT' });
    expect(screen.getByText('Draft')).toBeVisible();
    unmount();

    renderRow({ status: 'ACTIVE' });
    expect(screen.queryByText('Draft')).toBeNull();
  });
});
