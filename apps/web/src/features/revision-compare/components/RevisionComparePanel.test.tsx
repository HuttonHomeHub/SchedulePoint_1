import type { BaselineSummary, RevisionCompare, RevisionMovedActivity } from '@repo/types';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

import { RevisionComparePanel, type RevisionComparePanelProps } from './RevisionComparePanel';

const announce = vi.fn();
vi.mock('@/components/ui/announcer', () => ({ useAnnounce: () => announce }));

function baseline(over: Partial<BaselineSummary> = {}): BaselineSummary {
  return {
    id: 'b1',
    planId: 'p1',
    name: 'Contract Baseline',
    isActive: true,
    capturedAt: '2026-01-05T00:00:00.000Z',
    dataDate: '2026-01-01',
    capturedProjectFinish: '2026-06-01',
    activityCount: 147,
    version: 1,
    createdAt: '2026-01-05T00:00:00.000Z',
    updatedAt: '2026-01-05T00:00:00.000Z',
    ...over,
  };
}

function moved(over: Partial<RevisionMovedActivity> = {}): RevisionMovedActivity {
  return {
    activityId: 'a1',
    code: 'A0001',
    name: 'Roof covering',
    fromTotalFloatDays: 12,
    toTotalFloatDays: 0,
    floatMovementDays: -12,
    fromEarlyStart: '2026-02-01',
    toEarlyStart: '2026-02-10',
    fromEarlyFinish: '2026-02-20',
    toEarlyFinish: '2026-03-01',
    existsLive: true,
    ...over,
  };
}

function comparison(over: Partial<RevisionCompare> = {}): RevisionCompare {
  return {
    planId: 'p1',
    planName: 'Riverside',
    from: {
      kind: 'BASELINE',
      id: 'b1',
      name: 'Contract Baseline',
      computedAt: '2026-01-05T00:00:00.000Z',
      dataDate: '2026-01-01',
    },
    to: {
      kind: 'LIVE',
      id: null,
      name: null,
      computedAt: '2026-03-01T00:00:00.000Z',
      dataDate: '2026-01-01',
    },
    dayFactorMinutes: 1440,
    settingsVerdict: 'MATCH',
    completion: {
      assessable: true,
      reason: null,
      carrierActivityId: 'a9',
      carrierName: 'Commissioning',
      fromFinish: '2026-06-01',
      toFinish: '2026-06-15',
      movementDays: 14,
      carrierChanged: false,
      newSideCarrierActivityId: null,
      newSideCarrierName: null,
    },
    criticalPath: {
      entered: [],
      left: [],
      enteredTotal: 0,
      leftTotal: 0,
      cap: 200,
      remainedCriticalCount: 3,
      remainedNonCriticalCount: 8,
      added: [],
      removed: [],
      noCriticalPath: false,
    },
    ...over,
  };
}

function renderPanel(over: Partial<RevisionComparePanelProps> = {}) {
  const props: RevisionComparePanelProps = {
    baselines: [baseline()],
    baselinesPending: false,
    compare: null,
    isPending: false,
    isError: false,
    onRetry: vi.fn(),
    from: null,
    to: 'live',
    onFromChange: vi.fn(),
    onToChange: vi.fn(),
    onClose: vi.fn(),
    ...over,
  };
  return { ...render(<RevisionComparePanel {...props} />), props };
}

describe('RevisionComparePanel', () => {
  it('is loading before the revisions arrive', () => {
    renderPanel({ baselines: null, baselinesPending: true });
    expect(screen.getByText(/loading revisions/i)).toBeInTheDocument();
  });

  /**
   * **"No revisions" and "nothing changed" are different facts and must not collapse** — the
   * ADR-0073 C1 defect, where one live region said "Showing 0 events" for both "nothing recorded
   * yet" and "nothing matches your filter". This case and the next assert the two states separately
   * AND assert the strings differ, which is the part a single-state test would miss.
   */
  it('says a plan with no revisions has nothing to compare against', () => {
    renderPanel({ baselines: [] });
    expect(screen.getByText(/no saved revisions yet/i)).toBeInTheDocument();
    expect(screen.queryByText(/nothing entered the critical path/i)).not.toBeInTheDocument();
  });

  it('says nothing entered or left — a real answer, not an empty state', () => {
    renderPanel({ from: 'b1', compare: comparison() });
    expect(screen.getByText(/nothing entered the critical path/i)).toBeInTheDocument();
    expect(screen.getByText(/nothing left the critical path/i)).toBeInTheDocument();
    expect(screen.queryByText(/no saved revisions yet/i)).not.toBeInTheDocument();
  });

  it('announces the settled comparison once', () => {
    announce.mockClear();
    const { rerender, props } = renderPanel({ from: 'b1', compare: comparison() });
    expect(announce).toHaveBeenCalledTimes(1);
    // A re-render with the SAME comparison must not re-arm the message (the ADR-0079 lesson).
    rerender(<RevisionComparePanel {...props} from="b1" compare={props.compare} />);
    expect(announce).toHaveBeenCalledTimes(1);
  });

  it('names the carrier and the frame in the completion statement', () => {
    renderPanel({ from: 'b1', compare: comparison() });
    expect(screen.getByText(/Commissioning/)).toBeInTheDocument();
    expect(screen.getByText(/14 working days later/)).toBeInTheDocument();
    expect(screen.getByText(/on the plan calendar/)).toBeInTheDocument();
  });

  it('renders a NOT_ASSESSABLE completion as a sentence, never as the code', () => {
    renderPanel({
      from: 'b1',
      compare: comparison({
        completion: {
          ...comparison().completion,
          assessable: false,
          reason: 'PLAN_NOT_SCHEDULED',
          movementDays: null,
        },
      }),
    });
    expect(screen.queryByText(/PLAN_NOT_SCHEDULED/)).not.toBeInTheDocument();
    expect(screen.getByText(/no computed finish date/i)).toBeInTheDocument();
  });

  /** The three-valued verdict, at the surface. UNKNOWN renders a caveat; MATCH renders none. */
  it('warns when the two revisions used different criticality settings', () => {
    renderPanel({ from: 'b1', compare: comparison({ settingsVerdict: 'DIFFERS' }) });
    expect(screen.getByText(/different criticality settings/i)).toBeInTheDocument();
  });

  it('says so when one side does not record its criticality settings', () => {
    renderPanel({ from: 'b1', compare: comparison({ settingsVerdict: 'UNKNOWN' }) });
    expect(screen.getByText(/does not record which criticality settings/i)).toBeInTheDocument();
  });

  it('says nothing about settings when the two agree', () => {
    renderPanel({ from: 'b1', compare: comparison({ settingsVerdict: 'MATCH' }) });
    expect(screen.queryByText(/criticality settings/i)).not.toBeInTheDocument();
  });

  it('lists what entered, with both sides’ float and its own movement', () => {
    renderPanel({
      from: 'b1',
      compare: comparison({
        criticalPath: { ...comparison().criticalPath, entered: [moved()], enteredTotal: 1 },
      }),
    });
    const section = screen.getByRole('region', { name: /entered the critical path/i });
    expect(within(section).getByText('Roof covering')).toBeInTheDocument();
    expect(within(section).getByText(/float down 12 days/i)).toBeInTheDocument();
  });

  /** Absence and zero are different facts, kept apart at the last place they could be collapsed. */
  it('states an unknown float movement rather than printing zero', () => {
    renderPanel({
      from: 'b1',
      compare: comparison({
        criticalPath: {
          ...comparison().criticalPath,
          entered: [moved({ floatMovementDays: null, toTotalFloatDays: null })],
          enteredTotal: 1,
        },
      }),
    });
    expect(screen.getByText(/float movement unknown/i)).toBeInTheDocument();
  });

  /** A row from a frozen side naming a since-deleted activity SAYS SO rather than looking normal. */
  it('marks a row that is not in the live plan', () => {
    renderPanel({
      from: 'b1',
      compare: comparison({
        criticalPath: {
          ...comparison().criticalPath,
          left: [moved({ existsLive: false })],
          leftTotal: 1,
        },
      }),
    });
    expect(screen.getByText(/not in the live plan/i)).toBeInTheDocument();
  });

  /** The cap and the true total both come from the payload — never a constant held here. */
  it('states a truncation with the true total', () => {
    renderPanel({
      from: 'b1',
      compare: comparison({
        criticalPath: { ...comparison().criticalPath, entered: [moved()], enteredTotal: 412 },
      }),
    });
    expect(screen.getByText(/showing the first 200 of 412/i)).toBeInTheDocument();
  });

  it('reports a read failure with a retry, not a blank panel', () => {
    const onRetry = vi.fn();
    renderPanel({ from: 'b1', isError: true, onRetry });
    expect(screen.getByRole('alert')).toHaveTextContent(/could not be read/i);
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });

  it('says the plan levels resources, rather than leaving the two pictures to disagree', () => {
    renderPanel({ from: 'b1', compare: comparison(), levelResources: true });
    expect(screen.getByText(/levels resources/i)).toBeInTheDocument();
  });

  /**
   * The honesty footer is LINKED to the results region, not merely below it: a landmark-navigating
   * reader lands inside that region and would otherwise reach the caveat only by reading serially
   * to the end (the ADR-0073 C2.5 finding).
   */
  it('links the honesty footer to the results it qualifies', () => {
    const { container } = renderPanel({ from: 'b1', compare: comparison() });
    const described = container.querySelector('[aria-describedby]');
    expect(described).not.toBeNull();
    const footerId = described!.getAttribute('aria-describedby')!;
    expect(container.querySelector(`#${footerId}`)!.textContent).toMatch(
      /does not say what caused/i,
    );
  });

  /** The default `to` is live and it is LABELLED as live — the commonest choice is not the blank one. */
  it('offers Live as a named option on the later side', () => {
    renderPanel();
    const to = screen.getByLabelText(/compared with/i);
    expect(within(to).getByRole('option', { name: /live/i })).toBeInTheDocument();
  });

  it('has no axe violations with a populated result', async () => {
    const { container } = renderPanel({
      from: 'b1',
      compare: comparison({
        criticalPath: {
          ...comparison().criticalPath,
          entered: [moved()],
          enteredTotal: 1,
          left: [moved({ activityId: 'a2', name: 'Screed', floatMovementDays: 4 })],
          leftTotal: 1,
          added: [
            { activityId: 'a3', code: null, name: 'Snagging', isCritical: false, existsLive: true },
          ],
        },
        settingsVerdict: 'UNKNOWN',
      }),
      levelResources: true,
    });
    // A POPULATED scan, deliberately: an all-empty scan certifies nothing (the ADR-0116 M5
    // finding), so this drives the states a real comparison actually renders.
    expect((await axe(container)).violations).toEqual([]);
  });

  it('has no axe violations in the no-revisions state', async () => {
    const { container } = renderPanel({ baselines: [] });
    expect((await axe(container)).violations).toEqual([]);
  });
});
