import type { BaselineSummary, RevisionCompare, RevisionMovedActivity } from '@repo/types';
import { fireEvent, render, screen, within } from '@testing-library/react';
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
      addedTotal: 0,
      removedTotal: 0,
      noCriticalPath: false,
      notAssessableReason: null,
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
    onActivateActivity: vi.fn(),
    // The same-plan default: no other plans loaded, so the **Compare with** picker does not render
    // and every existing case below runs against exactly the surface it always did. That is the
    // rollback contract for this milestone, since there is no flag — a case asserting the shipped
    // route is still called with the shipped params sits with the cross-plan cases.
    otherPlans: null,
    otherPlansPending: false,
    comparePlanId: null,
    onComparePlanChange: vi.fn(),
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
    // TWO occurrences, deliberately and not by accident: the visible marker on the row, and the
    // `sr-only` reason linked by `aria-describedby`. A single-element query would have to pick one,
    // and the point is that both channels carry it.
    expect(screen.getAllByText(/not in the live plan/i)).toHaveLength(2);
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

  /**
   * M3-T1. A row activates and reaches the host once — the seam the journey then proves in the
   * shipped layout.
   */
  it('activates a row that is on the live plan', () => {
    const onActivateActivity = vi.fn();
    renderPanel({
      from: 'b1',
      onActivateActivity,
      compare: comparison({
        criticalPath: { ...comparison().criticalPath, entered: [moved()], enteredTotal: 1 },
      }),
    });
    fireEvent.click(screen.getByRole('button', { name: /Roof covering/ }));
    expect(onActivateActivity).toHaveBeenCalledExactlyOnceWith('a1');
  });

  /**
   * **A row that cannot be activated is SHADED WITH A REASON, never silently inert and never
   * hidden** (ADR-0082). `aria-disabled` plus a guard rather than the native attribute: a native
   * `disabled` removes the control from the tab order along with the explanation, which is the
   * defect one layer down, and blurs to `<body>` on a gate that flips.
   */
  it('shades a row that is not in the live plan, and says why', () => {
    const onActivateActivity = vi.fn();
    renderPanel({
      from: 'b1',
      onActivateActivity,
      compare: comparison({
        criticalPath: {
          ...comparison().criticalPath,
          left: [moved({ existsLive: false })],
          leftTotal: 1,
        },
      }),
    });
    const row = screen.getByRole('button', { name: /Roof covering/ });
    expect(row).toHaveAttribute('aria-disabled', 'true');
    // Still focusable — the reason is reachable by keyboard, which a native `disabled` would take
    // away along with the control.
    expect(row).not.toHaveAttribute('disabled');
    fireEvent.click(row);
    expect(onActivateActivity).not.toHaveBeenCalled();
    // The reason is a LINKED sibling, not folded into the name.
    const reasonId = row.getAttribute('aria-describedby');
    expect(reasonId).not.toBeNull();
    expect(document.getElementById(reasonId!)!.textContent).toMatch(/not in the live plan/i);
  });

  /**
   * Activation is REQUIRED, matching both sibling panels — so every row is a control, and the
   * "plain text when the host offers none" branch is gone with the optional prop that scaffolded a
   * standalone host nobody asked for (the M4 component review).
   */
  it('renders every row as an activatable control', () => {
    renderPanel({
      from: 'b1',
      compare: comparison({
        criticalPath: { ...comparison().criticalPath, entered: [moved()], enteredTotal: 1 },
      }),
    });
    expect(screen.getByRole('button', { name: /Roof covering/ })).toBeInTheDocument();
  });

  /**
   * **Activating a row is ANNOUNCED** — the line this panel's docblocks said it had "reused rather
   * than re-derived" from the health panel and had not. Focus stays on the row and the canvas is
   * `aria-hidden`, so nothing else tells a screen-reader user the press did anything.
   */
  it('announces the activation, because nothing else does', () => {
    announce.mockClear();
    renderPanel({
      from: 'b1',
      compare: comparison({
        criticalPath: { ...comparison().criticalPath, entered: [moved()], enteredTotal: 1 },
      }),
    });
    announce.mockClear();
    fireEvent.click(screen.getByRole('button', { name: /Roof covering/ }));
    expect(announce).toHaveBeenCalledWith('Roof covering selected in the plan.');
  });

  /**
   * **B6, the sharpest finding of the gate pass.** `isCritical` defaults false, so a plan that was
   * never calculated has no critical activity — and the delta reported every activity critical in
   * the baseline as having LEFT the critical path. Each row true, the picture false. The server now
   * withholds the sets; this asserts the panel states the reason instead of rendering empties that
   * read as "nothing moved".
   */
  it('says a revision was never calculated rather than showing a fabricated delta', () => {
    renderPanel({
      from: 'b1',
      compare: comparison({
        criticalPath: {
          ...comparison().criticalPath,
          notAssessableReason: 'SIDE_NOT_SCHEDULED',
        },
      }),
    });
    expect(screen.getByText(/never calculated/i)).toBeInTheDocument();
    expect(
      screen.queryByRole('region', { name: /entered the critical path/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/nothing entered the critical path/i)).not.toBeInTheDocument();
  });

  /** Neither side has a critical path — a fact to state, and a DIFFERENT one from the above. */
  it('states that neither revision has a critical path', () => {
    renderPanel({
      from: 'b1',
      compare: comparison({
        criticalPath: { ...comparison().criticalPath, noCriticalPath: true },
      }),
    });
    expect(screen.getByText(/neither revision has a critical path/i)).toBeInTheDocument();
    expect(screen.queryByText(/never calculated/i)).not.toBeInTheDocument();
  });

  /** The denominator, without which "7 entered" could be 7 of 10 or 7 of 400. */
  it('gives the counts a denominator', () => {
    renderPanel({ from: 'b1', compare: comparison() });
    expect(
      screen.getByText(/3 of 11 activities on both revisions were critical in both/i),
    ).toBeInTheDocument();
  });

  /** A changed carrier is rendered, not merely computed. */
  it('renders the changed-carrier note', () => {
    renderPanel({
      from: 'b1',
      compare: comparison({
        completion: {
          ...comparison().completion,
          carrierChanged: true,
          newSideCarrierActivityId: 'a7',
          newSideCarrierName: 'Commissioning B',
        },
      }),
    });
    expect(screen.getByText(/a different activity finishes last now/i)).toBeInTheDocument();
  });

  it('shows a comparing state once a pair is chosen', () => {
    renderPanel({ from: 'b1', isPending: true });
    expect(screen.getByText(/comparing…/i)).toBeInTheDocument();
  });

  /**
   * **The same revision on both sides is unreachable at the picker**, rather than a state to
   * recover from — it used to be one click away with a single baseline captured, and produced a
   * permanent "Comparing…" spinner because a disabled TanStack query stays pending forever.
   */
  it('never offers the other side’s current choice', () => {
    renderPanel({ from: 'b1', to: 'live' });
    const earlier = screen.getByLabelText(/earlier revision/i);
    expect(within(earlier).getByRole('option', { name: 'Contract Baseline' })).toBeInTheDocument();
    const later = screen.getByLabelText(/compared with/i);
    expect(
      within(later).queryByRole('option', { name: 'Contract Baseline' }),
    ).not.toBeInTheDocument();
  });

  /**
   * **The empty state has an exit** — the spec names "Capture a baseline…" as the SOLE accepted
   * mitigation for "the feature is useless to anyone who never captured one", and it shipped as
   * plain text with no action on the state a planner meets first.
   */
  it('offers a way out of the no-revisions state, and explains its absence to a Viewer', () => {
    const onOpenBaselines = vi.fn();
    const { unmount } = renderPanel({ baselines: [], onOpenBaselines });
    expect(screen.getByRole('button', { name: /capture a baseline/i })).toBeInTheDocument();
    unmount();

    renderPanel({ baselines: [] });
    expect(screen.queryByRole('button', { name: /capture a baseline/i })).not.toBeInTheDocument();
    expect(screen.getByText(/needs a Planner or Org Admin/i)).toBeInTheDocument();
  });

  /**
   * The honesty footer is linked to a NAMED LANDMARK, not a bare div. The first version wired the
   * description correctly to an element no landmark command can reach, and the first version of
   * THIS test could not tell the difference — it asserted that some element carried
   * `aria-describedby` and never that the element was a region with a name.
   */
  it('links the honesty footer to a named region a landmark command reaches', () => {
    renderPanel({ from: 'b1', compare: comparison() });
    const results = screen.getByRole('region', { name: 'Comparison result' });
    const footerId = results.getAttribute('aria-describedby');
    expect(footerId).not.toBeNull();
    expect(document.getElementById(footerId!)!.textContent).toMatch(/does not say what caused/i);
  });

  /** M3-T2's entry point. Withheld before a comparison exists — there is nothing to print. */
  it('offers Print comparison only once a comparison exists', () => {
    const { rerender, props } = renderPanel();
    expect(screen.queryByRole('button', { name: /print comparison/i })).not.toBeInTheDocument();
    rerender(<RevisionComparePanel {...props} from="b1" compare={comparison()} />);
    expect(screen.getByRole('button', { name: /print comparison/i })).toBeInTheDocument();
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

describe('the Changes view', () => {
  const withChanges = (): RevisionCompare => ({
    ...comparison(),
    changes: {
      cap: 200,
      classes: [
        {
          changeClass: 'RENAMED',
          notAssessableReason: null,
          rows: [
            {
              activityId: 'a1',
              subjectId: 'a1',
              changeClass: 'RENAMED',
              code: 'A10',
              name: 'Piling',
              from: 'Piling',
              to: 'Piling rig',
              orderKey: '2026-01-05',
              // The shaded case by default: this row names something the live plan no longer has.
              existsLive: false,
            },
          ],
          total: 1,
        },
        { changeClass: 'RELOGICKED', notAssessableReason: 'NOT_SNAPSHOTTED', rows: [], total: 0 },
      ],
    },
  });

  /**
   * A reachable change-list row **that appears in no delta list at all**.
   *
   * This fixture used to place the activity in the delta's `added`, because reachability was
   * derived client-side from the delta's rows. It is not any more — the server answers it per row
   * (`existsLive`) — and the reason is exactly what this fixture now depicts: once the paid classes
   * landed, most change rows name activities that entered and left nothing, so deriving from the
   * delta shaded them with a sentence saying they are not in the live plan while the reader could
   * see the bar.
   *
   * The NAME half of the original finding survives and is what the test below still pins: the
   * panel's fallback lookup searches only `entered` and `left`, so a row like this one announces a
   * bare "Activity selected in the plan" unless it passes its own name.
   */
  const withChangesLive = (): RevisionCompare => {
    const base = withChanges();
    const [renamed, ...rest] = base.changes?.classes ?? [];
    return {
      ...base,
      changes: {
        cap: base.changes?.cap ?? 200,
        classes: [
          {
            ...renamed!,
            rows: (renamed?.rows ?? []).map((r) => ({ ...r, existsLive: true })),
          },
          ...rest,
        ],
      },
    };
  };

  it('shows NO view switch when the payload carries no change list', () => {
    // The switch is derived from the payload, not from a flag: a control that appears and then
    // renders nothing is the dead end this epic's own register entry is about.
    renderPanel({ compare: comparison() });
    expect(screen.queryByRole('button', { name: 'Changes' })).not.toBeInTheDocument();
  });

  it('switches to the change list and back, with the pressed state on the right control', () => {
    renderPanel({ compare: withChanges() });
    const changes = screen.getByRole('button', { name: 'Changes' });
    expect(changes).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(changes);
    expect(changes).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('group', { name: 'Changes between these revisions' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Critical path' }));
    // By ROLE, not by text: the phrase appears as a heading and inside a section's own copy, so a
    // bare text query is ambiguous — and an ambiguous locator is how a suite comes to assert on
    // whichever node happens to be first.
    expect(screen.getByRole('region', { name: /Entered the critical path/i })).toBeVisible();
  });

  it('renders a class it could not assess as a REASON, never as "no changes"', () => {
    // The epic in one assertion. An empty list and an un-looked-at list read identically unless
    // the product says which it is, and the reassuring reading is the false one.
    renderPanel({ compare: withChanges() });
    fireEvent.click(screen.getByRole('button', { name: 'Changes' }));
    const logic = screen.getByRole('region', { name: 'Logic changed' });
    expect(within(logic).getByText(/cannot be compared/i)).toBeVisible();
    expect(within(logic).queryByText(/No changes in this revision/i)).not.toBeInTheDocument();
  });

  it('shades a row whose activity is not in the live plan, with a reason', () => {
    renderPanel({ compare: withChanges() });
    fireEvent.click(screen.getByRole('button', { name: 'Changes' }));
    // The SERVER said so: this row's `existsLive` is false. The client no longer infers it.
    const row = screen.getByRole('button', { name: /A10/ });
    expect(row).toHaveAttribute('aria-disabled', 'true');
    // **The reason is the DESCRIPTION, and the name is the row.** Asserted on the accessible name
    // itself rather than on "the sentence is somewhere inside the button", which is what the first
    // version did and what let the sentence sit in the name for a whole milestone: a
    // `{ name: /A10/ }` regex matches a polluted name just as happily. ADR-0109 records this exact
    // shape shipping once before, for the same reason.
    // Asserted as an ABSENCE from the name plus a presence in the description, rather than as an
    // exact name string: jsdom's name computation concatenates the two spans without a separator
    // ("A10Piling → Piling rig"), which is a property of the accumulator and not of the markup, and
    // pinning it would make this case fail on a whitespace change that no reader would notice.
    expect(row).not.toHaveAccessibleName(/not in the live plan/i);
    expect(row).toHaveAccessibleDescription(/not in the live plan/i);
    expect(within(row).queryByText(/cannot be shown on the diagram/i)).not.toBeInTheDocument();
  });

  it('announces the settled change list ONCE, and not again on a re-render', () => {
    // The `spokenRef` guard, pinned. Its docblock cites the ADR-0079 stale-debounce lesson by
    // name — a re-render must not re-arm the message, or a later one overwrites it — and nothing
    // asserted it, while the panel's own sibling settle effect two components away IS pinned.
    // Found by the component review, not by anything failing.
    // **Cleared HERE, because `announce` is one module-level `vi.fn()` with no `beforeEach` in
    // this file** — so a count taken without clearing measures every test that ran before it. The
    // first version of this case asserted 1 and got 4, which was the suite's history and not a
    // defect in the component.
    announce.mockClear();
    const compare = withChanges();
    const { rerender, props } = renderPanel({ compare });
    fireEvent.click(screen.getByRole('button', { name: 'Changes' }));
    const spoken = announce.mock.calls.filter((c) => String(c[0]).includes('categories'));
    expect(spoken).toHaveLength(1);
    // Same report object, new render: the guard is identity-keyed, so nothing re-announces.
    rerender(<RevisionComparePanel {...props} />);
    expect(announce.mock.calls.filter((c) => String(c[0]).includes('categories'))).toHaveLength(1);
  });

  it('offers to reveal a row that appears in NO delta list', () => {
    // The M5 defect this exists to prevent. A re-laned, re-parented or progressed activity enters
    // and leaves nothing, so it is in none of the delta's four lists — and under the old
    // client-side derivation every such row was shaded with a sentence claiming it is not in the
    // live plan, about a bar the reader can see. Verified red against that derivation.
    renderPanel({ compare: withChangesLive() });
    fireEvent.click(screen.getByRole('button', { name: 'Changes' }));
    const row = screen.getByRole('button', { name: /A10/ });
    expect(row).not.toHaveAttribute('aria-disabled', 'true');
    expect(within(row).queryByText(/cannot be shown in the diagram/i)).not.toBeInTheDocument();
  });

  it('NAMES the activity when a change-list row is activated', () => {
    // Reachability is derived from FOUR lists (entered, left, added, removed); the panel's name
    // lookup searches TWO. So a change-list row whose activity sits in `added` or `removed` is
    // pressable and announces a bare "Activity selected in the plan" — the name withheld from the
    // one reader with no other way to learn which row they pressed. The row carries its own name
    // and now passes it.
    //
    // **The first version of this test passed with the fix removed**, because its fixture put the
    // row in `entered`, where the fallback finds the name anyway. It asserted a true thing for a
    // reason that was not the fix, and the "verified red" note beside it was false until the
    // fixture was rebuilt on the reachable case. Verified red for real: without the second
    // argument this announces "Activity selected in the plan.".
    const onActivateActivity = vi.fn();
    renderPanel({ compare: withChangesLive(), onActivateActivity });
    fireEvent.click(screen.getByRole('button', { name: 'Changes' }));
    fireEvent.click(screen.getByRole('button', { name: /A10/ }));
    expect(onActivateActivity).toHaveBeenCalledWith('a1');
    expect(announce).toHaveBeenCalledWith('Piling selected in the plan.');
  });

  it('has no axe violations in the change list', async () => {
    const { container } = renderPanel({ compare: withChanges() });
    fireEvent.click(screen.getByRole('button', { name: 'Changes' }));
    expect((await axe(container)).violations).toEqual([]);
  });
});
