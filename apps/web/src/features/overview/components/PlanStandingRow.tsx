import type { PlanStanding } from '@repo/types';
import { Link } from '@tanstack/react-router';

import {
  FINISH_LABEL,
  NO_FINISH_SENTENCE,
  STALE_FIGURES_SENTENCE,
  flagSentences,
  movementSentence,
  movementTone,
} from '../model/standing-copy';

import { Badge } from '@/components/ui/badge';
import { ListRow, RowSubject, rowLinkClass } from '@/components/ui/page';
import { formatCalendarDate } from '@/lib/format-date';

/**
 * One programme in "Where the work stands".
 *
 * **Every fact is a sentence and nothing is a dash** (ADR-0061's `ContextStrip` finding): a row of
 * em dashes for an uncalculated plan reads as breakage rather than as "there is nothing here yet",
 * and the reader cannot tell which. So a plan with no finish says it has none, in words that name
 * the next step.
 *
 * **Direction is the word, not the colour** (WCAG 1.4.1) — see `model/standing-copy.ts`, which owns
 * every **sentence** so they can be tested as strings and scanned by the copy gate in one place.
 * Sentence is meant literally and the boundary is worth stating, because the first version of this
 * docblock claimed the module owned every string and the M6 component review found two sitting in
 * the JSX: a **state** sentence is the module's ("No finish date yet"), and so is the fixed label
 * beside the date, while the value itself is formatted by the shared `formatCalendarDate` and the
 * plan's own name is data.
 *
 * The finish date carries `<time dateTime>` for the same reason the changed-at does: people
 * accountable for dates need the exact one, and a hover `title` is invisible to keyboard and touch
 * (`docs/UX_STANDARDS.md` §6). Its visible form comes from **`lib/format-date.ts`, not a local
 * formatter** — the same review found this row building an `Intl.DateTimeFormat` per render with
 * the BROWSER's locale, where every other calendar date in the product is a module-scoped en-GB
 * formatter. Two dates on one screen in different day/month orders is the defect, and the test
 * written for it had been softened to tolerate it rather than the inconsistency being removed.
 *
 * **The three `data-overview-*` attributes are FC-1's hooks, and they are here because the harness
 * could not otherwise ask the question it exists to ask.** `measure-overview.mjs` locates each of
 * Q5/Q6/Q7 by one of them; it runs inside `page.evaluate`, where a CSS selector cannot compute an
 * implicit role, and the facts themselves are sentences whose words legitimately vary by state. The
 * harness named all four at M0 as "absent today"; M2 and M3 then shipped the answers and neither
 * grew the hook, so FC-1 would have reported four absences over a screen that answers all seven —
 * the harness's own recorded failure mode (`FC-1: 0 of 7` over a page plainly on screen), one turn
 * along. Note BOTH finish branches carry it: measuring only the happy one would grade a state the
 * fixture's uncalculated plan is never in. Precedent: `data-toolbar-item`,
 * `data-revision-compare-panel`.
 */
export function PlanStandingRow({
  standing,
  orgSlug,
}: {
  standing: PlanStanding;
  orgSlug: string;
}): React.ReactElement {
  const tone = movementTone(standing.baselineMovement);
  const flags = flagSentences(standing.flags);

  return (
    <ListRow
      primary={
        <>
          <RowSubject
            name={
              <Link
                to="/orgs/$orgSlug/plans/$planId"
                params={{ orgSlug, planId: standing.planId }}
                className={rowLinkClass}
              >
                {standing.planName}
              </Link>
            }
            badge={
              standing.status === 'DRAFT' ? (
                <Badge size="sm" className="shrink-0">
                  Draft
                </Badge>
              ) : null
            }
            context={`${standing.projectName} · ${standing.clientName}`}
          />
          <p
            data-overview-variance
            className={
              tone === 'warning' ? 'text-warning-text text-sm' : 'text-muted-foreground text-sm'
            }
          >
            {movementSentence(standing.baselineMovement)}
            {standing.editedSinceCalculated ? (
              /*
                **The caveat rides the sentence it qualifies rather than sitting under it** (M9 D2).
                It has to be adjacent to that number — M5's reorder put this section above "Recently
                changed", so the sentence that used to cover these figures is a section away
                (see `STALE_FIGURES_SENTENCE`) — and a line of its own cost 20 px on a screen whose
                whole problem was height. Same adjacency, one line instead of two.

                The separator is a middot rather than a comma because the two are independent
                statements about the row, not one sentence; the caveat keeps `--warning-text` even
                where the movement beside it is neutral, since it is a caution about the figure
                whatever the figure says.
              */
              <span className="text-warning-text"> · {STALE_FIGURES_SENTENCE}</span>
            ) : null}
          </p>
          {flags.length > 0 ? (
            /*
              **The flags run inline, and this reverses the reasoning that used to sit here.**
              It read: "Each flag is its own line rather than a joined sentence: they are
              independent problems with independent remedies, and a comma-separated run reads as
              one." That is sound and was overturned on a cost it did not have (M9 D3): a plan
              carrying all four flags was a SEVEN-line row, and in a box with a height budget that
              is one plan filling the box.

              What the old reasoning was protecting survives where it is load-bearing — this is
              still a `role="list"` of `role="listitem"`s, so an assistive reader hears four
              problems rather than one sentence. The visual separator is the concession; the
              semantics are not. The row's height is now bounded: one line for one flag or for
              four, rather than one line each.

              **That intent depends on the list being ANNOUNCED as a list, and by default it is
              not.** Tailwind v4's Preflight sets `list-style: none` on every `ul` and `ol`, which
              is a documented cause of WebKit/VoiceOver dropping the implicit `list`/`listitem`
              roles — so the roles are explicit here, exactly as ADR-0122 made them explicit for
              the WBS band's group list. This is the third instance of that pattern in this
              codebase and the first that shipped without the fix; the M6 accessibility review
              caught it (WCAG 2.2 §1.3.1, level A).

              **The unit case below it cannot see this, and the fix does not change that.**
              `plan-standing-row.test.tsx` asserts `getAllByRole('listitem')` and passed against
              the broken markup, because jsdom's role computation does not model a CSS-triggered
              role suppression at all. So a green suite is not evidence here — the precedent is.
            */
            // eslint-disable-next-line jsx-a11y/no-redundant-roles -- ADR-0122, see above.
            <ul
              role="list"
              data-overview-flags
              className="text-warning-text flex flex-wrap gap-x-2 text-sm"
            >
              {flags.map((sentence, index) => (
                // eslint-disable-next-line jsx-a11y/no-redundant-roles -- see the `ul` above.
                <li role="listitem" key={sentence}>
                  {/*
                    The separator is a sibling rather than a `::before`, and rendered only between
                    items, because a CSS-generated one is read aloud by some screen readers and
                    would turn "1 constraint broken by logic" into "middot 1 constraint broken by
                    logic" — the flags are already a list and do not need a spoken bullet.
                  */}
                  {index > 0 ? <span aria-hidden="true">· </span> : null}
                  {sentence}
                </li>
              ))}
            </ul>
          ) : null}
        </>
      }
      trailing={
        standing.projectFinish === null ? (
          // Not a dash and not blank. The reason it has no finish is already in the movement
          // sentence, so this says only that there is nothing to show HERE.
          <p data-overview-finish className="text-muted-foreground text-sm">
            {NO_FINISH_SENTENCE}
          </p>
        ) : (
          <p data-overview-finish className="text-sm">
            <span className="text-muted-foreground">{FINISH_LABEL} </span>
            {/*
              `formatCalendarDate` rather than a local formatter, and it is called only on the
              non-null branch — **the null branch above is the reason, not an accident.** That
              helper renders an em dash for `null`, which is exactly the thing this row must never
              show (ADR-0061), so reaching for it without the branch would reintroduce the defect
              the sentences exist to remove.
            */}
            <time dateTime={standing.projectFinish}>
              {formatCalendarDate(standing.projectFinish)}
            </time>
          </p>
        )
      }
    />
  );
}
