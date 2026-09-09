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
const COMPARABILITY_ID = 'probe-history-comparability';

export function ProbeHistory({
  query,
}: {
  query: UseQueryResult<ProbeResultRow[]>;
}): React.ReactElement {
  return (
    <>
      {/*
        **The caveat is LINKED to the table, not merely placed above it.** `DataTable` is a focusable
        `role="region"`, so a reader navigating by landmark lands INSIDE it having skipped whatever
        sits above — the `my-activity.tsx` precedent, cited at `routes/staff.tsx:282-283`, and the
        same finding ADR-0073 C2.5's accessibility gate made about a safety note reachable only by
        reading serially.

        `docs/specs/staff-performance-probe/feature-spec.md:262` specified this sentence and it was
        never built. It says what the Canvas column is FOR: without it that column is a number whose
        significance a reader has to already know.
      */}
      <p id={COMPARABILITY_ID} className="text-muted-foreground mb-3 text-sm">
        A reading is only comparable to another taken at the same canvas size. The painter costs
        roughly 4.3&nbsp;ms per megapixel, which is enough to decide a verdict: the same plan on the
        same machine measured 23.3&nbsp;fps at 1912×1068 and 39.5&nbsp;fps at 1016×636 minutes
        apart. Compare rows whose Canvas figures match, and read the Display and Attention columns
        before explaining an outlier.
      </p>
      <DataTable
        caption="Readings recorded on this installation, newest first"
        columns={COLUMNS}
        query={query}
        getRowKey={(row) => row.id}
        describedById={COMPARABILITY_ID}
        loadingLabel="Loading recorded readings…"
        errorLabel="Could not read the recorded readings."
        empty={
          <Alert tone="info">
            No readings recorded yet. Run a measurement above and it will be stored here, with the
            machine it ran on and the app version that drew the frames.
          </Alert>
        }
      />
    </>
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
    header: 'Canvas',
    // **The single most decision-relevant confound in the register, stored on every row since this
    // table shipped and rendered on none.** `docs/specs/staff-performance-probe/feature-spec.md`
    // :206-208 named the viewport and the display refresh as things a history row must carry; the
    // verdict half of that criterion was found missing at that epic's M5 gate pass and fixed, and
    // these two were not.
    //
    // It stopped being cosmetic on 2026-09-08: `docs/TECH_DEBT.md` #261 records the same plan, the
    // same machine, the same browser and the same painter measuring **23.3 fps at 1912x1068 and
    // 39.5 fps at 1016x636** — a fail and a pass against the same floor, minutes apart. At ~4.26 ms
    // per megapixel (#75 item f) this is not a rounding term, and two rows without it are not
    // comparable however carefully somebody reads them.
    //
    // The DPR rides with the CSS size rather than in a column of its own, because the pair is one
    // fact: 1646x1080 at dpr 2 pushes four times the pixels of the same box at dpr 1.
    cell: (row) =>
      `${String(row.viewportWidth)}x${String(row.viewportHeight)} @${String(row.devicePixelRatio)}x`,
  },
  {
    header: 'Display',
    // The measured idle frame interval, which is what every dropped-frame figure on the row is a
    // share OF. `run-probe.ts` measures it rather than assuming 16.7 — the file's own docblock
    // records a first version that passed a literal `16.7` where this belonged and would have
    // scored a 120 Hz machine as dropping half its frames. A reader comparing two rows needs to
    // know which of them was taken on such a machine.
    cell: (row) => `${row.idleIntervalMs.toFixed(1)} ms`,
  },
  {
    header: 'Attention',
    // **A blur is recorded, not refused**, and the distinction is the reason this column exists.
    // `document.hidden` is a refusal, because a backgrounded tab is throttled to roughly 1 Hz and
    // measures the throttle; a blur leaves the window painting at full rate while something else
    // holds the keyboard and possibly some of the GPU. That is the one fact that explains an
    // otherwise inexplicable outlier — and it was going onto every row and being read by nobody.
    //
    // Both states are words. A blank cell for "held" would make the absence of a fact and the
    // absence of a rendering look identical, which is the defect this whole milestone is about.
    cell: (row) => (row.lostFocusDuringRun ? 'Lost focus' : 'Held'),
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
