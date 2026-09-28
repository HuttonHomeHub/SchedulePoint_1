import type { HealthOffender } from '@repo/types';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';

/**
 * **One row's offender disclosure** — the toggle, the truncation line and the offender list
 * (`docs/specs/zero-duration-task/` M3-T0, agreement-round finding C2).
 *
 * Extracted from `HealthMetricRow` so the fourteen DCMA metrics and the "Beyond the DCMA assessment"
 * advisory render one list one way. It takes **no verdict**: an advisory has none, so the thing a
 * metric shows beside its name arrives as the `badge` slot (a verdict word for a metric, a count for
 * an advisory) and the thing after the toggle as `aside` (the metric's tone icon). Everything a row
 * shows between its header and its offender list — measured figures, caveats, remedies — is
 * `children`, so the list stays last, where it always was.
 *
 * The lists carry explicit `role="list"` / `role="listitem"`: Tailwind v4's Preflight sets
 * `list-style: none`, which WebKit/VoiceOver treats as a reason to drop the implicit roles
 * (ADR-0122; agreement-round A3).
 */
export function HealthOffenderDisclosure({
  name,
  badge,
  aside,
  describedBy,
  offenders,
  offenderCount,
  offendersTruncated,
  offenderCap,
  onActivate,
  children,
}: {
  /** The row's name, the toggle's text. */
  name: string;
  /** What sits at the end of the toggle: a metric's verdict word, an advisory's count. */
  badge: ReactNode;
  /** What sits after the toggle in the header row (a metric's tone icon), if anything. */
  aside?: ReactNode;
  /** The id of the sentence that describes the toggle, when the row has one. */
  describedBy?: string | undefined;
  offenders: readonly HealthOffender[];
  offenderCount: number;
  offendersTruncated: boolean;
  offenderCap: number;
  onActivate: (offender: HealthOffender) => void;
  children?: ReactNode;
}): React.ReactElement {
  const [expanded, setExpanded] = useState(false);
  const detailId = useId();
  const hasDisclosure = offenders.length > 0;

  return (
    <>
      <div className="flex min-w-0 items-center gap-2">
        {hasDisclosure ? (
          <button
            type="button"
            aria-expanded={expanded}
            aria-controls={detailId}
            // The measured/threshold sentence below is the button's DESCRIPTION, not adjacency —
            // a Tab-sweeping screen-reader user otherwise hears only "name, verdict" and never the
            // two facts triage runs on (the spec's own §a11y requirement; ADR-0094 M5's rule that
            // the numbers never ride only a visual sibling). The M5 accessibility review caught
            // the unlinked form.
            aria-describedby={describedBy}
            onClick={() => setExpanded((v) => !v)}
            className="hover:bg-accent focus-visible:ring-ring -mx-1 flex min-w-0 flex-1 items-center gap-2 rounded-md px-1 text-left focus-visible:ring-2 focus-visible:outline-none"
          >
            {expanded ? (
              <ChevronDown aria-hidden="true" className="size-3.5 shrink-0" />
            ) : (
              <ChevronRight aria-hidden="true" className="size-3.5 shrink-0" />
            )}
            <span className="min-w-0 flex-1 truncate">{name}</span>
            {badge}
          </button>
        ) : (
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <span aria-hidden="true" className="size-3.5 shrink-0" />
            <span className="min-w-0 flex-1 truncate">{name}</span>
            {badge}
          </div>
        )}
        {aside}
      </div>

      {children}

      {hasDisclosure && expanded ? (
        <div id={detailId} className="pt-1 pl-5">
          {offendersTruncated ? (
            <p className="text-muted-foreground text-xs">
              Showing {Math.min(offenderCap, offenders.length)} of {offenderCount}.
            </p>
          ) : null}
          {/* eslint-disable-next-line jsx-a11y/no-redundant-roles -- ADR-0122, see the docblock. */}
          <ul role="list" className="space-y-0.5">
            {offenders.map((offender) => (
              // eslint-disable-next-line jsx-a11y/no-redundant-roles -- see the `ul` above.
              <li role="listitem" key={`${offender.kind}-${offender.id}`}>
                <button
                  type="button"
                  onClick={() => onActivate(offender)}
                  className="hover:bg-accent focus-visible:ring-ring flex w-full min-w-0 items-baseline gap-2 rounded-md px-1 text-left text-xs focus-visible:ring-2 focus-visible:outline-none"
                >
                  <span className="min-w-0 flex-1 truncate">
                    {offender.code === null ? offender.name : `${offender.code} ${offender.name}`}
                  </span>
                  <span className="text-muted-foreground shrink-0">{offender.note}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </>
  );
}
