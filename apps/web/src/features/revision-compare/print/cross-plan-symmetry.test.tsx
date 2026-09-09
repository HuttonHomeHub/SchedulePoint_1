import type { CrossPlanRevisionCompare } from '@repo/types';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { RevisionComparePanel } from '../components/RevisionComparePanel';
import {
  correlationSentence,
  frameSentence,
  noCommonCodesSentence,
  RECODE_CAVEAT,
  uncodedSentence,
} from '../model/revision-sentences';

import { RevisionComparePrintDocument } from './RevisionComparePrintDocument';

/**
 * **The printed document states no fact the screen withholds, and withholds none the screen
 * states** — asserted in BOTH directions, because this repository has shipped each once.
 *
 * ADR-0125's gate pass found three facts printed while the screen withheld them, and called it
 * _"the health epic's D9 finding recurring, in the same direction: the person who was not in the
 * room got more than the planner looking at the diagram."_ ADR-0106's gate pass found the inverse.
 * A test that checked one direction would have passed on the day either shipped.
 *
 * **It walks the ONE shared source of sentences** (`revision-sentences.ts`) and asserts both
 * renderings consume it. That is what makes the claim structural rather than a comparison of two
 * hand-written lists: a sentence added to one surface and not the other fails here, and a sentence
 * edited in the shared module cannot drift between them at all, because there is nowhere for a
 * second copy to live.
 *
 * **What it does NOT claim**, stated because a gate whose reach is unwritten gets cited for more
 * than it proves: it checks the SENTENCES both surfaces are built from, not their layout, not their
 * ordering, and not facts either surface renders inline without going through the shared module.
 * The correlation ROW LISTS are one such fact and are asserted separately below.
 */

const CROSS_PLAN: CrossPlanRevisionCompare = {
  fromPlan: { id: 'p-old', name: 'Riverside Rev A', projectId: 'proj', projectName: 'Riverside' },
  toPlan: { id: 'p-new', name: 'Riverside Rev B', projectId: 'proj', projectName: 'Riverside' },
  from: {
    kind: 'LIVE',
    id: null,
    name: null,
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
  frame: {
    planId: 'p-old',
    planName: 'Riverside Rev A',
    calendarName: 'Six-day week',
    hoursPerDayMinutes: 1440,
  },
  settingsVerdict: 'MATCH',
  correlation: {
    key: 'CODE',
    matched: 3,
    fromUnmatched: 1,
    toUnmatched: 1,
    fromUncoded: 1,
    toUncoded: 0,
    fromUnmatchedRows: [
      {
        activityId: null,
        code: 'GONE',
        name: 'Site hoarding',
        planId: 'p-old',
        planName: 'Riverside Rev A',
      },
    ],
    toUnmatchedRows: [
      {
        activityId: 'a-new',
        code: 'NEW',
        name: 'Temporary works',
        planId: 'p-new',
        planName: 'Riverside Rev B',
      },
    ],
    uncodedRows: [
      {
        activityId: 'a-unc',
        code: null,
        name: 'Snagging',
        planId: 'p-new',
        planName: 'Riverside Rev B',
      },
    ],
    cap: 200,
  },
  notAssessableReason: null,
  completion: {
    assessable: true,
    reason: null,
    carrierActivityId: 'a-carrier',
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
    remainedCriticalCount: 2,
    remainedNonCriticalCount: 1,
    added: [],
    removed: [],
    addedTotal: 1,
    removedTotal: 1,
    noCriticalPath: false,
    notAssessableReason: null,
  },
};

/** Everything the shared module says about THIS comparison — the fact set both surfaces owe. */
function sharedFacts(compare: CrossPlanRevisionCompare): string[] {
  const uncoded = uncodedSentence(compare.correlation);
  return [
    correlationSentence(compare.correlation),
    frameSentence(compare.frame),
    RECODE_CAVEAT,
    ...(uncoded === null ? [] : [uncoded]),
  ];
}

/** Text with whitespace collapsed, so a line break in one renderer is not a missing fact. */
const flatten = (element: HTMLElement): string => (element.textContent ?? '').replace(/\s+/g, ' ');

function renderPanel(compare: CrossPlanRevisionCompare): HTMLElement {
  const { container } = render(
    <RevisionComparePanel
      baselines={[]}
      baselinesPending={false}
      compare={compare}
      isPending={false}
      isError={false}
      onRetry={vi.fn()}
      from={null}
      to="live"
      onFromChange={vi.fn()}
      onToChange={vi.fn()}
      onClose={vi.fn()}
      onActivateActivity={vi.fn()}
      otherPlans={[]}
      otherPlansPending={false}
      comparePlanId="p-old"
      onComparePlanChange={vi.fn()}
    />,
  );
  return container;
}

function renderPrint(compare: CrossPlanRevisionCompare): HTMLElement {
  const { container } = render(<RevisionComparePrintDocument compare={compare} />);
  return container;
}

describe('the cross-plan comparison says the same things on screen and on paper', () => {
  it('every shared sentence reaches BOTH renderings', () => {
    const facts = sharedFacts(CROSS_PLAN);
    // The pinned positive case: an empty fact set would satisfy every assertion below by having
    // nothing to check — this repository's most-recorded green-for-the-wrong-reason failure.
    expect(facts.length).toBeGreaterThan(3);

    const onScreen = flatten(renderPanel(CROSS_PLAN));
    const onPaper = flatten(renderPrint(CROSS_PLAN));
    for (const fact of facts) {
      const flat = fact.replace(/\s+/g, ' ');
      expect(onScreen, `the SCREEN withholds a fact the paper states: ${flat}`).toContain(flat);
      expect(onPaper, `the PAPER withholds a fact the screen states: ${flat}`).toContain(flat);
    }
  });

  it('both name BOTH plans and both projects', () => {
    // With two plans on screen the reader can infer neither — and two re-imports of one programme
    // routinely carry the same plan name, which is why the project is named too.
    for (const text of [flatten(renderPanel(CROSS_PLAN)), flatten(renderPrint(CROSS_PLAN))]) {
      expect(text).toContain('Riverside Rev A');
      expect(text).toContain('Riverside Rev B');
      expect(text).toContain('Riverside');
    }
  });

  it('the correlation ROWS are on paper in full, where the screen keeps them behind a disclosure', () => {
    /**
     * The one asymmetry, and it is a difference in AFFORDANCE rather than in facts.
     *
     * Paper has no "load more" and no disclosure to open, so a list that is merely collapsed there
     * is a list nobody can read; the screen has both, and expanding every list by default would
     * bury the sentence the block exists to lead with. So the rows print unconditionally and the
     * screen keeps them one press away — the same facts, reached differently.
     */
    const onPaper = flatten(renderPrint(CROSS_PLAN));
    expect(onPaper).toContain('Site hoarding');
    expect(onPaper).toContain('Temporary works');
    expect(onPaper).toContain('Snagging');
  });

  it('NO_COMMON_CODES prints as a sentence and replaces the derived sections, as on screen', () => {
    const barren: CrossPlanRevisionCompare = {
      ...CROSS_PLAN,
      notAssessableReason: 'NO_COMMON_CODES',
      correlation: { ...CROSS_PLAN.correlation, matched: 0 },
      completion: { ...CROSS_PLAN.completion, assessable: false, reason: 'NO_COMMON_ACTIVITIES' },
    };
    const sentence = noCommonCodesSentence(barren).replace(/\s+/g, ' ');
    const onPaper = flatten(renderPrint(barren));
    const onScreen = flatten(renderPanel(barren));
    expect(onPaper).toContain(sentence);
    expect(onScreen).toContain(sentence);
    // And neither prints the completion figure over a comparison that could not be made — four
    // empty sections read as "assessed, and nothing changed", which is the opposite of the truth.
    expect(onPaper).not.toContain('Commissioning');
    expect(onScreen).not.toContain('Commissioning');
  });

  it('a reason CODE never reaches either surface', () => {
    // The rule the whole feature turns on, asserted on both renderings rather than one.
    const barren: CrossPlanRevisionCompare = {
      ...CROSS_PLAN,
      notAssessableReason: 'NO_COMMON_CODES',
      correlation: { ...CROSS_PLAN.correlation, matched: 0 },
      completion: { ...CROSS_PLAN.completion, assessable: false, reason: 'NO_COMMON_ACTIVITIES' },
    };
    for (const text of [flatten(renderPanel(barren)), flatten(renderPrint(barren))]) {
      expect(text).not.toContain('NO_COMMON_CODES');
      expect(text).not.toContain('NO_COMMON_ACTIVITIES');
    }
    screen.queryAllByText(/_/); // no-op guard against a bare underscore reaching the DOM
  });
});
