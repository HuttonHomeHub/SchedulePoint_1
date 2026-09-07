import type { UseQueryResult } from '@tanstack/react-query';

import type { ProbeResultRow } from '../api/probe-results';

import { Alert } from '@/components/ui/alert';
import { DataTable, type Column } from '@/components/ui/data-table';

/**
 * Every reading taken on this installation, newest first.
 *
 * **Reading it is an audited act**, like every other panel on this console — so it is fetched once
 * on load and neither polled nor refetched on window focus. That is the cost of the history being
 * on a route of its own rather than folded into `/staff/health` the way retention was: one extra
 * `staff.panel_read` row per page load. It is paid knowingly, because a limit and a page of rows
 * are a different resource from a health summary and folding them together would make one response
 * answer two unrelated questions.
 *
 * **There is exactly one empty state and it says so.** No filters exist here, so "nothing recorded
 * yet" cannot be confused with "nothing matched what you asked for" — the distinction ADR-0073 C1's
 * accessibility finding was about, where a live region said "Showing 0 events" for both.
 *
 * The empty state carries **no bold lead-in**, and neither does the panel's "not recorded" alert.
 * `Alert` already has a tone colour, a coloured accent bar, a leading icon and a live-region role;
 * a bold sentence inside it is a fifth channel saying what four already say. The ADR-0097 weight
 * ratchet caught both — the sibling comment in `performance-probe-panel.tsx` had said so since M3,
 * and these two were written without it.
 */
export function ProbeHistory({
  query,
}: {
  query: UseQueryResult<ProbeResultRow[]>;
}): React.ReactElement {
  return (
    <DataTable
      caption="Readings recorded on this installation, newest first"
      columns={COLUMNS}
      query={query}
      getRowKey={(row) => row.id}
      loadingLabel="Loading recorded readings…"
      errorLabel="Could not read the recorded readings."
      empty={
        <Alert tone="info">
          No readings recorded yet. Run a measurement above and it will be stored here, with the
          machine it ran on and the app version that drew the frames.
        </Alert>
      }
    />
  );
}

/**
 * What a reader needs to tell two readings apart, and nothing they would have to interpret.
 *
 * No verdict column: the server stores samples and thresholds and does not judge, so a verdict here
 * would be this component deriving one — a second copy of a rule that already has one home. The
 * columns are the facts that make two rows comparable or not: WHEN, on WHAT, at what SCALE, and by
 * which app version.
 */
const COLUMNS: Column<ProbeResultRow>[] = [
  {
    header: 'Taken',
    cell: (row) => new Date(row.recordedAt).toLocaleString(),
  },
  { header: 'Measurement', cell: (row) => row.scenarioId },
  { header: 'Scale', cell: (row) => row.limbId },
  { header: 'Framing', cell: (row) => row.preset },
  {
    header: 'On screen',
    // Both halves, always: a numerator alone cannot distinguish "few bars drawn" from "few bars to
    // draw", which is the ADR-0066 cull defect that once made 4.6 ms look like the budget being met.
    cell: (row) => `${String(visibleBars(row))} of ${String(row.activityCount)}`,
  },
  {
    header: 'Machine',
    // The operator's own note first, then the adapter, then nothing — and "(not recorded)" rather
    // than a blank, because an absent GPU string is a fact (masked or unavailable) and a blank cell
    // reads as an oversight.
    cell: (row) => row.machineLabel ?? row.gpuRenderer ?? '(not recorded)',
  },
  { header: 'App', cell: (row) => row.appVersion },
  { header: 'By', cell: (row) => row.recordedByLabel ?? '(scrubbed)' },
];

/** The painter's own answer, from `counts`. Unknown is stated, never rendered as zero. */
function visibleBars(row: ProbeResultRow): number | string {
  const value = row.counts.visibleBars;
  return typeof value === 'number' ? value : '?';
}
