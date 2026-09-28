import type { HealthOffender } from '@repo/types';

/**
 * **One row's offender list on paper** — the heading, the cap sentence and the list
 * (`docs/specs/zero-duration-task/` M3-T0, agreement-round finding C2).
 *
 * Extracted from `ScheduleHealthPrintDocument` so the DCMA metrics and the advisory print their
 * offenders one way. It takes no verdict. The cap sentence matters more on paper than on screen:
 * paper has no "load more", so a list that simply stops is indistinguishable from a complete one
 * (ADR-0100's rule). Explicit list roles, for the Preflight reason `HealthOffenderDisclosure` gives.
 */
export function HealthOffenderPrintSection({
  name,
  offenders,
  offenderCount,
  offendersTruncated,
  offenderCap,
}: {
  name: string;
  offenders: readonly HealthOffender[];
  offenderCount: number;
  offendersTruncated: boolean;
  offenderCap: number;
}): React.ReactElement {
  return (
    <section>
      <h2>
        {name} — {offenderCount} {offenderCount === 1 ? 'finding' : 'findings'}
      </h2>
      {offendersTruncated ? (
        <p className="health-print-cap">
          Showing the first {Math.min(offenderCap, offenders.length)} of {offenderCount} — open the
          plan for the full list.
        </p>
      ) : null}
      {/* eslint-disable-next-line jsx-a11y/no-redundant-roles -- ADR-0122, see the docblock. */}
      <ul role="list">
        {offenders.map((offender) => (
          // eslint-disable-next-line jsx-a11y/no-redundant-roles -- see the `ul` above.
          <li role="listitem" key={`${offender.kind}-${offender.id}`}>
            {offender.code === null ? offender.name : `${offender.code} ${offender.name}`} —{' '}
            {offender.note}
          </li>
        ))}
      </ul>
    </section>
  );
}
