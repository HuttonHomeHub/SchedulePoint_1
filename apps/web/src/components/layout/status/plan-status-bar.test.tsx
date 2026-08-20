import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { PlanStatusBar } from './plan-status-bar';

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
    recalculating: false,
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
    const { unmount } = render(<PlanStatusBar {...base} recalculating />);
    expect(screen.getByText('Recalculating…')).toBeInTheDocument();
    unmount();

    render(<PlanStatusBar {...base} recalculating={false} />);
    expect(screen.queryByText('Recalculating…')).not.toBeInTheDocument();
  });

  it('announces nothing', () => {
    // Deliberate, and load-bearing (`plan.md` §A14): `announcer.tsx` is ONE shared polite region
    // that clears-then-sets, so five facts wired to it means a recalculation — which changes
    // finish, critical count and run state together — drops at least one message with the reader
    // unable to tell which. A live region appearing here would be that race arriving quietly, so
    // it is pinned rather than left to a comment.
    const { container } = render(<PlanStatusBar {...base} recalculating criticalCount={3} />);
    expect(container.querySelector('[aria-live]')).toBeNull();
    expect(container.querySelector('[role="status"], [role="alert"]')).toBeNull();
  });
});
