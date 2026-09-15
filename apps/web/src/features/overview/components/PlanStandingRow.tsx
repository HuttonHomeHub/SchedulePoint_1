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
import { ListRow, rowLinkClass } from '@/components/ui/page';
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
          <p className="flex items-center gap-2">
            <Link
              to="/orgs/$orgSlug/plans/$planId"
              params={{ orgSlug, planId: standing.planId }}
              className={rowLinkClass}
            >
              {standing.planName}
            </Link>
            {standing.status === 'DRAFT' ? (
              <Badge size="sm" className="shrink-0">
                Draft
              </Badge>
            ) : null}
          </p>
          <p className="text-muted-foreground truncate text-sm">
            {standing.projectName} · {standing.clientName}
          </p>
          <p
            data-overview-variance
            className={
              tone === 'warning' ? 'text-warning-text text-sm' : 'text-muted-foreground text-sm'
            }
          >
            {movementSentence(standing.baselineMovement)}
          </p>
          {standing.editedSinceCalculated ? (
            /*
              The caveat sits directly under the number it qualifies, which is the whole point:
              M5's reorder put this section above "Recently changed", so the sentence that used to
              cover these figures is now a section away. See `STALE_FIGURES_SENTENCE`.
            */
            <p className="text-warning-text text-sm">{STALE_FIGURES_SENTENCE}</p>
          ) : null}
          {flags.length > 0 ? (
            /*
              Each flag is its own line rather than a joined sentence: they are independent
              problems with independent remedies, and a comma-separated run reads as one.

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
            <ul role="list" data-overview-flags className="text-warning-text text-sm">
              {flags.map((sentence) => (
                // eslint-disable-next-line jsx-a11y/no-redundant-roles -- see the `ul` above.
                <li role="listitem" key={sentence}>
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
