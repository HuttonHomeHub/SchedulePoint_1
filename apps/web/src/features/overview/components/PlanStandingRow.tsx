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
            className={
              tone === 'warning' ? 'text-warning-text text-sm' : 'text-muted-foreground text-sm'
            }
          >
            {movementSentence(standing.baselineMovement)}
          </p>
          {flags.length > 0 ? (
            // Each flag is its own line rather than a joined sentence: they are independent
            // problems with independent remedies, and a comma-separated run reads as one.
            <ul className="text-warning-text text-sm">
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
          <p className="text-muted-foreground text-sm">No finish date yet</p>
        ) : (
          <p className="text-sm">
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
