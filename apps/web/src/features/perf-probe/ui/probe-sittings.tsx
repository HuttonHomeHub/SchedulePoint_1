import type { UseQueryResult } from '@tanstack/react-query';
import { useState } from 'react';

import type { ProbeResultRow } from '../api/probe-results';
import type { Sitting, SittingLimb } from '../model/sitting';
import { NOT_RECORDED, sittingsFromRows } from '../model/sitting';
import { sweepPlan } from '../sweep/sweep-plan';

import { verdictLabel, verdictNote } from '../model/verdict-copy';

import { formatSitting } from './probe-report';

import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTable, type Column } from '@/components/ui/data-table';

/**
 * Every reading taken on this installation, **grouped into the sittings they were taken in**.
 *
 * This replaces a flat twelve-column table of rows, and the reason is not tidiness. A sweep is four
 * presses under one `sweep_id`, and the flat table repeated the machine, the versions, the operator
 * and the canvas on every one of its rows while giving a screen-reader user no structure to
 * navigate between them (spec CQ-5's rejected alternative, which needed thirteen columns to carry
 * what a sitting's facts list carries once).
 *
 * **A single press renders in exactly the same shape**, with one reading in it. That is deliberate:
 * a reader should not have to learn two layouts, and the sitting of one is the commonest thing in
 * the table.
 *
 * **Reading this is an audited act**, like every other panel on this console, so it is fetched once
 * on load and neither polled nor refetched on window focus.
 *
 * **There is exactly one empty state and it says so.** No filters exist here, so "nothing recorded
 * yet" cannot be confused with "nothing matched what you asked for" — the ADR-0073 C1 accessibility
 * finding, where a live region said "Showing 0 events" for both. Adding a filter means adding that
 * distinction first.
 */
const COMPARABILITY_ID = 'probe-sittings-comparability';

export function ProbeSittings({
  query,
}: {
  query: UseQueryResult<ProbeResultRow[]>;
}): React.ReactElement {
  const rows = query.data ?? [];
  const sittings = sittingsFromRows(rows);

  return (
    <>
      {/*
        **The caveat is LINKED to the tables, not merely placed above them.** `DataTable` is a
        focusable `role="region"`, so a reader navigating by landmark lands INSIDE one having
        skipped whatever sits above — the `my-activity.tsx` precedent, and the same finding
        ADR-0073 C2.5's accessibility gate made about a safety note reachable only by reading
        serially.
      */}
      <p id={COMPARABILITY_ID} className="text-muted-foreground mb-3 text-sm">
        A reading is only comparable to another taken at the same canvas size. The painter costs
        roughly 4.3&nbsp;ms per megapixel, which is enough to decide a verdict: the same plan on the
        same machine measured 23.3&nbsp;fps at 1912×1068 and 39.5&nbsp;fps at 1016×636 minutes
        apart. Compare readings whose canvas figures match, and read the display interval and
        attention facts before explaining an outlier.
      </p>

      {/*
        **Loading, error and empty stay with one `DataTable` fed the live query**, so those three
        states keep the exact copy and markup they already had rather than being reimplemented
        beside a list that has nothing to show. Once there are rows, each sitting owns its own
        settled table — `DataTable`'s `query` prop is structurally typed, which is what makes that
        possible without a second primitive.
      */}
      {query.isPending || query.isError || sittings.length === 0 ? (
        <DataTable
          caption="Readings recorded on this installation, newest first"
          columns={READING_COLUMNS}
          // Not a cast: the three states this branch exists for are the query's OWN, and the row
          // list is empty by construction because nothing has been grouped yet. Handing it the
          // real flags and an empty array is the honest projection.
          query={{
            isPending: query.isPending,
            isError: query.isError,
            data: query.isPending || query.isError ? undefined : [],
            refetch: query.refetch,
          }}
          getRowKey={() => ''}
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
      ) : (
        <div className="space-y-8">
          {sittings.map((sitting) => (
            <SittingBlock key={sitting.id} sitting={sitting} />
          ))}
        </div>
      )}
    </>
  );
}

/** What `DataTable` actually asks for — a settled shape, which is why a sitting can supply one. */
type SettledQuery<T> = {
  isPending: boolean;
  isError: boolean;
  data: T[] | undefined;
  refetch: () => unknown;
};

const settled = <T,>(data: T[]): SettledQuery<T> => ({
  isPending: false,
  isError: false,
  data,
  refetch: () => undefined,
});

/**
 * One sitting: the facts its readings share, then the readings.
 *
 * The heading is the table's caption rather than a separate `<h3>`, per spec §4.6 — a `DataTable`
 * already exposes a labelled region, and a heading above it would name the same thing twice.
 */
function SittingBlock({ sitting }: { sitting: Sitting }): React.ReactElement {
  const readings = readingCount(sitting);
  const missing = sitting.kind === 'sweep' ? EXPECTED_READINGS - readings : 0;

  return (
    <section className="space-y-3">
      <SittingFacts sitting={sitting} />

      {/*
        **`partial` is stated, never inferred from a short table.** Nothing is stored for a refused
        reading (by design — a row with no samples is not a reading), so a sweep whose two middle
        steps were refused is indistinguishable in the database from a sweep of two. The count is
        the only thing that can say so, and saying nothing would let a reader take an incomplete
        sitting for a complete one.
      */}
      {missing > 0 && (
        <Alert tone="info">
          This sitting has {String(readings)} of {String(EXPECTED_READINGS)} readings.{' '}
          {String(missing)} {missing === 1 ? 'was' : 'were'} refused or never taken — nothing is
          stored for those, so they cannot be shown here.
        </Alert>
      )}

      <DataTable
        caption={sittingCaption(sitting, readings)}
        columns={READING_COLUMNS}
        query={settled([...sitting.limbs])}
        getRowKey={(limb) => `${limb.scenarioId}/${limb.preset}/${limb.limbLabel}`}
        describedById={COMPARABILITY_ID}
        loadingLabel="Loading readings…"
        empty={<Alert tone="info">This sitting recorded no readings.</Alert>}
      />

      <CopySittingButton sitting={sitting} />
    </section>
  );
}

/** The facts every reading in this sitting shares — and only those. */
function SittingFacts({ sitting }: { sitting: Sitting }): React.ReactElement {
  const c = sitting.context;
  return (
    <dl className="text-muted-foreground grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
      <Fact term="Machine" value={c.machineLabel ?? c.gpu ?? '(masked or not recorded)'} />
      {/*
        **`varies between readings` rather than one of them.** `docs/TECH_DEBT.md` #261 records the
        same plan on the same machine measuring 23.3 fps at 1912x1068 and 39.5 fps at 1016x636, so
        printing one figure over a sitting that holds two would settle the most decision-relevant
        confound in the register by accident. Each reading then carries its own in the table.
      */}
      <Fact
        term="Canvas"
        value={
          c.viewport === null
            ? 'varies between readings'
            : `${String(c.viewport.width)}×${String(c.viewport.height)} @${String(c.devicePixelRatio)}x`
        }
      />
      <Fact term="Display" value={`${c.idleInterval.toFixed(1)} ms idle frame interval`} />
      {/*
        Both states are words. A blank value for "held" would make the absence of a fact and the
        absence of a rendering look identical, which is the defect this milestone is about.
      */}
      <Fact
        term="Attention"
        value={c.anyReadingLostFocus ? 'a reading lost focus — see the table' : 'held throughout'}
      />
      <Fact term="Versions" value={`web ${c.appVersion} · api ${c.apiVersion ?? NOT_RECORDED}`} />
      <Fact term="By" value={c.recordedByLabel ?? '(scrubbed)'} />
    </dl>
  );
}

function Fact({ term, value }: { term: string; value: string }): React.ReactElement {
  return (
    <>
      <dt>{term}</dt>
      <dd>{value}</dd>
    </>
  );
}

/**
 * What a sitting is called.
 *
 * It names the ACT rather than the data — "a sweep of four readings" versus "one reading" — because
 * that is the distinction `sweep_id` exists to record and the one a reader is scanning for. The
 * time is the sitting's earliest reading, which is when the operator pressed the button.
 */
function sittingCaption(sitting: Sitting, readings: number): string {
  const when = new Date(sitting.context.startedAt).toLocaleString();
  return sitting.kind === 'sweep'
    ? `Sweep of ${String(readings)} ${readings === 1 ? 'reading' : 'readings'} — ${when}`
    : `One reading — ${when}`;
}

/**
 * How many READINGS a sitting holds, which is not how many rows it holds.
 *
 * `canvas-draw` measures two scales in one press, so a reading is a scenario at a framing and a row
 * is one limb of it. Counting rows would report a two-limb press as two readings and call a
 * complete sweep of four an eight-reading sitting.
 */
function readingCount(sitting: Sitting): number {
  return new Set(sitting.limbs.map((l) => `${l.scenarioId}/${l.preset}`)).size;
}

/**
 * How many readings a complete sweep produces — **derived from the plan, never written down.**
 *
 * A literal 4 here would be a second statement of the sweep's shape, and the two would part company
 * the day a scenario or a framing is added: this table would then call every complete sitting
 * partial, which is a false claim about somebody's data rather than a stale constant.
 */
const EXPECTED_READINGS = sweepPlan().length;

/**
 * One row per limb, carrying the reading it belongs to.
 *
 * The machine, the versions, the operator and (usually) the canvas are NOT columns — they are the
 * sitting's facts, stated once above. That is the whole difference between this and the flat table
 * it replaces, which repeated all four on every row.
 */
const READING_COLUMNS: Column<SittingLimb>[] = [
  { header: 'Measurement', cell: (limb) => limb.scenarioLabel },
  { header: 'Scale', cell: (limb) => limb.limbLabel },
  { header: 'Framing', cell: (limb) => (limb.preset === 'fit' ? 'Whole plan' : 'Week') },
  {
    header: 'Protocol',
    // **A quick check is named as one, because it is not a measurement.** It runs once, so there is
    // no run-to-run spread to judge against and no verdict is possible — a reader comparing two
    // blocks months apart has to be able to see that one of them was never eligible for a verdict
    // at all, rather than inferring it from an absence.
    cell: (limb) => <ProtocolCell limb={limb} />,
  },
  { header: 'Verdict', cell: (limb) => <VerdictCell limb={limb} /> },
  {
    header: 'On screen',
    // Both halves, always: a numerator alone cannot distinguish "few bars drawn" from "few bars to
    // draw", which is the ADR-0066 cull defect that once made 4.6 ms look like the budget being met.
    cell: (limb) =>
      `${String(limb.counts.visibleBars ?? '?')} at ${limb.pxPerDay.toFixed(2)} px/day`,
  },
  {
    header: 'Taken',
    cell: (limb) => <TakenCell limb={limb} />,
  },
];

/** The run length and frame budget, and whether that makes this a check rather than a measurement. */
function ProtocolCell({ limb }: { limb: SittingLimb }): React.ReactElement {
  const frames = limb.frames === null ? NOT_RECORDED : `${String(limb.frames)} frames`;
  return (
    <span>
      {limb.size ?? NOT_RECORDED} — {frames} × {String(limb.repeats)}
      {limb.repeats <= 1 && (
        <span className="mt-1 block">
          <Badge variant="neutral">Check, not a measurement</Badge>
        </span>
      )}
    </span>
  );
}

/**
 * When this reading was taken, and what differed about it.
 *
 * **The canvas is printed here only when it differs from the sitting's**, which is spec §4.6's
 * `viewport differs from the sitting above` state. Printing it on every row would put the confound
 * back into a column and undo the grouping; printing it never would hide the one case where two
 * readings in one sitting cannot be compared — which M6-T4 makes reachable, since a re-run under
 * the same `sweep_id` can happen at a different window size.
 */
function TakenCell({ limb }: { limb: SittingLimb }): React.ReactElement {
  return (
    <span>
      {limb.recordedAt === null ? NOT_RECORDED : new Date(limb.recordedAt).toLocaleTimeString()}
      {limb.lostFocusDuringRun && (
        <span className="text-muted-foreground mt-1 block text-xs">Lost focus</span>
      )}
    </span>
  );
}

/** The verdict, glossed where a bare word would mislead. */
function VerdictCell({ limb }: { limb: SittingLimb }): React.ReactElement {
  if (limb.result.kind === 'unjudgeable') {
    return <span className="text-muted-foreground">Not readable by this version</span>;
  }
  const judged = limb.result.judged;
  // **`saturated` is read and passed on both branches**, which the renderer enumeration in
  // `saturation-renderers.test.ts` requires of every `verdictNote` caller. Only a difference run
  // can be saturated — a share of frames bounded at 100 leaves a gated delta arithmetically
  // unfailable near the ceiling (#260) — so an absolute run passes `undefined`, which is the fact
  // rather than a default: it says "not applicable here", where omitting the argument would say
  // "this renderer does not know about ceilings", and that is precisely the renderer that shipped
  // a number reading as "the overlay is free".
  const saturated = limb.result.kind === 'difference' ? limb.result.judged.saturated : undefined;
  const verdict = judged.verdict;
  const note = verdictNote(verdict, {
    gated: limb.gated,
    repeats: limb.repeats,
    indeterminateReason: judged.indeterminateReason,
    saturated,
  });
  // A `Badge`, not a hand-weighted span: a verdict is a status, the primitive already carries the
  // weight, and the ADR-0097 ratchet counts weights placed OUTSIDE the primitives for exactly this
  // reason. `critical` only for a genuine FAIL — an INDETERMINATE or an ungraded reading is not bad
  // news, and colouring it as though it were would be the confident wrong answer this epic refuses.
  return (
    <span>
      <Badge variant={verdict === 'FAIL' ? 'critical' : 'neutral'}>{verdictLabel(verdict)}</Badge>
      {note !== null && <span className="text-muted-foreground mt-1 block text-xs">{note}</span>}
    </span>
  );
}

/**
 * Copy the paste-ready block for this whole sitting.
 *
 * Per SITTING rather than per row: the readings of one press share a machine and a clock, so a
 * block for one limb of a four-reading sweep would be a partial answer that looks complete. The
 * flat table had to put this on every row and say which; a sitting block does not.
 */
function CopySittingButton({ sitting }: { sitting: Sitting }): React.ReactElement {
  const [copied, setCopied] = useState(false);

  return (
    <span className="flex items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          void navigator.clipboard.writeText(formatSitting(sitting)).then(
            () => setCopied(true),
            () => setCopied(false),
          );
        }}
      >
        Copy report
      </Button>
      {/* Announced, because a Copy button changes nothing visible and is otherwise silent to a
          screen reader — the same WCAG 4.1.3 finding the live panel's copy control already carries. */}
      <span aria-live="polite" className="text-muted-foreground text-xs">
        {copied ? 'Copied.' : ''}
      </span>
    </span>
  );
}
