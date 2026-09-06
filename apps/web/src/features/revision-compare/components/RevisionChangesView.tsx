import type { RevisionChangeReport, RevisionClassAssessment } from '@repo/types';
import * as React from 'react';
import { useEffect, useId, useRef } from 'react';

import {
  changesAnnouncement,
  CHANGES_FOOTER,
  classCountSentence,
  classTitle,
  notAssessableSentence,
} from '../model/change-sentences';

import { useAnnounce } from '@/components/ui/announcer';

/**
 * **The change list** — what was added, removed, renamed, re-coded, re-typed, re-durationed,
 * re-dated, and what happened to criticality, between two of a plan's revisions.
 *
 * A view of the existing comparison dock rather than a fifth docked column. `RIGHT_DOCKS` holds one
 * dock at a time and a planner comparing revisions wants the delta and the change list to be two
 * ways of reading **one** comparison, not two things competing for the same edge.
 *
 * ## What it is careful about
 *
 * A class that could not be assessed renders its **reason** and no rows, and its count line is
 * withheld entirely — a "0" would be a claim about the plan that nobody is in a position to make.
 * That distinction is the epic: the register's own recurring failure is an absence a reader cannot
 * tell from a fact.
 *
 * Rows are in **programme order and never ranked by size**. A change list sits beside a completion
 * that moved, and a list sorted biggest-first is a ranking of blame — which the epic refused on
 * measurement, because per-change attribution was order-dependent while the total was not. The
 * ordering is the server's; this component does not re-sort.
 */
export interface RevisionChangesViewProps {
  readonly report: RevisionChangeReport;
  /** Select and reveal an activity in whichever view is showing. */
  readonly onActivateActivity: (activityId: string) => void;
  /** Ids present in the LIVE plan — a row for something since deleted must not offer to reveal it. */
  readonly liveActivityIds: ReadonlySet<string>;
}

function ClassSection({
  assessment,
  onActivateActivity,
  liveActivityIds,
}: {
  assessment: RevisionClassAssessment;
  onActivateActivity: (activityId: string) => void;
  liveActivityIds: ReadonlySet<string>;
}): React.ReactElement {
  const headingId = useId();
  const count = classCountSentence(assessment);
  const reason =
    assessment.notAssessableReason === null
      ? null
      : notAssessableSentence(assessment.notAssessableReason, assessment.changeClass);

  return (
    <section aria-labelledby={headingId} className="space-y-1">
      {/* **h3, not h4.** `MovedSection` sits at the same depth in the same panel and uses h3
          under the panel's sr-only h2; an h4 here skips a level, which axe reports and which
          leaves a heading-navigating reader unable to tell whether this section is a child of the
          last one. Caught by this view's own axe case rather than by reading. */}
      <h3 id={headingId} className="text-sm font-medium">
        {classTitle(assessment.changeClass)}
      </h3>
      {reason !== null ? (
        // The reason IS the content. Rendered as ordinary prose rather than an error tone: a class
        // nobody recorded is not a fault, and dressing it as one would push a planner to go looking
        // for something to fix.
        <p className="text-muted-foreground text-xs">{reason}</p>
      ) : (
        <>
          <p className="text-muted-foreground text-xs">{count}</p>
          {assessment.rows.length > 0 && (
            <ul className="space-y-0.5">
              {assessment.rows.map((row) => {
                const reachable = liveActivityIds.has(row.activityId);
                return (
                  <li key={`${row.changeClass}:${row.activityId}`}>
                    <button
                      type="button"
                      // Shaded with a reason rather than omitted (ADR-0082): comparing two
                      // baselines can name an activity that has since been deleted, and a control
                      // that navigates nowhere is worse than one that says why.
                      aria-disabled={!reachable}
                      onClick={() => {
                        if (reachable) onActivateActivity(row.activityId);
                      }}
                      className="hover:bg-muted/60 flex w-full items-baseline gap-2 rounded px-1 py-0.5 text-left text-xs aria-disabled:pointer-events-none aria-disabled:opacity-50"
                    >
                      {/* No weight. The code already reads as the row's subject because the
                          values beside it are `text-muted-foreground`; adding weight on top would
                          be a second channel doing the first one's job, and the weight ratchet
                          exists to catch exactly that. The heading below KEEPS its weight, because
                          it matches `MovedSection`'s h3 in the same panel and dropping it would
                          make one view's headings lighter than the other's for no reason. */}
                      <span>{row.code ?? row.name}</span>
                      <span className="text-muted-foreground truncate">
                        {row.from ?? '—'} → {row.to ?? '—'}
                      </span>
                      {!reachable && (
                        <span className="sr-only">
                          Not in the live plan, so it cannot be shown in the diagram.
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

export function RevisionChangesView({
  report,
  onActivateActivity,
  liveActivityIds,
}: RevisionChangesViewProps): React.ReactElement {
  const announce = useAnnounce();
  const footerId = useId();

  // Once per settled report, never per render — the ADR-0079 stale-debounce lesson: a re-render
  // must not re-arm the message, or a later one overwrites it four jumps in.
  const spokenRef = useRef<RevisionChangeReport | null>(null);
  useEffect(() => {
    if (spokenRef.current === report) return;
    spokenRef.current = report;
    announce(changesAnnouncement(report.classes));
  }, [report, announce]);

  return (
    // `aria-describedby` rather than trailing prose: a landmark-navigating reader lands INSIDE a
    // region and would never meet a caveat that is merely printed after it (the ADR-0073 C2.5
    // finding).
    <div
      data-revision-changes-view
      aria-label="Changes between these revisions"
      aria-describedby={footerId}
      role="group"
      className="space-y-3"
    >
      {report.classes.map((assessment) => (
        <ClassSection
          key={assessment.changeClass}
          assessment={assessment}
          onActivateActivity={onActivateActivity}
          liveActivityIds={liveActivityIds}
        />
      ))}
      <p id={footerId} className="text-muted-foreground border-t pt-2 text-xs">
        {CHANGES_FOOTER}
      </p>
    </div>
  );
}
