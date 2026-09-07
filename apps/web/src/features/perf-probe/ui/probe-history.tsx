import type { UseQueryResult } from '@tanstack/react-query';

import type { ProbeResultRow } from '../api/probe-results';
import { judgeStoredRow } from '../model/judge-stored';
import { SCENARIOS } from '../model/scenarios';

import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
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
 * What a reader needs to tell two readings apart, and what each one said.
 *
 * **The verdict is derived here, on read, by the shared judge** — see `judgeStoredRow`. It is not
 * stored, and that is ADR-0128 D5 working rather than a gap: a row keeps the thresholds it was
 * measured against, so it stays readable against the bar it was actually taken under rather than
 * whatever the bar became. This column was missing until the M5 ux review; without it a reader
 * comparing two releases had to paste raw JSON into a spreadsheet and re-derive the rule by hand,
 * which defeats the reason for persisting anything.
 *
 * Ids are shown as the labels the picker uses. `scenarioId` and `limbId` are internal slugs, and an
 * id this bundle does not recognise falls back to the raw value — which is the honest rendering of
 * a reading taken by a newer web release than the one reading it.
 */
const COLUMNS: Column<ProbeResultRow>[] = [
  {
    header: 'Taken',
    cell: (row) => new Date(row.recordedAt).toLocaleString(),
  },
  { header: 'Measurement', cell: (row) => scenarioLabel(row.scenarioId) },
  { header: 'Scale', cell: (row) => limbLabel(row.scenarioId, row.limbId) },
  { header: 'Framing', cell: (row) => (row.preset === 'fit' ? 'Whole plan' : 'Week') },
  { header: 'Verdict', cell: (row) => <VerdictCell row={row} /> },
  {
    header: 'On screen',
    // Both halves, always: a numerator alone cannot distinguish "few bars drawn" from "few bars to
    // draw", which is the ADR-0066 cull defect that once made 4.6 ms look like the budget being met.
    cell: (row) => `${String(visibleBars(row))} of ${String(row.activityCount)}`,
  },
  {
    header: 'Machine',
    // The operator's own note first, then the adapter. "(masked)" and "(not recorded)" are kept
    // apart, because a browser withholding the renderer string is a different fact from nobody
    // typing a note — the D6 distinction the live report already makes.
    cell: (row) => row.machineLabel ?? row.gpuRenderer ?? '(masked or not recorded)',
  },
  {
    header: 'Versions',
    // Both, because comparability is a claim about the pair. The web bundle drew the frames; the
    // API release stored them, and a reading taken across a deploy is one a reader should be able
    // to spot.
    cell: (row) => `web ${row.appVersion} · api ${row.apiVersion}`,
  },
  { header: 'By', cell: (row) => row.recordedByLabel ?? '(scrubbed)' },
];

/** The verdict, glossed where a bare word would mislead. */
function VerdictCell({ row }: { row: ProbeResultRow }): React.ReactElement {
  const judged = judgeStoredRow(row);
  if (judged === null) {
    return <span className="text-muted-foreground">Not readable by this version</span>;
  }
  // A `Badge`, not a hand-weighted span: a verdict is a status, the primitive already carries the
  // weight, and the ADR-0097 ratchet counts weights placed OUTSIDE the primitives for exactly this
  // reason. `critical` only for a genuine FAIL — an INDETERMINATE or an ungraded reading is not bad
  // news, and colouring it as though it were would be the confident wrong answer this epic refuses.
  return (
    <span>
      <Badge variant={judged.verdict === 'FAIL' ? 'critical' : 'neutral'}>{judged.label}</Badge>
      {judged.note !== null && (
        <span className="text-muted-foreground mt-1 block text-xs">{judged.note}</span>
      )}
    </span>
  );
}

function scenarioLabel(scenarioId: string): string {
  return SCENARIOS.find((s) => s.id === scenarioId)?.label ?? scenarioId;
}

function limbLabel(scenarioId: string, limbId: string): string {
  const limb = SCENARIOS.find((s) => s.id === scenarioId)?.limbs.find((l) => l.id === limbId);
  return limb === undefined ? limbId : `${String(limb.activities)} activities`;
}

/** The painter's own answer, from `counts`. Unknown is stated, never rendered as zero. */
function visibleBars(row: ProbeResultRow): number | string {
  const value = row.counts.visibleBars;
  return typeof value === 'number' ? value : '?';
}
