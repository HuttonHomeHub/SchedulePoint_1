import type { ActivitySummary } from '@repo/types';

import { selectedActivityFacts } from '../model/selected-activity-facts';

import type { BarDateSource } from '@/lib/bar-dates';

/**
 * **The selected activity's facts, in the row the instruction occupies** (share-link guest only;
 * `docs/specs/guest-activity-details/` §4.2).
 *
 * A read-only `<dl>` with no interactive child, the `ContextStrip` contract: nothing in it takes
 * focus, so no focus rule applies. It carries no `aria-label`: a name on a bare `<dl>` is not announced
 * reliably, and the subject leads the list, so the list says whose facts these are. It is a standing condition and not an event (ADR-0132), so it is
 * not a live region and announces nothing; the selection is already spoken once, as the option's own
 * sentence. It leads with its subject (ADR-0187); the subject wraps and is never cut (ADR-0184),
 * and each fact is `whitespace-nowrap` so a narrow row wraps whole facts. `min-h-5` holds the
 * instruction's 20 px line box, so selecting cannot shrink the row and a short name cannot grow it.
 */
export function GuestSelectionFacts({
  activity,
  barDateSource,
  withCodes,
}: {
  activity: ActivitySummary;
  barDateSource: BarDateSource;
  withCodes: boolean;
}): React.ReactElement {
  const { subject, scheduled, facts } = selectedActivityFacts(activity, barDateSource, withCodes);
  return (
    <dl
      data-testid="guest-selection-facts"
      className="m-0 flex min-h-5 flex-wrap items-baseline gap-x-3 gap-y-0 text-xs"
    >
      <div className="text-foreground font-semibold">
        <dt className="sr-only">Activity</dt>
        <dd className="m-0">{subject}</dd>
      </div>
      {scheduled ? null : (
        <div className="text-muted-foreground whitespace-nowrap">
          <dt className="sr-only">Schedule</dt>
          <dd className="m-0">Not yet scheduled</dd>
        </div>
      )}
      {facts.map((fact) => (
        <div key={fact.label} className="inline-flex gap-1 whitespace-nowrap">
          <dt className="text-muted-foreground">{fact.label}</dt>
          <dd className="text-foreground m-0">
            {fact.value}
            {fact.note ? ` · ${fact.note}` : ''}
          </dd>
        </div>
      ))}
    </dl>
  );
}
