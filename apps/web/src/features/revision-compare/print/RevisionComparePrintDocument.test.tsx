import type { RevisionCompare, RevisionMovedActivity } from '@repo/types';
import { REVISION_COMPLETION_REASONS, REVISION_SETTINGS_VERDICTS } from '@repo/types';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { RevisionComparePrintDocument } from './RevisionComparePrintDocument';

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
    planName: 'Riverside programme',
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
      addedTotal: 0,
      removedTotal: 0,
      noCriticalPath: false,
      notAssessableReason: null,
    },
    ...over,
  };
}

const PRINTED_AT = new Date('2026-03-02T09:30:00.000Z');

describe('the printed revision comparison', () => {
  it('prints EVERY returned row, not the ones that happened to be on screen', () => {
    const rows = Array.from({ length: 60 }, (_, i) =>
      moved({ activityId: `a${i}`, code: `A${i}`, name: `Activity ${i}` }),
    );
    const { container } = render(
      <RevisionComparePrintDocument
        compare={comparison({
          criticalPath: { ...comparison().criticalPath, entered: rows, enteredTotal: 60 },
        })}
        printedAt={PRINTED_AT}
      />,
    );
    expect(container.querySelectorAll('tbody tr')).toHaveLength(60);
    expect(container.textContent).toContain('Activity 59');
  });

  /**
   * **Paper has no "load more".** A capped list that simply stops is indistinguishable from a
   * complete one, so the cap and the true total are stated in words — the rule matters MORE here
   * than on screen, which is why it is asserted separately from the panel's own truncation test.
   */
  it('states the cap in words when the server truncated the set', () => {
    const { container } = render(
      <RevisionComparePrintDocument
        compare={comparison({
          criticalPath: {
            ...comparison().criticalPath,
            entered: [moved()],
            enteredTotal: 412,
            cap: 200,
          },
        })}
        printedAt={PRINTED_AT}
      />,
    );
    expect(container.textContent).toContain('Showing the first 200 of 412');
    expect(container.textContent).toContain('not printed');
  });

  it('says nothing about a cap when the set is complete', () => {
    const { container } = render(
      <RevisionComparePrintDocument
        compare={comparison({
          criticalPath: { ...comparison().criticalPath, entered: [moved()], enteredTotal: 1 },
        })}
        printedAt={PRINTED_AT}
      />,
    );
    expect(container.textContent).not.toContain('Showing the first');
  });

  /**
   * A comparison against LIVE is only interpretable with the instant it was taken: run tomorrow it
   * reports different numbers, and a page dated only by its earlier revision looks authoritative
   * and is unreadable a week later.
   */
  it('dates a comparison against live with the instant it was taken', () => {
    const { container } = render(
      <RevisionComparePrintDocument compare={comparison()} printedAt={PRINTED_AT} />,
    );
    expect(container.textContent).toContain('as at 2026-03-02 09:30 UTC');
  });

  it('dates a baseline-to-baseline comparison by the later capture instead', () => {
    const { container } = render(
      <RevisionComparePrintDocument
        compare={comparison({
          to: {
            kind: 'BASELINE',
            id: 'b2',
            name: 'Revision B',
            computedAt: '2026-02-10T00:00:00.000Z',
            dataDate: '2026-01-01',
          },
        })}
        printedAt={PRINTED_AT}
      />,
    );
    expect(container.textContent).toContain('Later revision captured 2026-02-10');
    expect(container.textContent).not.toContain('as at');
  });

  /**
   * **The honesty footer prints.** A page listing what entered the critical path and omitting "this
   * does not say what caused it" is the one most likely to be read as blame, because paper outlives
   * the conversation it came from.
   */
  it('prints the honesty footer', () => {
    const { container } = render(
      <RevisionComparePrintDocument compare={comparison()} printedAt={PRINTED_AT} />,
    );
    expect(container.textContent).toMatch(/does not say what caused it/i);
  });

  /** The levelling note prints unconditionally — the paper reader has no diagram beside them. */
  it('prints the levelling note whatever the plan does', () => {
    const { container } = render(
      <RevisionComparePrintDocument compare={comparison()} printedAt={PRINTED_AT} />,
    );
    expect(container.textContent).toMatch(/network critical path/i);
  });

  /** A code reaching PAPER is the defect this grep exists for — over the closed set, not one member. */
  it.each(REVISION_COMPLETION_REASONS)('never prints the %s code', (reason) => {
    const { container } = render(
      <RevisionComparePrintDocument
        compare={comparison({
          completion: { ...comparison().completion, assessable: false, reason, movementDays: null },
        })}
        printedAt={PRINTED_AT}
      />,
    );
    expect(container.textContent).not.toContain(reason);
  });

  it.each(REVISION_SETTINGS_VERDICTS)('never prints the %s verdict code', (verdict) => {
    const { container } = render(
      <RevisionComparePrintDocument
        compare={comparison({ settingsVerdict: verdict })}
        printedAt={PRINTED_AT}
      />,
    );
    expect(container.textContent).not.toContain(verdict);
  });

  /** Absence and zero stay apart all the way to the page. */
  it('prints an unknown float as "unknown", never as a dash or a zero', () => {
    const { container } = render(
      <RevisionComparePrintDocument
        compare={comparison({
          criticalPath: {
            ...comparison().criticalPath,
            entered: [moved({ fromTotalFloatDays: null, toTotalFloatDays: 0 })],
            enteredTotal: 1,
          },
        })}
        printedAt={PRINTED_AT}
      />,
    );
    const cells = [...container.querySelectorAll('tbody td')].map((c) => c.textContent);
    expect(cells).toContain('unknown');
    expect(cells).toContain('0 d');
  });

  it('marks a row that is not in the live plan', () => {
    const { container } = render(
      <RevisionComparePrintDocument
        compare={comparison({
          criticalPath: {
            ...comparison().criticalPath,
            left: [moved({ existsLive: false })],
            leftTotal: 1,
          },
        })}
        printedAt={PRINTED_AT}
      />,
    );
    expect(container.textContent).toContain('not in the live plan');
  });

  /** The column names repeat on every page — pagination delegated to a native `<thead>`. */
  it('repeats its column headings across pages', () => {
    const { container } = render(
      <RevisionComparePrintDocument
        compare={comparison({
          criticalPath: { ...comparison().criticalPath, entered: [moved()], enteredTotal: 1 },
        })}
        printedAt={PRINTED_AT}
      />,
    );
    expect(container.querySelector('thead')).not.toBeNull();
  });
});
