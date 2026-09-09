import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { ProbeResultRow } from '../api/probe-results';

import { ProbeSittings } from './probe-sittings';

/**
 * The sittings view, which replaces a flat twelve-column table of rows.
 *
 * **What these cases are about is the grouping, not the columns.** The predecessor's suite proved
 * that each stored fact reached a cell; those facts still reach the screen and are asserted here
 * where they now live. What is new — and what could not exist before, because
 * `probe-history.tsx:197` called `sittingsFromRows([row])` one row at a time — is that a sitting
 * holds several readings, states what they share exactly once, and says so when they do not share
 * it.
 */

const row = (over: Partial<ProbeResultRow> = {}): ProbeResultRow => ({
  id: 'r1',
  runId: 'run-1',
  sweepId: null,
  framesPerPhase: 180,
  recordedAt: '2026-09-08T18:00:00.000Z',
  recordedByLabel: 'owner',
  scenarioId: 'canvas-draw',
  scenarioVersion: 1,
  limbId: 'scale-2000',
  limbKind: 'absolute',
  preset: 'week',
  pxPerDay: 12,
  activityCount: 2000,
  edgeCount: 3200,
  sceneSummary: '2160 bars',
  samples: [{ droppedPct: 0.2, intervalP50: 16.7, intervalP95: 17.2, fps: 59.8 }],
  counts: { visibleBars: 243 },
  thresholds: { minFps: 30, minVisibleBars: 100, gated: true, source: 'ADR-0026 §9' },
  viewportWidth: 1912,
  viewportHeight: 1068,
  devicePixelRatio: 1,
  idleIntervalMs: 16.7,
  hardwareConcurrency: 8,
  deviceMemoryGb: 8,
  gpuRenderer: 'Intel Arc Pro',
  userAgent: 'test',
  reducedMotion: false,
  lostFocusDuringRun: false,
  machineLabel: null,
  appVersion: '0.125.0',
  apiVersion: '0.61.0',
  ...over,
});

const view = (rows: ProbeResultRow[]): ReturnType<typeof render> =>
  render(
    <ProbeSittings
      query={
        {
          isPending: false,
          isError: false,
          data: rows,
          refetch: () => undefined,
        } as never
      }
    />,
  );

/** A complete sweep: two scenarios at two framings, four readings under one id. */
const sweepRows = (): ProbeResultRow[] => [
  row({ id: 'a', runId: 'r1', sweepId: 's1', scenarioId: 'canvas-draw', preset: 'week' }),
  row({ id: 'b', runId: 'r2', sweepId: 's1', scenarioId: 'canvas-draw', preset: 'fit' }),
  row({ id: 'c', runId: 'r3', sweepId: 's1', scenarioId: 'revision-diff', preset: 'week' }),
  row({ id: 'd', runId: 'r4', sweepId: 's1', scenarioId: 'revision-diff', preset: 'fit' }),
];

describe('ProbeSittings', () => {
  it('renders one block per sitting, and a single press in the same shape as a sweep', () => {
    view([...sweepRows(), row({ id: 'e', runId: 'r9', sweepId: null })]);

    // Two tables, not five rows in one — and the captions name the ACT rather than the data.
    expect(screen.getByRole('table', { name: /Sweep of 4 readings/ })).toBeInTheDocument();
    expect(screen.getByRole('table', { name: /One reading/ })).toBeInTheDocument();
  });

  it('states what the readings share exactly once, not on every row', () => {
    view(sweepRows());

    // The whole argument for the block: the flat table repeated these on each of a sweep's rows.
    expect(screen.getAllByText('web 0.125.0 · api 0.61.0')).toHaveLength(1);
    expect(screen.getAllByText('owner')).toHaveLength(1);
    expect(screen.getAllByText('1912×1068 @1x')).toHaveLength(1);
  });

  it('refuses to state one canvas when the sitting holds two, and says so', () => {
    // Reachable through M6-T4: a re-run under the same `sweep_id` can happen after a resize.
    // #261 records that confound deciding a verdict, so one figure over two readings would settle
    // it by accident in the one field a reader consults to decide comparability.
    view([
      row({ id: 'a', runId: 'r1', sweepId: 's1' }),
      row({ id: 'b', runId: 'r2', sweepId: 's1', viewportWidth: 1016, viewportHeight: 636 }),
    ]);

    expect(screen.getByText('varies between readings')).toBeInTheDocument();
    expect(screen.queryByText('1912×1068 @1x')).not.toBeInTheDocument();
  });

  it('says a sweep is incomplete rather than letting a short table imply it is whole', () => {
    // Nothing is stored for a refused reading, so a sweep whose two middle steps were refused is
    // indistinguishable in the database from a sweep of two. The count is the only thing that can
    // say so — and a reader who is not told takes an incomplete sitting for a complete one.
    // Two rows, both `canvas-draw`, at two framings — so TWO readings of the four, not two of two.
    // The first draft of this case asserted "1 of 4" and the test corrected the arithmetic: a
    // reading is a scenario at a framing, and `canvas-draw` contributes two of a sweep's four.
    view(sweepRows().slice(0, 2));

    // Matched on the alert's whole text rather than by `getByText`: the sentence is assembled from
    // interpolated counts, so it is split across elements and a regex over one of them finds none.
    const alert = screen.getByRole('status');
    expect(alert.textContent).toContain('This sitting has 2 of 4 readings');
    expect(alert.textContent).toContain('2 were refused or never taken');
  });

  it('does not call a complete sweep partial', () => {
    view(sweepRows());
    expect(screen.queryByText(/refused or never taken/)).not.toBeInTheDocument();
  });

  it('names a one-repeat reading a check rather than leaving its missing verdict to be inferred', () => {
    view([
      row({ samples: [{ droppedPct: 0.2, intervalP50: 16.7, intervalP95: 17.2, fps: 59.8 }] }),
    ]);

    expect(screen.getByText('Check, not a measurement')).toBeInTheDocument();
  });

  it('flags the reading that lost focus, not merely the sitting', () => {
    view([
      row({ id: 'a', runId: 'r1', sweepId: 's1', lostFocusDuringRun: false }),
      row({ id: 'b', runId: 'r2', sweepId: 's1', lostFocusDuringRun: true }),
    ]);

    // The sitting says one of them did; the table says which. Either alone leaves a reader unable
    // to act on it.
    expect(screen.getByText(/a reading lost focus/)).toBeInTheDocument();
    expect(screen.getByText('Lost focus')).toBeInTheDocument();
  });

  it('copies the whole sitting, not the row that was clicked', () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.assign(navigator, { clipboard: { writeText } });
    view(sweepRows());

    fireEvent.click(screen.getByRole('button', { name: 'Copy report' }));

    // One control per sitting, and the block it writes carries every reading — a block for one
    // limb of a four-reading sweep would be a partial answer that looks complete.
    expect(writeText).toHaveBeenCalledTimes(1);
    const block = writeText.mock.calls[0]?.[0] as unknown as string;
    expect(block).toContain('Canvas draw budget');
    expect(block).toContain('Revision compare overlay');
  });

  it('keeps exactly one empty state, because there are no filters to confuse it with', () => {
    view([]);

    // ADR-0073 C1: with no filters, "nothing recorded yet" cannot be mistaken for "nothing matched
    // what you asked for". Adding a filter means adding that distinction first.
    expect(screen.getByText(/No readings recorded yet/)).toBeInTheDocument();
  });

  it('links the comparability caveat to the table rather than merely placing it above', () => {
    view(sweepRows());

    // A `DataTable` is a focusable region, so a landmark-navigating reader lands INSIDE it having
    // skipped whatever sits above.
    const table = screen.getByRole('table', { name: /Sweep of 4 readings/ });
    const region = table.closest('[role="region"]');
    expect(region?.getAttribute('aria-describedby')).toContain('comparability');
  });

  it('shows a stored reading with its verdict and both halves of the cull', () => {
    view([row()]);

    const table = within(screen.getByRole('table', { name: /One reading/ }));
    expect(table.getByText('PASS')).toBeInTheDocument();
    expect(table.getByText('Canvas draw budget')).toBeInTheDocument();
    expect(table.getByText('2000 activities')).toBeInTheDocument();
    // A numerator alone cannot distinguish "few bars drawn" from "few bars to draw".
    expect(table.getByText('243 at 12.00 px/day')).toBeInTheDocument();
  });

  it('says a row is unreadable rather than dressing it as a failure', () => {
    view([row({ thresholds: {}, samples: [] })]);

    expect(screen.getByText('Not readable by this version')).toBeInTheDocument();
    expect(screen.queryByText('FAIL')).not.toBeInTheDocument();
  });
});
