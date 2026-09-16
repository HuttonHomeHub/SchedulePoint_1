import type { PlanStanding } from '@repo/types';

import { PlanStandingRow } from './PlanStandingRow';
import { SectionCount } from './SectionCount';

import { EmptyState, SectionCard } from '@/components/ui/page';

/**
 * "Where the work stands" — the programme view the landing never had.
 *
 * **It covers the plans "Recently changed" covers, and says so.** That is a real limit rather than
 * an implementation detail: a reader who assumes this is their whole portfolio would draw the wrong
 * conclusion from a clean list, so the caption names the scope. (M4 may widen it to the whole
 * organisation — gated on a measurement, and withdrawable; if it is withdrawn, this caption is
 * already the truth rather than something that needs walking back.)
 *
 * **No pending or error branch, and no live-region announcement — all three would be dead code.**
 * This section renders only once `planStanding` is present in the payload, which means the one query
 * has already succeeded; a skeleton would additionally have to be drawn before we know whether this
 * reader is entitled to the answer, flashing a frame at a Viewer who never gets one.
 *
 * The announcement is the interesting one. The first version called
 * `useSettledCountAnnouncement({ pending: false, … })` and **could never have fired**: that hook
 * speaks only if it has SEEN `pending: true`, which a section mounted after settle never does. Dead
 * on arrival, looking exactly like a working accessibility affordance (the ADR-0081 shape, one hook
 * down). It is removed rather than revived, because reviving it would be wrong anyway: this screen
 * announces ONCE, from "Recently changed", which speaks for the same eight plans this section
 * describes — neither of the other two sections announces either. A second sentence about one list
 * is noise in the one channel a screen-reader user cannot skim past.
 *
 * **The section is not rendered at all when the caller may not read schedules.** The server omits
 * `planStanding` rather than sending `[]` for exactly that reader (ADR-0098: a zero is a fact about
 * the organisation, an absence is a fact about the reader), and the screen honours the distinction
 * by rendering no frame — ADR-0082's first omit clause at section granularity. A frame headed
 * "Where the work stands" over a permanent empty would assert there is an answer they may not have.
 */
export function WhereWorkStandsSection({
  standing,
  orgSlug,
  fill,
}: {
  standing: PlanStanding[];
  orgSlug: string;
  /** Fill the height the grid gives and scroll the body — see `SectionCard`. */
  fill?: boolean;
}): React.ReactElement {
  return (
    <SectionCard
      title="Where the work stands"
      description="How each recently-changed programme is tracking against its baseline."
      fill={fill}
      action={
        standing.length === 0 ? null : <SectionCount count={standing.length} noun="programme" />
      }
    >
      {standing.length === 0 ? (
        <EmptyState
          size="section"
          title="No programmes to report on yet."
          description="Once a plan has activities and a calculated schedule, it will appear here."
        />
      ) : (
        <div>
          {standing.map((row) => (
            <PlanStandingRow key={row.planId} standing={row} orgSlug={orgSlug} />
          ))}
        </div>
      )}
    </SectionCard>
  );
}
