import { useId } from 'react';

import type { Sitting, SittingLimb } from '../model/sitting';
import {
  NOT_RECORDED,
  SITTING_SPREAD_LIMIT_MS,
  describeSpread,
  sittingSpreadMs,
} from '../model/sitting';
import { EXPECTED_READINGS } from '../model/sitting-index';
import { verdictLabel, verdictNote } from '../model/verdict-copy';

import { formatSitting } from './probe-report';

import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { CopyButton } from '@/components/ui/copy-button';
import { DataTable, type Column } from '@/components/ui/data-table';
import { SubSection } from '@/components/ui/page';
import { formatTimestamp } from '@/lib/format-date';

/**
 * The cap note's id.
 *
 * **Module-level, and rendered above the detail block rather than inside the index**, because the
 * cap is a property of the READ and not of the index: a single sitting can itself be truncated at
 * fifty rows, and hiding the caveat until a second sitting exists would withhold it from the one
 * history where the reader has nothing else to compare against.
 */
export const CAP_ID = 'probe-sittings-cap';

/** What `DataTable` actually asks for — a settled shape, which is why a sitting can supply one. */
export type SettledQuery<T> = {
  isPending: boolean;
  isError: boolean;
  data: T[] | undefined;
  refetch: () => unknown;
};

export const settled = <T,>(data: T[]): SettledQuery<T> => ({
  isPending: false,
  isError: false,
  data,
  refetch: () => undefined,
});

/**
 * One sitting: the facts its readings share, then the readings.
 *
 * **The caption is `sr-only` (`data-table.tsx:144,226`), so until this it named the sitting for a
 * screen-reader user and for nobody else.** The docblock here used to say the caption WAS the
 * heading, citing the spec — and the spec's sentence is about not inventing a grouped-table pattern,
 * not about refusing a visible one. Photographed (`#165(e)`), five blocks ran together as one
 * stream: facts, table, Copy, facts, table, Copy, with no painted boundary anywhere. The asymmetry
 * is the finding: the spec's own stated worry was "gives a screen-reader user no structure to
 * navigate", which was solved, while the sighted reader was left with none.
 *
 * The heading and the region now name the same thing deliberately, which is ordinary: one is the
 * block's heading and the other is the table's label.
 */
export function SittingBlock({
  sitting,
  mayBeTruncated,
  comparabilityId,
  blockRef,
}: {
  sitting: Sitting;
  /** The block itself, so the host can bring a newly-promoted sitting into view. Optional: the
   *  block renders in states that have no index to be promoted from. */
  blockRef?: React.RefObject<HTMLElement | null>;
  /** True for the oldest block, whose missing readings may be on the next page rather than absent. */
  mayBeTruncated: boolean;
  /** The comparability note's id, or `null` when there is nothing to compare and it is not rendered. */
  comparabilityId: string | null;
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
    // **The cap reaches this block too, and not only the index.** `DataTable` is a focusable
    // `role="region"`, so a reader who jumps straight to the expanded sitting skipped the note
    // above it — and with ONE sitting the index does not render at all, which is precisely the
    // state `CAP_ID`'s own docblock says the caveat matters most in. It was wired to the index
    // alone, so that docblock described an intent the code did not have. Found by the M7
    // accessibility review.
    CAP_ID,
    ...(spread !== null && spread > SITTING_SPREAD_LIMIT_MS ? [spreadId] : []),
    ...(missing > 0 ? [missingId] : []),
    ...(comparabilityId === null ? [] : [comparabilityId]),
  ].join(' ');

  return (
    /**
     * **Each sitting says where it begins.** Photographed for the first time (`#165(e)`), five
     * blocks ran together as one continuous stream: a facts list, a table, a Copy button, then
     * another facts list, with nothing on screen marking the boundary — the table's caption is the
     * region's accessible NAME and is not painted, so a sighted reader had no heading at all while
     * a screen-reader user had one. `SubSection` is the console's one sub-heading, and takes its rank
     * from the card it sits in (an `h4` inside a group), so the panel's headings match rather than
     * each surface inventing its own; using the primitive also keeps the weight inside
     * `components/ui`, where the screen ceiling does not count it and should not.
     *
     * The rule above the first block is a separator and not a decoration: `space-y-8` alone spaces
     * blocks the same way a block spaces its own parts, only more so, which is the ambiguity.
     */
    /* **Deliberately NOT `aria-labelledby`.** A `<section>` with an accessible name IS a `region`
       landmark, so naming it would put a landmark around a table that is already a region with the
       SAME name — a landmark-navigating reader would meet the sitting twice, one nested in the
       other. Caught by the existing suite going ambiguous on `getByRole('region', …)`, which is the
       assertion noticing rather than breaking. The heading gives navigation the structure;
       nothing needs a second landmark to carry it. */
    <section className="space-y-3" ref={blockRef}>
      {/* **Deliberately un-`id`'d.** It carried a `headingId` nothing ever read — a stray id the
          M7 accessibility review flagged as one a later edit could wire into the `<section>`'s
          `aria-labelledby`, silently reintroducing the nested-region problem the comment above
          warns against. The scroll target is the section, which needs no id at all. */}
      <SubSection title={caption} />
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
        empty="This sitting recorded no readings."
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
        **`varies between readings` rather than one of them.** `docs/TECH_DEBT.md` #261 measures
        35.2 fps at 1912x948 against 32.2 fps at 1920x1080 inside one sitting, so printing one
        figure over a sitting that holds two would settle the most decision-relevant confound in
        the register by accident. Each reading then carries its own in the table. (This cited that
        row's 23.3-against-39.5 pair until 2026-09-12; #261 withdrew it as contaminated by machine
        state rather than by size.)
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
  const when = formatTimestamp(sitting.context.startedAt);
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
 * One row per limb, carrying the reading it belongs to.
 *
 * The machine, the versions, the operator and (usually) the canvas are NOT columns — they are the
 * sitting's facts, stated once above. That is the whole difference between this and the flat table
 * it replaces, which repeated all four on every row.
 */
export const READING_COLUMNS: Column<SittingLimb>[] = [
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
      {limb.recordedAt === null ? NOT_RECORDED : formatTimestamp(limb.recordedAt)}
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
  // **The rejection used to set `copied` back to `false`** — byte-identical to never having pressed
  // the button. `CopyButton` owns both outcomes, and names this sitting in what it announces, for
  // the same reason the button's own label does.
  return (
    <CopyButton
      size="sm"
      subject={`Report — ${label}`}
      // **Named for its own sitting, because there are N of these on screen.** Every block has one,
      // and with the bare label an assistive-technology user browsing by button list meets a
      // column of identical "Copy report" entries with nothing to choose between them. The visible
      // word stays short; the accessible name carries the caption the block is already titled by.
      aria-label={`Copy report — ${label}`}
      text={() => formatSitting(sitting)}
    >
      Copy report
    </CopyButton>
  );
}
