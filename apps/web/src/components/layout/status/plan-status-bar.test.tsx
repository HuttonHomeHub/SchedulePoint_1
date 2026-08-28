import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { deriveScheduleState, PlanStatusBar, type ScheduleState } from './plan-status-bar';

/**
 * **Branch cover for the plan status bar** (Graphite M10; title corrected 2026-08-20).
 *
 * **This docblock was wrong, and the reconciliation pass that followed caught it in one command.**
 * It said the M10 review had found `PlanStatusBar` with "no coverage at all, direct or indirect",
 * because `plan-workspace-toolbar.test.tsx` mounts no chrome host and `ChromePortal` returns `null`
 * without one. That file **does** mount `TestChromeHost`, which has provided a `status` slot since
 * Graphite M7, and its "shows the Project-finish read-out in the status bar" case asserts on
 * `Finish` — this component's own `Fact` label. So the bar was rendered, and read, by an existing
 * suite. The claim shipped in the milestone whose whole subject is claims nobody checked
 * (ADR-0076 Class 3), and it is corrected here rather than quietly replaced.
 *
 * **What was true, and is the reason this file exists:** that coverage is incidental and
 * single-branch. It renders the bar to find one label in one slot, and it says nothing about the
 * `pending` state, the singular/plural critical count, the withheld-count cases, "Not calculated",
 * or the recalculating cue — the branches below. A portalled component gets no coverage *by
 * association* worth the name, which is a narrower claim than the one it replaces and still worth
 * acting on.
 *
 * The bar has real branching: three facts with a pending state, a count with a
 * singular/plural/absent split, and a run state. Each is asserted below by what a reader sees,
 * because the bar's whole job is to be read.
 */
describe('PlanStatusBar', () => {
  const base = {
    activityCount: 12,
    criticalCount: 0,
    dataDate: '2026-03-02',
    projectFinish: '2026-09-30',
    scheduleState: { kind: 'current' } as ScheduleState,
    onRecalculate: () => {},
    pending: false,
  };

  it('states the three facts a planner looks at', () => {
    render(<PlanStatusBar {...base} />);
    expect(screen.getByText('Activities').parentElement).toHaveTextContent('12');
    expect(screen.getByText('Data date').parentElement).toHaveTextContent(/2026/);
    expect(screen.getByText('Finish').parentElement).toHaveTextContent(/2026/);
  });

  it('says a plan has never been calculated rather than printing a dash', () => {
    // A dash reads as a value the reader failed to parse; "Not calculated" is an absence with a
    // cause (ADR-0098's omit-never-zero rule applied to one field).
    render(<PlanStatusBar {...base} projectFinish={null} />);
    expect(screen.getByText('Not calculated')).toBeInTheDocument();
    expect(screen.queryByText('—')).not.toBeInTheDocument();
  });

  it('says a data date is not set rather than blanking', () => {
    render(<PlanStatusBar {...base} dataDate={null} />);
    expect(screen.getByText('Not set')).toBeInTheDocument();
  });

  it('distinguishes "not arrived" from "arrived and empty"', () => {
    // `pending` is the summary not having loaded. Zero activities is a real answer about a real
    // plan, and rendering the two identically would tell a planner their empty plan is still
    // loading — a state they would wait in forever.
    const { unmount } = render(<PlanStatusBar {...base} pending activityCount={undefined} />);
    expect(screen.getByText('Activities').parentElement).toHaveTextContent('…');
    unmount();

    render(<PlanStatusBar {...base} activityCount={0} />);
    expect(screen.getByText('Activities').parentElement).toHaveTextContent('0');
  });

  it('counts critical activities, and agrees with itself about one', () => {
    const { unmount } = render(<PlanStatusBar {...base} criticalCount={4} />);
    expect(screen.getByText('4 critical activities')).toBeInTheDocument();
    unmount();

    render(<PlanStatusBar {...base} criticalCount={1} />);
    expect(screen.getByText('1 critical activity')).toBeInTheDocument();
  });

  it('withholds the critical count when there is nothing critical, and when nothing is known', () => {
    // Two different reasons for the same absence, and both are correct: a plan with no critical
    // activities has nothing to say, and a plan whose summary has not arrived has nothing to say
    // YET. Rendering "0 critical activities" for either would be the zero ADR-0098 rejects.
    const { unmount } = render(<PlanStatusBar {...base} criticalCount={0} />);
    expect(screen.queryByText(/critical/)).not.toBeInTheDocument();
    unmount();

    render(<PlanStatusBar {...base} criticalCount={undefined} />);
    expect(screen.queryByText(/critical/)).not.toBeInTheDocument();
  });

  it('carries the running state in a word, not only in a spin', () => {
    // `prefers-reduced-motion` reduces the spin to 0.01ms, so a motion-only cue says nothing to the
    // reader most likely to be relying on it (the ADR-0031 `isBusy` rule).
    const { unmount } = render(
      <PlanStatusBar {...base} scheduleState={{ kind: 'recalculating' }} />,
    );
    expect(screen.getByText('Recalculating…')).toBeInTheDocument();
    unmount();

    render(<PlanStatusBar {...base} scheduleState={{ kind: 'current' }} />);
    expect(screen.queryByText('Recalculating…')).not.toBeInTheDocument();
  });

  describe('the schedule state, and Recalculate attached to it (M3-T5)', () => {
    it('publishes `pending`, and NOT `current`, before the summary arrives', () => {
      // **The second half is the assertion; the first is only how it is read.** With the summary
      // unresolved the derivation used to fall through to `current`, so the bar published "up to
      // date" while displaying `…` for every fact beside it — honest on screen, wrong on the
      // attribute a journey reads. `e2e-toolbar` read it in that window, pressed nothing, and
      // passed with an empty diagram: a green assertion proving the opposite of its name.
      const { container } = render(
        <PlanStatusBar {...base} pending scheduleState={{ kind: 'pending' }} />,
      );
      const bar = container.querySelector('[data-schedule-state]');
      expect(bar).toHaveAttribute('data-schedule-state', 'pending');
      expect(bar).not.toHaveAttribute('data-schedule-state', 'current');
      // Renders nothing, for a different reason from `current`: there is nothing yet to say.
      expect(screen.queryByRole('button', { name: 'Recalculate' })).not.toBeInTheDocument();
    });

    it('offers nothing at all when the schedule is current', () => {
      // The point of the milestone. Recalculate was on the toolbar at every moment of every
      // session, re-running a calculation auto-recalc had already run (ADR-0032 M3). A control
      // that can change nothing is worse than an absent one, and an affirmative "up to date" chip
      // would put the loudest thing on the bar in the commonest state.
      render(<PlanStatusBar {...base} scheduleState={{ kind: 'current' }} />);
      expect(screen.queryByRole('button', { name: 'Recalculate' })).not.toBeInTheDocument();
    });

    it('does not offer it mid-flight either — the answer is already on the wire', () => {
      render(<PlanStatusBar {...base} scheduleState={{ kind: 'recalculating' }} />);
      expect(screen.queryByRole('button', { name: 'Recalculate' })).not.toBeInTheDocument();
    });

    it('counts the outstanding edits, singular and plural', () => {
      const { unmount } = render(
        <PlanStatusBar
          {...base}
          scheduleState={{ kind: 'stale', edits: 1, failed: false, refusal: null }}
        />,
      );
      expect(screen.getByText('1 edit not calculated')).toBeInTheDocument();
      unmount();

      render(
        <PlanStatusBar
          {...base}
          scheduleState={{ kind: 'stale', edits: 7, failed: false, refusal: null }}
        />,
      );
      expect(screen.getByText('7 edits not calculated')).toBeInTheDocument();
    });

    it('says a failure happened, and still says how much is owed', () => {
      // Two facts, not one. "Nothing has been calculated" and "calculating it did not work" look
      // identical from the dates alone, and a reader acts on them differently.
      render(
        <PlanStatusBar
          {...base}
          scheduleState={{ kind: 'stale', edits: 3, failed: true, refusal: null }}
        />,
      );
      expect(screen.getByText('Could not calculate — 3 edits still pending')).toBeInTheDocument();
    });

    it('drops the count from a failure that owes nothing', () => {
      // A manual recalculation that fails on an unedited plan is a failure about the plan, not
      // about work the reader has done. "0 edits still pending" would blame them for it.
      render(
        <PlanStatusBar
          {...base}
          scheduleState={{ kind: 'stale', edits: 0, failed: true, refusal: null }}
        />,
      );
      expect(screen.getByText('Could not calculate the schedule')).toBeInTheDocument();
    });

    it('runs the recalculation when it is allowed', () => {
      const onRecalculate = vi.fn();
      render(
        <PlanStatusBar
          {...base}
          scheduleState={{ kind: 'stale', edits: 2, failed: false, refusal: null }}
          onRecalculate={onRecalculate}
        />,
      );
      fireEvent.click(screen.getByRole('button', { name: 'Recalculate' }));
      expect(onRecalculate).toHaveBeenCalledTimes(1);
    });

    it('shades the control with its reason rather than removing it (ADR-0082)', () => {
      // `aria-disabled`, not the native attribute: this control flips under a planner whenever a
      // peer takes the pen, and `disabled` would take the sentence explaining that out of the tab
      // order — unreachable by exactly the readers who need it. Verified by both halves: the
      // reason is linked AND the click does nothing.
      const onRecalculate = vi.fn();
      render(
        <PlanStatusBar
          {...base}
          scheduleState={{
            kind: 'stale',
            edits: 2,
            failed: false,
            refusal: 'Start editing to recalculate.',
          }}
          onRecalculate={onRecalculate}
        />,
      );
      // **A string, not a regex.** Testing Library matches a string name EXACTLY by default and a
      // regex loosely, and the first version of this case asked for `/Recalculate/` — so it passed
      // against a control announcing itself as "Recalculate Start editing to", which is what three
      // journeys found and this suite could not.
      const button = screen.getByRole('button', { name: 'Recalculate' });
      expect(button).toHaveAttribute('aria-disabled', 'true');
      expect(button).not.toBeDisabled();
      expect(button).toHaveAccessibleDescription('Start editing to recalculate.');
      fireEvent.click(button);
      expect(onRecalculate).not.toHaveBeenCalled();
    });
  });

  it('announces nothing', () => {
    // Deliberate, and load-bearing (`plan.md` §A14): `announcer.tsx` is ONE shared polite region
    // that clears-then-sets, so five facts wired to it means a recalculation — which changes
    // finish, critical count and run state together — drops at least one message with the reader
    // unable to tell which. A live region appearing here would be that race arriving quietly, so
    // it is pinned rather than left to a comment.
    const { container } = render(
      <PlanStatusBar {...base} scheduleState={{ kind: 'recalculating' }} criticalCount={3} />,
    );
    expect(container.querySelector('[aria-live]')).toBeNull();
    expect(container.querySelector('[role="status"], [role="alert"]')).toBeNull();
  });
});

/**
 * **The rule, tested apart from the thing that renders it.**
 *
 * This mapping lived as a `useMemo` inside `plan-workspace-toolbar.tsx`, whose own suite mounts the
 * workspace and reads the DOM — so it had no coverage of its own, and deleting the `pending` branch
 * left that suite green (12 passed) while breaking a journey. Verified: the branch was removed and
 * `plan-workspace-toolbar.test.tsx` did not notice.
 *
 * A rule that decides what a control publishes should be checkable without a browser or a mounted
 * workspace. These cases are what that buys.
 */
describe('deriveScheduleState', () => {
  const base = {
    isRecalculating: false,
    pendingEdits: 0,
    failed: false,
    activities: [{ earlyStart: '2026-03-02' }, { earlyStart: '2026-03-09' }],
    canRecalculate: true,
    refusalReason: null,
    hasDataDate: true,
  };

  it('says PENDING, not current, while the activities are unresolved', () => {
    // `undefined` is an absence of an answer, and this used to treat it as the answer "everything
    // is computed" — publishing `current` on the attribute a journey reads while displaying `…` for
    // every fact beside it.
    expect(deriveScheduleState({ ...base, activities: undefined })).toEqual({ kind: 'pending' });
  });

  it('still reports what THIS tab knows before they resolve', () => {
    // An outstanding edit and a failed run are facts the client owns; neither needs the server to
    // confirm them, so neither waits behind `pending`.
    expect(deriveScheduleState({ ...base, activities: undefined, pendingEdits: 2 })).toMatchObject({
      kind: 'stale',
      edits: 2,
    });
    expect(deriveScheduleState({ ...base, activities: undefined, failed: true })).toMatchObject({
      kind: 'stale',
      failed: true,
    });
  });

  it('lets a run in flight outrank everything', () => {
    expect(
      deriveScheduleState({ ...base, isRecalculating: true, pendingEdits: 5, failed: true }),
    ).toEqual({ kind: 'recalculating' });
  });

  it('calls a plan whose rows have no dates NEVER CALCULATED, not current', () => {
    // The case a client-side edit counter structurally cannot see: imported, seeded, or built in
    // somebody else's session.
    expect(
      deriveScheduleState({ ...base, activities: [{ earlyStart: null }, { earlyStart: null }] }),
    ).toMatchObject({ kind: 'stale', edits: 0, failed: false });
  });

  it('reads the ROWS, not a schedule summary — the summary goes stale on an edit', () => {
    // **The defect `e2e-toolbar` actually caught.** The first fix asked the summary for
    // `activityCount`, and that query is invalidated by a RECALCULATION rather than by an edit — so
    // on a plan whose summary was fetched while it was empty, adding two activities left the count
    // at 0 and the state at `current` while the diagram had no bars. Here the count is 2 and the
    // dates are absent, which is exactly the shape the summary could not report.
    expect(
      deriveScheduleState({
        ...base,
        activities: [{ earlyStart: null }, { earlyStart: null }],
        pendingEdits: 0,
      }),
    ).toMatchObject({ kind: 'stale' });
  });

  it('leaves an EMPTY plan alone', () => {
    // An empty plan has no dates either, and offering to calculate nothing is exactly the
    // do-nothing control this change removes.
    expect(deriveScheduleState({ ...base, activities: [] })).toEqual({ kind: 'current' });
  });

  it('carries the role/pen refusal ahead of the data-date one', () => {
    // Same order as `usePlanAutoRecalc`'s own `enabled` predicate, so the sentence cannot disagree
    // with the behaviour. Both missing ⇒ the pen's message, because taking the pen is the step the
    // reader takes first.
    expect(
      deriveScheduleState({
        ...base,
        pendingEdits: 1,
        canRecalculate: false,
        refusalReason: 'Start editing to recalculate.',
        hasDataDate: false,
      }),
    ).toMatchObject({ refusal: 'Start editing to recalculate.' });

    expect(deriveScheduleState({ ...base, pendingEdits: 1, hasDataDate: false })).toMatchObject({
      refusal: 'Set a data date before the schedule can be calculated.',
    });
  });

  it('never leaves a refusal empty when it cannot recalculate', () => {
    // `scheduleRefusal` returns null when the role and pen both permit it, so a caller that says
    // "cannot" with no reason is a shaded control with nothing to explain it — the dead end
    // ADR-0082 exists to prevent.
    expect(
      deriveScheduleState({ ...base, pendingEdits: 1, canRecalculate: false, refusalReason: null }),
    ).toMatchObject({ refusal: 'The schedule cannot be recalculated.' });
  });
});

/**
 * **The facts' two lines are explicit pairs, and enclose nothing else** (workspace visual polish,
 * 2026-08-28 — superseding the foot-row-and-deck M4 wrap bound this suite used to pin).
 *
 * The history it replaces is kept because it decided the shape: M4 wrapped the facts inside a
 * `max-w-64` bound, and the first version put that bound on the whole facts ROW — which also
 * carries `ScheduleStateRegion` and `PenStatusOutlet`. Every measurement behind it ran after a
 * recalculation, the one state where the schedule region renders nothing; injecting the real stale
 * sentence took the facts to three lines and the row from **41 px to 53 px at every width**. The
 * polish pass replaced the bound with two EXPLICIT rows (Data date + Finish, then Activities + the
 * critical count — a product-owner steer), so which facts share a line is structure rather than
 * the luck of label widths, and there is no `max-w-*` left to mis-scope.
 *
 * What this suite pins is the property that survives both mechanisms: the facts' column contains
 * the four facts in their decided pairs and does NOT contain the schedule state or its remedy —
 * so a stale sentence extends the row sideways rather than becoming a third facts line. The
 * layout half (32 px under the 40 px floor) is jsdom-invisible and re-measured in the browser
 * (the spec's DoD).
 *
 * **Verified red** against the pre-polish flat FactList: `pairRows` finds no two-row column.
 */
describe('the facts pairs', () => {
  // Its own fixture: `base` above is scoped to the `PlanStatusBar` describe, and reaching for it
  // from here is what the first version of this suite did — it failed on `base is not defined`
  // rather than on anything about the bound.
  const base = {
    activityCount: 12,
    criticalCount: 3,
    dataDate: '2026-03-02',
    projectFinish: '2026-09-30',
    scheduleState: { kind: 'current' } as ScheduleState,
    onRecalculate: () => {},
    pending: false,
  };

  /** The facts column: the `flex-col` holding exactly two row divs. */
  const pairRows = (): [HTMLElement, HTMLElement] => {
    const row = document.querySelector('[data-schedule-state]');
    if (!row) throw new Error('facts row not found');
    const col = [...row.querySelectorAll('div')].find((c) =>
      /(?:^|\s)flex-col(?:\s|$)/.test(c.className),
    );
    if (!col) throw new Error('no facts column inside the facts row');
    const rows = [...col.children].filter((c): c is HTMLElement => c instanceof HTMLElement);
    if (rows.length !== 2) throw new Error(`expected two fact rows, found ${String(rows.length)}`);
    return [rows[0] as HTMLElement, rows[1] as HTMLElement];
  };

  it('pairs the dates on top and the population below', () => {
    render(<PlanStatusBar {...base} />);
    const [dates, population] = pairRows();
    // The pairing is the product owner's decision, not a wrap artefact — assert both directions
    // for both rows, so a fact migrating between lines fails rather than reflowing quietly.
    expect(dates.textContent ?? '').toContain('Data date');
    expect(dates.textContent ?? '').toContain('Finish');
    expect(dates.textContent ?? '').not.toContain('Activities');
    expect(population.textContent ?? '').toContain('Activities');
    expect(population.textContent ?? '').toContain('3 critical activities');
    expect(population.textContent ?? '').not.toContain('Finish');
  });

  it('does not enclose the schedule state or the pen sentence', () => {
    render(
      <PlanStatusBar
        {...base}
        scheduleState={{ kind: 'stale', edits: 3, failed: true, refusal: null }}
      />,
    );
    const [dates, population] = pairRows();
    // The stale sentence and its remedy sit outside the pairs, so they extend the row sideways
    // rather than becoming a third facts line and growing the row's height.
    for (const box of [dates, population]) {
      expect(box.textContent ?? '').not.toContain('Could not calculate');
      expect(within(box).queryByRole('button', { name: /Recalculate/i })).toBeNull();
    }
  });
});
