import type { UseQueryResult } from '@tanstack/react-query';
import { useId, useRef, useState } from 'react';

import type { ProbeResultRow } from '../api/probe-results';
import type { Sitting } from '../model/sitting';
import { sittingSpreadMs, sittingsFromRows, SITTING_SPREAD_LIMIT_MS } from '../model/sitting';
import {
  EXPECTED_READINGS,
  describeReadings,
  sittingCaveats,
  sittingIndexRow,
  verdictSegment,
  type SittingIndexRow,
} from '../model/sitting-index';

import { CAP_ID, READING_COLUMNS, SittingBlock, settled } from './sitting-block';

import { useAnnounce } from '@/components/ui/announcer';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTable, type Column } from '@/components/ui/data-table';
import { SubSection } from '@/components/ui/page';

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
            // focus, so nothing about the press announces itself. `StatusSection`'s polite region is the
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
      <SubSection title="All sittings" />
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
    // `relative`: the reason below is `sr-only` (absolute), and without a positioned ancestor it
    // escapes the table's scroll region and widens the page at 320 px.
    <div className="relative">
      <Button
        variant="outline"
        size="sm"
        // Named for its own sitting: fifteen of these on screen, and an assistive-technology user
        // browsing by button list meets a column of identical "Show" entries otherwise. The same
        // reason the Copy button carries its sitting's caption.
        aria-label={`Show ${row.when} — ${row.kind}`}
        {...(isShown ? { 'aria-disabled': true, 'aria-describedby': reasonId } : {})}
        // **Shaded at rest, so no `pointer-events-none`** (#458): the sitting already shown is
        // `aria-disabled` for as long as it stays shown, and a pointer-inert control hands the
        // pointer to whatever is behind it. The hover fill is cancelled instead, which is the
        // looks-live-but-refuses defect ADR-0082 exists to remove, and `onClick` refuses the press.
        className="aria-disabled:hover:bg-background aria-disabled:hover:text-foreground aria-disabled:opacity-60"
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
    </div>
  );
}
