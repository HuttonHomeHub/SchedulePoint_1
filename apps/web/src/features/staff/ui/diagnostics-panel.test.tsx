import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { StaffDiagnostics } from '../api/staff-diagnostics';

import { DiagnosticsPanel } from './diagnostics-panel';

/**
 * The panel's four states, and the two rules about the Copy control.
 *
 * **The query is mocked, so nothing here says anything about the SQL, the counts or the audit row.**
 * That is `apps/api/test/staff-diagnostics.e2e-spec.ts`, which drives the real route against a real
 * database — the split ADR-0086's M2 paid for, when 1,589 unit tests said a route worked and it
 * could not complete a request. What these cover is the seam a server test cannot reach: that each
 * outcome the hook can produce reaches the screen as the right kind of statement.
 */
const refetch = vi.fn();
const queryState: {
  data: StaffDiagnostics | undefined;
  isFetching: boolean;
  isError: boolean;
} = { data: undefined, isFetching: false, isError: false };

vi.mock('../api/staff-diagnostics', () => ({
  useStaffDiagnostics: () => ({ ...queryState, refetch }),
}));

const result: StaffDiagnostics = {
  takenAt: '2026-09-13T14:02:11.482Z',
  apiVersion: '0.63.0',
  diagnostics: [
    {
      id: 'day-factor-divergence',
      label: 'Day factor divergence (driving resource)',
      nature: 'retrospective',
      examined: 1284,
      affected: 17,
      affectedPlans: 3,
      affectedOrganizations: 1,
      elapsedMs: 214,
    },
  ],
};

beforeEach(() => {
  refetch.mockReset();
  queryState.data = undefined;
  queryState.isFetching = false;
  queryState.isError = false;
});

describe('DiagnosticsPanel', () => {
  it('names its entry point and runs nothing until it is pressed', () => {
    render(<DiagnosticsPanel />);

    // ADR-0081: the milestone's capability has a route to it, and this is the assertion that says
    // so. `enabled: false` on the hook is what makes the second half true, and the spy is what
    // proves it about the code that runs rather than about the code as read.
    expect(screen.getByRole('button', { name: 'Run diagnostics' })).toBeInTheDocument();
    expect(refetch).not.toHaveBeenCalled();
  });

  it('says what it will and will not return before anything is run', () => {
    render(<DiagnosticsPanel />);

    // The idle state is an explanation, not a blank card. A reader deciding whether to press a
    // button that reads customer tables is owed the scope of what comes back.
    // Matched with a normaliser rather than a regex over `textContent`: the copy emphasises the
    // word "only" with a `<strong>`, so the sentence is split across three nodes and a plain text
    // query finds none of them — which reads as missing copy rather than as a query that cannot
    // see it.
    const explanation = screen
      .getAllByText(/Counts how many rows/)
      .map((node) => node.textContent ?? '')
      .join(' ');

    expect(explanation).toMatch(/returns only counts/i);
    expect(explanation).toMatch(/no plan, client, project or activity is named/i);
    expect(explanation).toMatch(/no parameters at all/i);
  });

  it('fires the read on the press', () => {
    render(<DiagnosticsPanel />);

    fireEvent.click(screen.getByRole('button', { name: 'Run diagnostics' }));

    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('marks itself busy while running, and shows no number', () => {
    queryState.isFetching = true;
    queryState.data = result;
    render(<DiagnosticsPanel />);

    expect(screen.getByRole('button', { name: 'Running…' })).toHaveAttribute('aria-busy', 'true');
    // A previous reading rendered under a spinner is indistinguishable from a fresh one.
    expect(screen.queryByText(/17 of 1284/)).not.toBeInTheDocument();
  });

  it('renders the count beside its denominator', () => {
    queryState.data = result;
    render(<DiagnosticsPanel />);

    expect(screen.getByText('17 of 1284 activities, across 3 plans in 1 organisation.'));
    expect(screen.getByText(/API 0\.63\.0/)).toBeInTheDocument();
  });

  it('distinguishes an empty population from an unaffected one', () => {
    queryState.data = {
      ...result,
      diagnostics: [
        { ...result.diagnostics[0]!, examined: 0, affected: 0, affectedPlans: 0 },
        {
          ...result.diagnostics[0]!,
          id: 'inherited-day-factor',
          label: 'Inherited',
          affected: 0,
          affectedPlans: 0,
        },
      ],
    };
    render(<DiagnosticsPanel />);

    expect(screen.getByText(/No work of this shape exists/)).toBeInTheDocument();
    expect(
      screen.getByText(/None of the 1284 activities examined is affected/),
    ).toBeInTheDocument();
  });

  it('reports a failure as an event and renders NO number beside it', () => {
    queryState.isError = true;
    render(<DiagnosticsPanel />);

    // ADR-0132: a failure is a thing that just happened, so `purpose="event"` gives it a live role.
    expect(screen.getByRole('alert')).toHaveTextContent(/did not complete/);
    expect(screen.queryByText(/examined/)).not.toBeInTheDocument();
  });

  /**
   * **The M4 gate pass's largest finding, reached independently by three reviewers.**
   *
   * `@tanstack/query-core`'s error reducer spreads the prior state and never clears `data`, so a
   * failed re-run leaves the previous reading in `query.data` while `isError` is true. The panel's
   * own docblock promised no number would render beside a failure; the code did not enforce it.
   * Verified red against the pre-fix component, which rendered both blocks at once.
   */
  it('renders NO stale number when a re-run fails after a success', () => {
    queryState.data = result;
    queryState.isError = true;
    render(<DiagnosticsPanel />);

    expect(screen.getByRole('alert')).toHaveTextContent(/did not complete/);
    // The screen must not say "there is no number to show" above a block of numbers.
    expect(screen.queryByText(/17 of 1284/)).not.toBeInTheDocument();
    expect(document.querySelector('[data-diagnostics-result]')).toBeNull();
  });

  it('refuses to copy a superseded reading while a re-run is in flight', () => {
    // The same staleness one control along, and the more damaging half: the visible block is
    // hidden while running, but Copy closed over the PREVIOUS `result` — so an operator could
    // paste a superseded reading into a measurement record believing it current.
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    queryState.data = result;
    queryState.isFetching = true;
    render(<DiagnosticsPanel />);

    const copy = screen.getByRole('button', { name: 'Copy for the record' });
    expect(copy).toHaveAttribute('aria-disabled', 'true');
    expect(copy).toHaveAccessibleDescription(/Wait for this run to finish/);

    fireEvent.click(copy);
    expect(writeText).not.toHaveBeenCalled();
  });

  it('says so when the clipboard refuses, rather than saying nothing at all', async () => {
    // WCAG 4.1.3. The rejection branch used to set `copied` false, which is indistinguishable from
    // never having pressed the button: no visible change, nothing in the live region, nothing
    // announced — on a browser that refuses clipboard access, which is an ordinary configuration.
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    Object.assign(navigator, { clipboard: { writeText } });
    queryState.data = result;
    render(<DiagnosticsPanel />);

    fireEvent.click(screen.getByRole('button', { name: 'Copy for the record' }));

    expect(await screen.findByText(/Could not reach the clipboard/)).toBeInTheDocument();
  });

  it('says what a non-zero count means, beside the count', () => {
    queryState.data = result;
    render(<DiagnosticsPanel />);

    // Without this, "17 of 1284" reads as "17 activities are broken right now" to anybody who has
    // not read ADR-0139 — which is nearly everybody who will read the pasted block.
    expect(screen.getByText(/Retrospective: this sizes work whose stored/)).toBeInTheDocument();
  });

  it('agrees in number in the breakdown line, not only in the sentence', () => {
    queryState.data = {
      ...result,
      diagnostics: [{ ...result.diagnostics[0]!, affectedPlans: 1, affectedOrganizations: 1 }],
    };
    render(<DiagnosticsPanel />);

    expect(screen.getByText(/1 plan · 1 organisation/)).toBeInTheDocument();
    expect(screen.queryByText(/1 organisations/)).not.toBeInTheDocument();
  });

  it('shades the Run control while it is running, and refuses a second press', () => {
    queryState.isFetching = true;
    render(<DiagnosticsPanel />);

    const run = screen.getByRole('button', { name: 'Running…' });
    expect(run).toHaveAttribute('aria-disabled', 'true');

    fireEvent.click(run);
    expect(refetch).not.toHaveBeenCalled();
  });

  it('shades the copy control with a reason instead of hiding it', () => {
    render(<DiagnosticsPanel />);

    // ADR-0082: shade with a reason when the action is shut by a state the reader can change.
    const copy = screen.getByRole('button', { name: 'Copy for the record' });
    expect(copy).toHaveAttribute('aria-disabled', 'true');
    expect(copy).toHaveAccessibleDescription(/Run the diagnostics first/);
  });

  it('refuses to copy while shaded, rather than shading in appearance only', () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<DiagnosticsPanel />);

    fireEvent.click(screen.getByRole('button', { name: 'Copy for the record' }));

    expect(writeText).not.toHaveBeenCalled();
  });

  it('copies the paste-ready block once there is one', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    queryState.data = result;
    render(<DiagnosticsPanel />);

    fireEvent.click(screen.getByRole('button', { name: 'Copy for the record' }));

    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText.mock.calls[0]![0]).toContain('SchedulePoint staff diagnostics');
    expect(await screen.findByText('Report copied.')).toBeInTheDocument();
  });

  it('keeps focus on the pressed button THROUGH the relabel, not merely across a no-op', () => {
    queryState.data = result;
    const { rerender } = render(<DiagnosticsPanel />);
    const run = screen.getByRole('button', { name: 'Run diagnostics' });
    run.focus();

    fireEvent.click(run);
    // **The transition has to be forced, and the first version of this test did not force it.**
    // `refetch` is a bare spy: it never flips `isFetching`, so the button never relabelled and the
    // assertion held because nothing happened. It would have passed identically against a future
    // refactor that unmounted and remounted the button on `isFetching` — which is exactly the
    // defect class it names. Found by the M4 test review.
    queryState.isFetching = true;
    rerender(<DiagnosticsPanel />);

    // The same DOM node, relabelled — not a new one — so focus never had anywhere to fall.
    const running = screen.getByRole('button', { name: 'Running…' });
    expect(running).toBe(run);
    expect(document.activeElement).toBe(run);

    // **What it discriminates, measured rather than claimed.** Red against a `key` that varies with
    // the state (`key={running ? 'busy' : 'idle'}`), which is the realistic way somebody
    // reintroduces a remount. Green against splitting the button into a ternary of two `<Button>`s
    // — because React reconciles the same element type in the same position to the same DOM node,
    // so that refactor is not the defect it looks like. Worth stating: the guard here is React's
    // reconciliation, and this test watches for the things that defeat it.
  });
});
