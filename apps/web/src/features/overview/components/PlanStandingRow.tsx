import type { PlanStanding } from '@repo/types';
import { Link } from '@tanstack/react-router';

import { flagSentences, movementSentence, movementTone } from '../model/standing-copy';

import { Badge } from '@/components/ui/badge';
import { ListRow, rowLinkClass } from '@/components/ui/page';

/**
 * One programme in "Where the work stands".
 *
 * **Every fact is a sentence and nothing is a dash** (ADR-0061's `ContextStrip` finding): a row of
 * em dashes for an uncalculated plan reads as breakage rather than as "there is nothing here yet",
 * and the reader cannot tell which. So a plan with no finish says it has none, in words that name
 * the next step.
 *
 * **Direction is the word, not the colour** (WCAG 1.4.1) — see `model/standing-copy.ts`, which owns
 * every sentence so they can be tested as strings and scanned by the copy gate in one place.
 *
 * The finish date carries `<time dateTime>` for the same reason the changed-at does: people
 * accountable for dates need the exact one, and a hover `title` is invisible to keyboard and touch
 * (`docs/UX_STANDARDS.md` §6).
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
          {flags.length > 0 ? (
            // Each flag is its own line rather than a joined sentence: they are independent
            // problems with independent remedies, and a comma-separated run reads as one.
            <ul data-overview-flags className="text-warning-text text-sm">
              {flags.map((sentence) => (
                <li key={sentence}>{sentence}</li>
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
            No finish date yet
          </p>
        ) : (
          <p data-overview-finish className="text-sm">
            <span className="text-muted-foreground">Finishes </span>
            <time dateTime={standing.projectFinish}>{formatFinish(standing.projectFinish)}</time>
          </p>
        )
      }
    />
  );
}

/**
 * A `YYYY-MM-DD` as a reader's date.
 *
 * Parsed as UTC and formatted in UTC, deliberately: the value is a calendar DATE with no time and
 * no zone, and letting the browser interpret it locally moves it by a day for anyone west of
 * Greenwich — the classic off-by-one that only ever shows up for some readers.
 */
function formatFinish(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
