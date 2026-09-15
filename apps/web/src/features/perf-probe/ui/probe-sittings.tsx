import type { UseQueryResult } from '@tanstack/react-query';
import { useId, useRef, useState } from 'react';

import type { ProbeResultRow } from '../api/probe-results';
import type { Sitting, SittingLimb } from '../model/sitting';
import {
  NOT_RECORDED,
  SITTING_SPREAD_LIMIT_MS,
  describeSpread,
  sittingSpreadMs,
  sittingsFromRows,
} from '../model/sitting';
import {
  describeReadings,
  sittingCaveats,
  sittingIndexRow,
  verdictSegment,
  type SittingIndexRow,
} from '../model/sitting-index';
import { verdictLabel, verdictNote } from '../model/verdict-copy';
import { sweepPlan } from '../sweep/sweep-plan';

import { formatSitting } from './probe-report';

import { Alert } from '@/components/ui/alert';
import { useAnnounce } from '@/components/ui/announcer';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CardTitle } from '@/components/ui/card';
import { DataTable, type Column } from '@/components/ui/data-table';
import { useClipboardCopy } from '@/hooks/use-clipboard-copy';

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
 * **One sitting is expanded and the rest are an index, because the blocks were the page.** Measured
 * at 1646 over fifteen accumulated sittings, this list was 8,487 px of a 12,842 px document — 66.1 %
 * — and the remedy took it to 1,666 px with the page at 6,021
 * (`docs/specs/staff-console-design/m7-probe-history.md`). The compression is chrome rather than
 * content: the shared-facts list is a constant 140 px on every block whatever it holds, so fifteen
 * of them repeated the same six facts for 2,100 px, and on a one-reading block the facts were nearly
 * twice the height of the reading they described.
 *
 * **An index and not a dropdown, which was the decision rather than the default.** A select clears
 * the height just as well and hides the SET: a reader cannot learn how many sittings exist, scan
 * their dates, or spot two taken at the same canvas without opening it and holding the answer in
 * their head — and that comparison is exactly what the comparability note below asks of them. So
 * every sitting stays named, dated and CANVASED at rest, and only its readings are behind a press.
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
/**
 * The cap note's id.
 *
 * **Module-level, and rendered above the detail block rather than inside the index**, because the
 * cap is a property of the READ and not of the index: a single sitting can itself be truncated at
 * fifty rows, and hiding the caveat until a second sitting exists would withhold it from the one
 * history where the reader has nothing else to compare against.
 */
const CAP_ID = 'probe-sittings-cap';

export function ProbeSittings({
  query,
}: {
  query: UseQueryResult<ProbeResultRow[]>;
}): React.ReactElement {
  const rows = query.data ?? [];
  const sittings = sittingsFromRows(rows);
  /**
   * Which sitting the detail slot holds — **`null` meaning "the newest", never a copied id.**
   *
   * Storing the newest sitting's id at mount would freeze the selection against a refetch: a
   * reader who has not chosen anything would keep looking at what used to be the newest. `null`
   * follows the data, and a chosen id that falls off the capped page falls back to the newest
   * rather than emptying the slot.
   */
  const [shownId, setShownId] = useState<string | null>(null);
  const shown = sittings.find((s) => s.id === shownId) ?? sittings[0];
  /**
   * The expanded block's heading, so a press can bring the thing it changed into view.
   *
   * The detail slot sits ABOVE the index, so pressing Show on a row near the bottom of fifteen
   * changes something off-screen: a screen-reader user hears the announcement and a sighted one
   * sees a badge appear beside the button they pressed and nothing else. Raised independently by
   * the M7 ux and accessibility reviews. `block: 'nearest'` rather than a jump — if the block is
   * already visible nothing moves, which is the common case at the top of the list.
   *
   * **On the `<section>` and not the heading**, because `CardTitle` does not forward a ref and
   * teaching it to would be a change to a shared primitive's public contract — an ADR-0105 trigger
   * that stops the work for a spec. The section is this file's own element.
   */
  const blockRef = useRef<HTMLElement>(null);

  return (
    <>
      {/*
        **The caveat is LINKED to the tables, not merely placed above them.** `DataTable` is a
        focusable `role="region"`, so a reader navigating by landmark lands INSIDE one having
        skipped whatever sits above — the `my-activity.tsx` precedent, and the same finding
        ADR-0073 C2.5's accessibility gate made about a safety note reachable only by reading
        serially.
      */}
      {/*
        **The evidence changed on 2026-09-12; the rule did not.** This paragraph used to cite
        23.3 fps at 1912×1068 against 39.5 fps at 1016×636, and a 4.3 ms-per-megapixel coefficient
        derived from that pair. `docs/TECH_DEBT.md` #261 has since withdrawn it: the 23.3 reading
        is the one figure in the whole set that nothing has reproduced (the same geometry measured
        32.2 fps two days later on more pixels), so the pair was never a clean size comparison —
        it was one sitting against another with an unrecorded variable between them (#283). The
        register says in as many words that 23.3 must not be quoted on its own.

        So the screen built to stop an operator drawing a wrong conclusion from a number was
        quoting a withdrawn one, on the one surface where the reader has nothing else to check it
        against. Found by photographing the console for the first time (`#165(e)`) — no gate here
        could see it, because a number in a sentence is correct markup.

        What replaces it is the pair that survives BECAUSE it was taken inside a single sitting, so
        no machine-state confound is possible, and no coefficient is derived from two points.
      */}
      {/* **Rendered once there is a second reading to compare with** (spec §8.15). Before that it
          is advice about an act the reader cannot perform, on the panel whose empty state already
          says to run a measurement — and a caveat that is always on screen is one a reader learns
          to skip before the day it matters. `sittings.length` rather than a row count, because
          comparability is between SITTINGS: two readings inside one sitting share a machine, a
          canvas and a clock, which is the whole reason the surviving figure pair was taken that
          way. The id is still referenced by `describedById`, so when the paragraph is absent the
          reference is dropped with it rather than pointing at nothing. */}
      {sittings.length > 1 && (
        <p id={COMPARABILITY_ID} className="text-muted-foreground mb-3 text-sm">
          A reading is only comparable to another taken at the same canvas size, and the difference
          is not a rounding term: measured inside one sitting, the same plan on the same machine
          drew at 35.2&nbsp;fps at 1912×948 and 32.2&nbsp;fps at 1920×1080 — about 3&nbsp;fps for
          14% more area. Compare readings whose canvas figures match, and read the display interval
          and attention facts before explaining an outlier.
        </p>
      )}

      {/*
        **Loading, error and empty stay with one `DataTable` fed the live query**, so those three
        states keep the exact copy and markup they already had rather than being reimplemented
        beside a list that has nothing to show. Once there are rows, each sitting owns its own
        settled table — `DataTable`'s `query` prop is structurally typed, which is what makes that
        possible without a second primitive.
      */}
      {query.isPending || query.isError || sittings.length === 0 || shown === undefined ? (
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
          // Deliberately NOT `describedById={COMPARABILITY_ID}`: this branch runs when there are no
          // sittings, so the note it pointed at is not on the page. It was a dangling reference in
          // every state this branch has.
          loadingLabel="Loading recorded readings…"
          errorLabel="Could not read the recorded readings."
          // Plain copy, not an `Alert`: `DataTable` frames a non-blank `empty` node itself, so an
          // alert here renders one message inside two boxes — its own border and tint inside the
          // dashed empty frame, whose `text-center` then fights the alert's left-aligned icon row.
          empty="No readings recorded yet. Run a measurement above and it will be stored here, with the machine it ran on and the app version that drew the frames."
        />
      ) : (
        <div className="space-y-8" data-probe-history-list>
          {/*
            **The newest sitting is expanded and the rest are an index, because the blocks were the
            page.** Measured at 1646 over fifteen accumulated sittings, this list was **8,487 px of
            a 12,842 px document — 66.1 %** (`docs/specs/staff-console-design/m7-probe-history.md`),
            and roughly 3,400 px of that was per-block chrome rather than measurements: the facts
            list is a constant 140 px on every block, so fifteen of them repeat the same six facts
            for 2,100 px, and on a one-reading block the facts are nearly twice the height of the
            reading they describe.

            **An index rather than a dropdown, and that was the decision rather than the default.**
            A select clears the height just as well and hides the SET: the reader cannot learn how
            many sittings exist, scan their dates, or spot two taken at the same canvas without
            opening it and holding the answer in their head — which is exactly the comparison the
            note above asks them to make. So every sitting stays named and dated at rest, and only
            its detail is behind a press.
          */}
          {/*
            **The list is a page, and saying so is what stops the blocks lying.** The read is capped
            at 50 rows and returns no total and no cursor (`staff-probe.service.ts:14,136`), so an
            installation past fifty simply stops seeing the oldest — with nothing on screen
            distinguishing that from having taken fifty. Stated without a number, because the client
            is not told the cap and inventing one would be the confidently-wrong sentence this whole
            epic removes. `docs/TECH_DEBT.md` #271 is the real fix: a total, so this can say
            "showing 50 of 312".
          */}
          <p id={CAP_ID} className="text-muted-foreground text-sm">
            Showing the most recent readings. Older sittings are not listed.
          </p>
          <SittingBlock
            blockRef={blockRef}
            sitting={shown}
            // **The oldest block is the one the page boundary can cut**, because the read is
            // ordered newest-first — so the claim "the rest were refused" is only safe to make
            // about a sitting that is not the last one. It used to be an index comparison over a
            // list; with one block on screen it is a comparison against the list's last id, which
            // is the same rule stated for the block that is actually rendered.
            mayBeTruncated={shown.id === sittings[sittings.length - 1]?.id}
            // Null when the paragraph is not rendered. An `aria-describedby` pointing at no
            // element reads to a screen reader as a missing description rather than an absent
            // one — the rule this file already states for its two conditional warnings, applied
            // to the note that is now conditional too.
            comparabilityId={sittings.length > 1 ? COMPARABILITY_ID : null}
          />
          {sittings.length > 1 && (
            <SittingIndex
              sittings={sittings}
              shownId={shown.id}
              onShow={(id) => {
                setShownId(id);
                // **Guarded, and last.** `scrollIntoView` is a progressive enhancement that jsdom
                // does not implement — the `combobox.tsx:311` precedent — and an unguarded call
                // here threw before `announce` ran, so a cosmetic scroll would have swallowed the
                // one channel a screen-reader user has. Found by the suite going red on the
                // announcement rather than on the scroll, which is the right way round.
                const block = blockRef.current;
                if (block !== null && typeof block.scrollIntoView === 'function') {
                  block.scrollIntoView({ block: 'nearest' });
                }
              }}
            />
          )}
        </div>
      )}
    </>
  );
}

/**
 * Every sitting, one row each — the list the reader chooses from.
 *
 * **It lists ALL of them, including the one on screen**, rather than "the others". A list that
 * removes its own selection re-orders under the reader's cursor on every press and never tells them
 * where they are; keeping the row and marking it costs nothing and answers both.
 *
 * **The cap note lives here** because the cap is a property of this list. The read returns at most
 * fifty rows with no total and no cursor (`staff-probe.service.ts:14,136`), so an installation past
 * fifty simply stops seeing the oldest with nothing distinguishing that from having taken fifty.
 * Stated without a number, because the client is not told the cap and inventing one would be the
 * confidently-wrong sentence this panel exists to remove; `docs/TECH_DEBT.md` #271 is the real fix.
 */
function SittingIndex({
  sittings,
  shownId,
  onShow,
}: {
  sittings: readonly Sitting[];
  shownId: string;
  onShow: (id: string) => void;
}): React.ReactElement {
  const announce = useAnnounce();
  const rows = sittings.map((sitting) => sittingIndexRow(sitting, EXPECTED_READINGS));

  const columns: Column<SittingIndexRow>[] = [
    {
      header: 'Taken',
      cell: (row) => (
        <span>
          {row.when}
          {/*
            **The other two confounds, on the row rather than behind a press.** The Canvas column is
            here because readings are comparable only at equal canvas (#261/#283); a sitting that
            spans hours or lost the window is untrustworthy for the same kind of reason, and both
            facts were previously reachable only by opening each sitting in turn — which is the cost
            this index exists to remove. Raised by the M7 ux review.
          */}
          {sittingCaveats(row.sitting, sittingSpreadMs(row.sitting), SITTING_SPREAD_LIMIT_MS).map(
            (caveat) => (
              <span key={caveat} className="mt-1 block">
                <Badge variant="warning">{caveat}</Badge>
              </span>
            ),
          )}
          {row.id === shownId && (
            <span className="mt-1 block">
              {/*
                **The row carries the state, not the button.** Swapping the button's word from
                "Show" to "Shown" would change its accessible name under the reader who just
                pressed it, and leave the visible text outside that name (WCAG 2.5.3 Label in
                Name). The badge says where they are; the control keeps one name and one job.
              */}
              <Badge variant="neutral">Shown above</Badge>
            </span>
          )}
        </span>
      ),
    },
    {
      header: 'Sitting',
      // **The count is appended only when it says something the kind does not.** `describeReadings`
      // returns `null` for a single press of one reading, because "One reading — 1 reading" is a
      // tautology and "One reading — 2 readings" — the shape the default two-limb scenario
      // produces — is a contradiction.
      cell: (row) => {
        const readings = describeReadings(row);
        return readings === null ? row.kind : `${row.kind} — ${readings}`;
      },
    },
    { header: 'Machine', cell: (row) => row.machine },
    // FC-C: the one fact that decides which sittings are comparable at all (#261/#283). It is not
    // a nice-to-have column and must survive any later attempt to shorten this row.
    { header: 'Canvas', cell: (row) => row.canvas },
    {
      header: 'Verdicts',
      // **Only the failing segment is painted.** Colouring the whole string put "5 passed" in
      // alarm ink beside "1 failed", which breaks the rule `sitting-index.ts` states in its own
      // docblock and `VerdictCell` already honours one level down: an ungraded or indeterminate
      // reading is not bad news. The word "failed" is always present, so the colour is a second
      // channel and never the only one (WCAG 1.4.1).
      cell: (row) =>
        row.verdicts.length === 0 ? (
          'no readings'
        ) : (
          <span>
            {row.verdicts.map((entry, i) => (
              <span key={entry.label}>
                {i > 0 && ' · '}
                <span className={entry.failing ? 'text-destructive-text' : undefined}>
                  {verdictSegment(entry)}
                </span>
              </span>
            ))}
          </span>
        ),
    },
    {
      header: 'Show this sitting',
      srHeader: true,
      cell: (row) => (
        <ShowSittingButton
          row={row}
          isShown={row.id === shownId}
          onShow={() => {
            onShow(row.id);
            // The detail slot is above the control that changed it and outside the reader's
            // focus, so nothing about the press announces itself. `Panel`'s polite region is the
            // app's one channel for that, and `/staff` has carried an `AnnouncerProvider` since
            // the console redesign — before that `useAnnounce()` there was a silent no-op.
            // `describeReadings` is `null` where a count would be a tautology, so the sentence is
            // assembled rather than interpolated — "Showing …, One reading, null." was the
            // alternative.
            const readings = describeReadings(row);
            announce(
              `Showing ${row.when} — ${row.kind}${readings === null ? '' : `, ${readings}`}.`,
            );
          }}
        />
      ),
    },
  ];

  return (
    <section className="space-y-3">
      <CardTitle level={3} className="text-sm">
        All sittings
      </CardTitle>
      <DataTable
        caption="Every sitting recorded on this installation, newest first"
        columns={columns}
        query={settled(rows)}
        getRowKey={(row) => row.id}
        // `DataTable` is a focusable `role="region"`, so a landmark-navigating reader lands INSIDE
        // it having skipped the note above — the ADR-0073 C2.5 finding, which is why the cap is
        // linked rather than merely placed.
        describedById={CAP_ID}
        loadingLabel="Loading sittings…"
        empty="No sittings recorded yet."
      />
    </section>
  );
}

/**
 * The control that moves a sitting into the detail slot.
 *
 * **`aria-disabled` and a guard, never native `disabled`** — and that is not a style preference.
 * Whether a row is the shown one flips when the reader presses a DIFFERENT row's button, so the
 * control under their finger changes state as a consequence of their own press. A native
 * `disabled` blurs to `<body>` at that moment, which is a WCAG 2.4.3 failure this repository has
 * now recorded shipping four times (ADR-0060 M6, ADR-0063 M6, ADR-0096, ADR-0133). Shaded with its
 * reason, focus never moves.
 *
 * The reason is an `sr-only` **sibling** plus `aria-describedby`, never folded into the name — the
 * `ToolbarButton` pattern, for the reason its own docblock records: a button's name comes from its
 * content, so a reason inside it is appended to the name as well as the description.
 */
function ShowSittingButton({
  row,
  isShown,
  onShow,
}: {
  row: SittingIndexRow;
  isShown: boolean;
  onShow: () => void;
}): React.ReactElement {
  const reasonId = useId();
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        // Named for its own sitting: fifteen of these on screen, and an assistive-technology user
        // browsing by button list meets a column of identical "Show" entries otherwise. The same
        // reason the Copy button carries its sitting's caption.
        aria-label={`Show ${row.when} — ${row.kind}`}
        {...(isShown ? { 'aria-disabled': true, 'aria-describedby': reasonId } : {})}
        // **The established idiom, not a JS ternary** (`confirm-dialog.tsx`, `scope-save-bar.tsx`,
        // `WbsBulkAssignBar.tsx` all spell it this way). Static classes reacting to the attribute
        // that is already conditional — and `pointer-events-none` matters: without it the shown
        // row's button still lit its hover fill while refusing the click, which is the
        // looks-live-but-refuses defect ADR-0082 exists to remove. Found by the M7 component review.
        className="aria-disabled:pointer-events-none aria-disabled:opacity-50"
        onClick={() => {
          // The guard, not the attribute. `aria-disabled` is a statement to assistive technology
          // and does nothing to the pointer.
          if (isShown) return;
          onShow();
        }}
      >
        Show
      </Button>
      {isShown && (
        <span id={reasonId} className="sr-only">
          This sitting is already shown above.
        </span>
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
 * **The caption is `sr-only` (`data-table.tsx:144,226`), so until this it named the sitting for a
 * screen-reader user and for nobody else.** The docblock here used to say the caption WAS the
 * heading, citing the spec — and the spec's sentence is about not inventing a grouped-table pattern,
 * not about refusing a visible one. Photographed (`#165(e)`), five blocks ran together as one
 * stream: facts, table, Copy, facts, table, Copy, with no painted boundary anywhere. The asymmetry
 * is the finding: the spec's own stated worry was "gives a screen-reader user no structure to
 * navigate", which was solved, while the sighted reader was left with none.
 *
 * The `<h3>` and the region now name the same thing deliberately, which is ordinary: one is the
 * block's heading and the other is the table's label.
 */
function SittingBlock({
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
     * a screen-reader user had one. `CardTitle level={3}` at `text-sm` is the same treatment the
     * console's Mail and Retention subsections already use, so the panel's headings match rather
     * than each surface inventing its own; using the primitive also keeps the weight inside
     * `components/ui`, where the screen ceiling does not count it and should not.
     *
     * The rule above the first block is a separator and not a decoration: `space-y-8` alone spaces
     * blocks the same way a block spaces its own parts, only more so, which is the ambiguity.
     */
    /* **Deliberately NOT `aria-labelledby`.** A `<section>` with an accessible name IS a `region`
       landmark, so naming it would put a landmark around a table that is already a region with the
       SAME name — a landmark-navigating reader would meet the sitting twice, one nested in the
       other. Caught by the existing suite going ambiguous on `getByRole('region', …)`, which is the
       assertion noticing rather than breaking. The `<h3>` gives heading navigation the structure;
       nothing needs a second landmark to carry it. */
    <section className="space-y-3" ref={blockRef}>
      {/* **Deliberately un-`id`'d.** It carried a `headingId` nothing ever read — a stray id the
          M7 accessibility review flagged as one a later edit could wire into the `<section>`'s
          `aria-labelledby`, silently reintroducing the nested-region problem the comment above
          warns against. The scroll target is the section, which needs no id at all. */}
      <CardTitle level={3} className="text-sm">
        {caption}
      </CardTitle>
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
  // **The rejection used to set `copied` back to `false`** — byte-identical to never having pressed
  // the button, in the one configuration the branch exists for. The shared hook owns both outcomes,
  // and names this sitting in what it announces, for the same reason the button's own label does.
  const clipboard = useClipboardCopy({
    copiedMessage: `Report copied to the clipboard — ${label}.`,
    failedMessage: `Could not reach the clipboard. Select the report text and copy it by hand.`,
  });

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
          clipboard.copy(formatSitting(sitting));
        }}
      >
        Copy report
      </Button>
      {/* The visible cue only. The hook announces through the app's one polite region, so a second
          `aria-live` here would read the same sentence twice to the same reader. */}
      <span className="text-muted-foreground text-xs">
        {clipboard.state === 'copied' ? 'Copied.' : ''}
        {clipboard.state === 'failed' ? 'Could not copy.' : ''}
      </span>
    </span>
  );
}
