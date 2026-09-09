import type {
  CrossPlanChangeReport,
  CrossPlanClassAssessment,
  RevisionChangeReport,
  RevisionClassAssessment,
} from '@repo/types';
import * as React from 'react';
import { useEffect, useId, useRef } from 'react';

import {
  changesAnnouncement,
  CHANGES_FOOTER,
  classCountSentence,
  classTitle,
  notAssessableSentence,
} from '../model/change-sentences';
import { otherPlanRowNote } from '../model/revision-sentences';

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
  /**
   * **One view renders both kinds.** A cross-plan row's `activityId` is nullable, so the union is
   * what forces the "nothing to reveal" case to be answered rather than remembered.
   */
  readonly report: RevisionChangeReport | CrossPlanChangeReport;
  /** Select and reveal an activity in whichever view is showing. */
  readonly onActivateActivity: (activityId: string, name?: string) => void;
  /**
   * Cross-plan only: the OTHER plan's name, printed where a row's activation control would be.
   *
   * A `REMOVED` row across two plans has no bar on this diagram at all, so the control is omitted
   * (ADR-0082) — and an omission with nothing in its place is indistinguishable from a control
   * that failed to render. Naming the plan is the explanation the absence owes.
   */
  readonly otherPlanName?: string | undefined;
}

function ClassSection({
  assessment,
  onActivateActivity,
  otherPlanName,
}: {
  assessment: RevisionClassAssessment | CrossPlanClassAssessment;
  onActivateActivity: (activityId: string, name?: string) => void;
  otherPlanName?: string | undefined;
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
                const reasonId = `revision-change-reason-${row.subjectId}`;
                // **The SERVER's answer, not the client's inference.** Deriving this from the
                // delta's rows shaded any activity the delta never mentioned — which, once the
                // paid classes landed, is most of the list: moving an activity to another lane or
                // reporting progress against it changes no criticality. The sentence below would
                // then have said "not in the live plan" about a bar the reader can see.
                /**
                 * **Two absences, one of which is not a state to explain** — the panel's own
                 * `MovedRow` rule, applied here so the two views cannot treat one row differently.
                 *
                 * A null `activityId` (cross-plan only) means the row lives in the OTHER plan and
                 * has no bar on this diagram at all, so revealing it does not apply to the object:
                 * the control is omitted. `existsLive === false` with a real id is the same-plan
                 * case — deleted since — which IS a state, so it is shaded with a reason. Reusing
                 * one treatment for both would either promise an action that can never arrive or
                 * withhold the explanation for one that could.
                 */
                const activityId = row.activityId;
                const reachable = activityId !== null && row.existsLive;
                if (activityId === null) {
                  return (
                    <li
                      key={row.subjectId}
                      // `min-w-0` on the row AND on each growing child: a flex item defaults to
                      // `min-width: auto`, so `truncate` cannot engage inside one and a long
                      // activity or plan name overflows the 380 px panel rather than clipping.
                      // The sibling `RevisionCorrelationSummary` already pairs the two correctly.
                      className="flex w-full min-w-0 items-baseline gap-2 px-1 py-0.5 text-xs"
                    >
                      <span className="min-w-0 truncate">{row.code ?? row.name}</span>
                      <span className="text-muted-foreground min-w-0 truncate">
                        {row.from ?? '—'} → {row.to ?? '—'}
                      </span>
                      {otherPlanName === undefined ? null : (
                        // The explanation the omission owes: an omitted control with nothing in
                        // its place is indistinguishable from one that failed to render.
                        <span className="text-muted-foreground shrink-0">
                          {otherPlanRowNote(otherPlanName)}
                        </span>
                      )}
                    </li>
                  );
                }
                return (
                  <li key={row.subjectId}>
                    <button
                      type="button"
                      // Shaded with a reason rather than omitted (ADR-0082): comparing two
                      // baselines can name an activity that has since been deleted, and a control
                      // that navigates nowhere is worse than one that says why.
                      aria-disabled={!reachable}
                      // **The reason is a DESCRIPTION, never part of the name.** It was a child of
                      // this button, so it concatenated into the accessible name and a reader
                      // browsing the list heard the whole sentence as the row's label. `MovedRow`
                      // in the sibling panel has said so in a docblock since it shipped, and
                      // ADR-0109 records this codebase paying to fix the same thing once already.
                      // Two independent reviews found it here; the unit case could not, because a
                      // `{ name: /A10/ }` regex matches a polluted name just as well.
                      {...(reachable ? {} : { 'aria-describedby': reasonId })}
                      onClick={() => {
                        // The name travels WITH the id: this row knows it, and the panel's
                        // lookup covers only the delta's rows (see `announceActivation`).
                        if (reachable) onActivateActivity(activityId, row.name);
                      }}
                      className="hover:bg-muted/60 flex w-full min-w-0 items-baseline gap-2 rounded px-1 py-0.5 text-left text-xs aria-disabled:pointer-events-none aria-disabled:opacity-50"
                    >
                      {/* No weight. The code already reads as the row's subject because the
                          values beside it are `text-muted-foreground`; adding weight on top would
                          be a second channel doing the first one's job, and the weight ratchet
                          exists to catch exactly that. The heading below KEEPS its weight, because
                          it matches `MovedSection`'s h3 in the same panel and dropping it would
                          make one view's headings lighter than the other's for no reason. */}
                      <span className="min-w-0 truncate">{row.code ?? row.name}</span>
                      <span className="text-muted-foreground min-w-0 truncate">
                        {row.from ?? '—'} → {row.to ?? '—'}
                      </span>
                      {/*
                        **The reason, VISIBLE — not only to a screen reader.**

                        The delta view states the identical fact in plain text a sighted planner can
                        read (`· not in the live plan`), and this view stated it only in an
                        `sr-only` span: switching tabs turned a dimmed, unclickable row into one
                        with nothing saying why. The panel's own rule is "shaded with a reason,
                        never silently inert", and it was failing in one of its two
                        implementations. Found by the M4 ux review. The `sr-only` sibling below
                        stays, because it is the DESCRIPTION — folding the reason into the
                        accessible name is the defect ADR-0117 records one control along.
                      */}
                      {reachable ? null : (
                        <span className="text-muted-foreground shrink-0" aria-hidden="true">
                          · not in the live plan
                        </span>
                      )}
                    </button>
                    {!reachable && (
                      <span id={reasonId} className="sr-only">
                        This activity is not in the live plan, so it cannot be shown on the diagram.
                      </span>
                    )}
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
  otherPlanName,
}: RevisionChangesViewProps): React.ReactElement {
  const announce = useAnnounce();
  const footerId = useId();

  // Once per settled report, never per render — the ADR-0079 stale-debounce lesson: a re-render
  // must not re-arm the message, or a later one overwrites it four jumps in.
  const spokenRef = useRef<RevisionChangeReport | CrossPlanChangeReport | null>(null);
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
      {/*
        **The summary, on screen and not only announced.** It was computed for the live region and
        thrown away for everybody else, so a sighted planner met fourteen equally-weighted sections
        — most of them saying "No changes in this revision." — with nothing at the top telling them
        how many changes there are or how many categories could not be compared. The M8 ux review
        found it; the sentence already existed.
      */}
      {/* No weight: the border and the position at the head of the list carry the emphasis, and
          the weight ratchet exists to stop a second channel doing the first one's job. */}
      <p className="text-muted-foreground border-b pb-2 text-xs">
        {changesAnnouncement(report.classes)}
      </p>
      {report.classes.map((assessment) => (
        <ClassSection
          key={assessment.changeClass}
          assessment={assessment}
          onActivateActivity={onActivateActivity}
          otherPlanName={otherPlanName}
        />
      ))}
      <p id={footerId} className="text-muted-foreground border-t pt-2 text-xs">
        {CHANGES_FOOTER}
      </p>
    </div>
  );
}
