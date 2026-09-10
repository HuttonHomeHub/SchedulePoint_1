import type { UseQueryResult } from '@tanstack/react-query';
import { useId, useState } from 'react';

import type { ProbeResultRow } from '../api/probe-results';
import type { Sitting, SittingLimb } from '../model/sitting';
import {
  NOT_RECORDED,
  SITTING_SPREAD_LIMIT_MS,
  describeSpread,
  sittingSpreadMs,
  sittingsFromRows,
} from '../model/sitting';
import { verdictLabel, verdictNote } from '../model/verdict-copy';
import { sweepPlan } from '../sweep/sweep-plan';

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
            <Alert purpose="condition" tone="info">
              No readings recorded yet. Run a measurement above and it will be stored here, with the
              machine it ran on and the app version that drew the frames.
            </Alert>
          }
        />
      ) : (
        <div className="space-y-8">
          {/*
            **The list is a page, and saying so is what stops the block below lying.** The read is
            capped at 50 rows and returns no total and no cursor (`staff-probe.service.ts:14,136`),
            so an installation that has taken more than fifty readings simply stops seeing the
            oldest — with nothing on screen distinguishing that from having taken fifty. Stated
            without a number, because the client is not told the cap and inventing one would be the
            confident-wrong sentence this whole epic removes. `docs/TECH_DEBT.md` #271 is the real
            fix: a total, so this can say "showing 50 of 312".
          */}
          <p className="text-muted-foreground text-sm">
            Showing the most recent readings. Older sittings are not listed.
          </p>
          {sittings.map((sitting, index) => (
            <SittingBlock
              key={sitting.id}
              sitting={sitting}
              // **The oldest block is the one the page boundary can cut**, because the read is
              // ordered newest-first. It is therefore the one block that must not claim a missing
              // reading was refused.
              //
              // **The premise is narrower than it looks, and the narrowing is recorded rather than
              // relied on.** This said "a sitting's readings are adjacent in time", which M6-T4
              // made untrue: a resumed sitting's newest row sorts near the top while its original
              // rows can fall past the fifty-row cap, so a NON-oldest block could in principle be
              // truncated and would then print "N were refused or never taken" about stored data.
              // It is not reachable today — `resume` is read from the panel's in-memory outcome, so
              // it is session-scoped — and it becomes reachable the moment a resume can be started
              // from the stored history, which is a natural companion to `docs/TECH_DEBT.md` #271.
              // Raised independently by the M7 ux and database reviews; filed as #273.
              mayBeTruncated={index === sittings.length - 1}
            />
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
function SittingBlock({
  sitting,
  mayBeTruncated,
}: {
  sitting: Sitting;
  /** True for the oldest block, whose missing readings may be on the next page rather than absent. */
  mayBeTruncated: boolean;
}): React.ReactElement {
  const factsId = useId();
  const spreadId = useId();
  const missingId = useId();
  const readings = readingCount(sitting);
  const missing = sitting.kind === 'sweep' ? EXPECTED_READINGS - readings : 0;
  const spread = sittingSpreadMs(sitting);
  // Derived once: the table's caption and the Copy button's accessible name are the same sentence,
  // so a reader hears the block named the same way twice rather than two descriptions of one thing.
  const caption = sittingCaption(sitting, readings);

  /**
   * **This block's own facts reach a reader who lands INSIDE its table** — the same fix the
   * general comparability note already had, applied one level down.
   *
   * `DataTable` is a focusable `role="region"`, so a landmark-navigating reader arrives at
   * "Sweep of 6 readings — …" having skipped whatever sits above it. That was fine while the only
   * thing above was a sentence identical for every sitting; it stopped being fine when the block
   * grew facts that differ per sitting — which machine, whether readings are missing, whether it
   * spans a reboot. Those are exactly what decides whether the numbers inside mean anything, and a
   * reader who never sees them is the failure this whole epic is about. Found by the M7
   * accessibility review, which also noted honestly that no single success criterion names it.
   *
   * Ids are per block (`useId`) and the list is assembled in reading order; a warning that is not
   * rendered contributes nothing rather than an id pointing at no element, which reads to a screen
   * reader as a missing description rather than an absent one.
   */
  const describedBy = [
    factsId,
    ...(spread !== null && spread > SITTING_SPREAD_LIMIT_MS ? [spreadId] : []),
    ...(missing > 0 ? [missingId] : []),
    COMPARABILITY_ID,
  ].join(' ');

  return (
    <section className="space-y-3">
      <SittingFacts sitting={sitting} id={factsId} />

      {/*
        **A sitting that spans time says so, rather than the reader inferring it from the clock
        column.** M6-T4 stores a re-run reading under the SAME `sweep_id`, which is right — the
        operator meant them as one act — and it makes "these were taken together" false in a way
        nothing else on the block contradicts: the machine facts above are stated once, over
        readings that may have been taken on either side of a reboot, a resize or a release.

        The threshold does the discriminating. A full sweep takes about two minutes and a
        stopped-and-resumed one perhaps ten, so this is silent for every ordinary sitting and speaks
        only for the case that is genuinely two occasions filed as one.
      */}
      {spread !== null && spread > SITTING_SPREAD_LIMIT_MS && (
        <Alert purpose="condition" tone="info" id={spreadId}>
          These readings were taken {describeSpread(spread)} apart, not at one time. Each row
          carries its own time below. The machine facts above were recorded with the earliest, so
          compare these readings with that in mind.
        </Alert>
      )}

      {/*
        **`partial` is stated, never inferred from a short table.** Nothing is stored for a refused
        reading (by design — a row with no samples is not a reading), so a sweep whose two middle
        steps were refused is indistinguishable in the database from a sweep of two. The count is
        the only thing that can say so, and saying nothing would let a reader take an incomplete
        sitting for a complete one.
      */}
      {missing > 0 && (
        <Alert purpose="condition" tone="info" id={missingId}>
          This sitting has {String(readings)} of {String(EXPECTED_READINGS)} readings.{' '}
          {mayBeTruncated
            ? // **The oldest block asserts nothing about WHY.** It cannot: a reading missing here
              // may have been refused, may never have been taken, or may simply be on the next
              // page of a capped read. Saying "refused or never taken" would be a false claim
              // about somebody's data, which is exactly the defect the alert exists to prevent —
              // one page boundary along.
              `The rest are not shown: they were refused, were never taken, or fall outside this page.`
            : `${String(missing)} ${missing === 1 ? 'was' : 'were'} refused or never taken — nothing is stored for those, so they cannot be shown here.`}
        </Alert>
      )}

      <DataTable
        caption={caption}
        columns={READING_COLUMNS}
        query={settled([...sitting.limbs])}
        getRowKey={(limb) => `${limb.scenarioId}/${limb.preset}/${limb.limbLabel}`}
        describedById={describedBy}
        loadingLabel="Loading readings…"
        empty={
          <Alert purpose="condition" tone="info">
            This sitting recorded no readings.
          </Alert>
        }
      />

      <CopySittingButton sitting={sitting} label={caption} />
    </section>
  );
}

/** The facts every reading in this sitting shares — and only those. */
function SittingFacts({ sitting, id }: { sitting: Sitting; id: string }): React.ReactElement {
  const c = sitting.context;
  return (
    <dl id={id} className="text-muted-foreground grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
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
 * How many READINGS a sitting holds — **one per row, which is what the table shows.**
 *
 * This counted distinct scenario-and-framing pairs until M7, so it counted **steps** and called
 * them readings: a complete sweep captioned itself `Sweep of 4 readings` above a table of **six**,
 * and the partial notice said "2 of 4" where the approved spec says six. That spec is unambiguous
 * and says it seven times — "four **steps**, six **readings**", "each a row" (§US-1, §S1, §CQ-2) —
 * so the code had the vocabulary inverted, on the one screen this epic built to remove
 * confidently-wrong numbers. Found by the M7 ux review.
 *
 * The docblock that used to sit here argued for the wrong answer with wrong arithmetic, too: it
 * said counting rows would "call a complete sweep of four an **eight**-reading sitting". It is
 * 2 + 2 + 1 + 1 = **six**. Nobody did the sum in the comment arguing against doing the sum.
 *
 * **It also makes a real gap visible.** A step can be stored having completed one of its two limbs
 * — a Stop between them keeps the finished one (M3) — and nothing in `SweepStepStatus` can say so,
 * because that step is `recorded`. Counting rows means such a sitting reads "5 of 6 readings"
 * instead of a confident "4 of 4"; the remedy for it is `docs/TECH_DEBT.md` #272.
 */
function readingCount(sitting: Sitting): number {
  return sitting.limbs.length;
}

/**
 * How many readings a complete sweep produces — **derived from the registry, never written down.**
 *
 * A literal 6 here would be a second statement of the sweep's shape, and the two would part company
 * the day a scenario, a framing or a **scale** is added: this table would then call every complete
 * sitting partial, which is a false claim about somebody's data rather than a stale constant. It is
 * the sum of each step's limbs rather than the step count, for the reason above — `canvas-draw`
 * measures two scales in one press and each is its own row.
 */
const EXPECTED_READINGS = sweepPlan().reduce(
  (total, step) => total + step.scenario.limbs.length,
  0,
);

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
function CopySittingButton({
  sitting,
  label,
}: {
  sitting: Sitting;
  /** The block's caption, so N of these buttons are told apart by name and not by position. */
  label: string;
}): React.ReactElement {
  const [copied, setCopied] = useState(false);

  return (
    <span className="flex items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        // **Named for its own sitting, because there are N of these on screen.** Every block has one,
        // and with the bare label an assistive-technology user browsing by button list meets a
        // column of identical "Copy report" entries with nothing to choose between them. The visible
        // word stays short; the accessible name carries the caption the block is already titled by.
        aria-label={`Copy report — ${label}`}
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
