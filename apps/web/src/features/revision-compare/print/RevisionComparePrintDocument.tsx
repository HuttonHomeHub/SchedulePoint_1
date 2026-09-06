import type { RevisionClassAssessment, RevisionCompare, RevisionMovedActivity } from '@repo/types';

import './RevisionComparePrintDocument.css';

import {
  CHANGES_FOOTER,
  classCountSentence,
  classTitle,
  notAssessableSentence,
} from '../model/change-sentences';
import {
  carrierChangedSentence,
  completionSentence,
  criticalPathUnavailable,
  HONESTY_FOOTER,
  membershipSentence,
  LEVELLING_CAVEAT_PRINT,
  settingsCaveat,
  sideTitle,
} from '../model/revision-sentences';

import { mountPrintDocument, type PrintDocumentDeps } from '@/lib/print-document';

/**
 * **The printed revision comparison** (revision M3-T2) — what moved between two revisions, as a
 * paper document a planner hands to somebody who was not in the room.
 *
 * Built from the SAME payload the panel renders, through the SAME sentence functions — one
 * derivation, not two (the ADR-0063 M5 rule: two answers to one question differ eventually, and
 * only in a printed document, where nobody is watching). Mounted through `mountPrintDocument`,
 * never a print stylesheet over the live panel: the panel is a scrollable column, and printing it
 * would emit whichever rows were scrolled into view — a comparison silently truncated to a scroll
 * position, which looks complete and is not.
 *
 * **Three things paper needs more than the screen does.**
 *
 * 1. **The cap is stated in words.** Paper has no "load more", so a list that simply stops is
 *    indistinguishable from a complete one (ADR-0100's rule, and the health report's CQ-5).
 * 2. **Provenance is on the page**: both sides' identity, and — when the later side is LIVE — the
 *    instant the comparison was taken, because "live" means something different tomorrow. The
 *    health epic's M5 ux review found the printout more honest than the live panel; this document
 *    and the panel carry the same facts, so neither can be the more honest one.
 * 3. **The honesty footer prints too.** A page that lists what entered the critical path and omits
 *    "this does not say what caused it" is the one most likely to be read as blame, because paper
 *    outlives the conversation it came from.
 *
 * Reasons print as SENTENCES, never codes — a `PLAN_NOT_SCHEDULED` reaching paper is the defect the
 * unit suite greps for.
 */
export function RevisionComparePrintDocument({
  compare,
  printedAt = new Date(),
}: {
  compare: RevisionCompare;
  /** Injectable for the unit suite; callers take the default. */
  printedAt?: Date;
}): React.ReactElement {
  const caveat = settingsCaveat(compare.settingsVerdict);
  const carrierChanged = carrierChangedSentence(compare.completion);
  return (
    <div className="revision-print">
      <header>
        <h1>Revision comparison</h1>
        <p className="revision-print-meta">
          {compare.planName} · {sideTitle(compare.from)} → {sideTitle(compare.to)}
          {compare.from.computedAt === null
            ? null
            : ` · earlier revision captured ${compare.from.computedAt.slice(0, 10)}`}
        </p>
        <p className="revision-print-meta">
          {/* "Live" is not a fixed thing: the same comparison run tomorrow reports different
              numbers, so a printed page comparing against live is only interpretable with the
              instant it was taken. A page dated only by its earlier revision would look
              authoritative and be unreadable a week later. */}
          {compare.to.kind === 'LIVE'
            ? `Compared against the live plan as at ${printedAt.toISOString().slice(0, 16).replace('T', ' ')} UTC`
            : `Later revision captured ${compare.to.computedAt?.slice(0, 10) ?? 'unknown'}`}{' '}
          · printed {printedAt.toISOString().slice(0, 10)}
        </p>
      </header>

      <h2>Completion</h2>
      <p className="revision-print-statement">{completionSentence(compare.completion)}</p>
      {carrierChanged === null ? null : (
        <p className="revision-print-statement">{carrierChanged}</p>
      )}

      {caveat === null ? null : <p className="revision-print-caveat">{caveat}</p>}
      {criticalPathUnavailable(compare.criticalPath.notAssessableReason) !== null ? (
        <p className="revision-print-statement">
          {criticalPathUnavailable(compare.criticalPath.notAssessableReason)}
        </p>
      ) : compare.criticalPath.noCriticalPath ? (
        <p className="revision-print-statement">
          Neither revision has a critical path, so nothing can have entered or left it.
        </p>
      ) : (
        <>
          <PrintedMovedTable
            heading="Entered the critical path"
            rows={compare.criticalPath.entered}
            total={compare.criticalPath.enteredTotal}
            cap={compare.criticalPath.cap}
            emptyMessage="Nothing entered the critical path."
          />
          <PrintedMovedTable
            heading="Left the critical path"
            rows={compare.criticalPath.left}
            total={compare.criticalPath.leftTotal}
            cap={compare.criticalPath.cap}
            emptyMessage="Nothing left the critical path."
          />
          {/* The denominator, on paper as on screen — the two surfaces state the same facts, which
              is the whole point of the D9 rule this epic kept tripping over. */}
          <p className="revision-print-meta">
            {membershipSentence(
              compare.criticalPath.remainedCriticalCount,
              compare.criticalPath.remainedNonCriticalCount,
            )}
          </p>
        </>
      )}

      {compare.criticalPath.addedTotal > 0 || compare.criticalPath.removedTotal > 0 ? (
        <>
          <h2>Added and removed</h2>
          {/* The TRUE totals — the arrays are capped like their siblings, and paper has no
              "load more" to reveal what a client-computed length would have hidden. */}
          <p className="revision-print-statement">
            {compare.criticalPath.addedTotal} added · {compare.criticalPath.removedTotal} removed.
            An activity present in only one revision is listed as added or removed — it did not
            enter or leave a path it was never on.
          </p>
        </>
      ) : null}

      {/* **The change list prints too, and it prints the same honesty the screen shows.**
          ADR-0116 D9 records the inverse as a defect — a printout stating provenance the live
          panel withheld — so the rule here is symmetry rather than "the paper gets more": a class
          the panel says it could not assess says exactly that on paper, and one the panel could
          assess prints its rows. Withheld entirely when the payload carries no change list, so a
          delta-only comparison prints exactly what it always did. */}
      {compare.changes ? (
        <>
          <h2>What changed</h2>
          {compare.changes.classes.map((assessment) => (
            <ChangeClassSection
              key={assessment.changeClass}
              assessment={assessment}
              cap={compare.changes?.cap ?? 0}
            />
          ))}
          <p className="revision-print-footer">{CHANGES_FOOTER}</p>
        </>
      ) : null}

      <p className="revision-print-footer">{HONESTY_FOOTER}</p>
      <p className="revision-print-footer">{LEVELLING_CAVEAT_PRINT}</p>
    </div>
  );
}

/**
 * One movement table. **Every returned row prints**, and where the server capped the set the cap is
 * stated in words with the true total beside it — the sentence matters more here than on screen.
 */
function PrintedMovedTable({
  heading,
  rows,
  total,
  cap,
  emptyMessage,
}: {
  heading: string;
  rows: readonly RevisionMovedActivity[];
  total: number;
  cap: number;
  emptyMessage: string;
}): React.ReactElement {
  return (
    <>
      <h2>
        {heading} ({total})
      </h2>
      {rows.length === 0 ? (
        <p className="revision-print-statement">{emptyMessage}</p>
      ) : (
        <>
          {total > rows.length ? (
            <p className="revision-print-meta">
              Showing the first {cap} of {total}. The remainder is not printed.
            </p>
          ) : null}
          <table>
            <thead>
              <tr>
                <th>Code</th>
                <th>Activity</th>
                <th>Float before</th>
                <th>Float after</th>
                <th>Start after</th>
                <th>Finish after</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.activityId}>
                  <td>{row.code ?? '—'}</td>
                  <td>
                    {row.name}
                    {row.existsLive ? null : ' (not in the live plan)'}
                  </td>
                  {/* An unknown float prints as "unknown", never as a dash that could be read as
                      zero and never as 0 — absence and zero are different facts, kept apart from
                      the engine all the way to the page. */}
                  <td>{floatCell(row.fromTotalFloatDays)}</td>
                  <td>{floatCell(row.toTotalFloatDays)}</td>
                  <td>{row.toEarlyStart ?? '—'}</td>
                  <td>{row.toEarlyFinish ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </>
  );
}

function floatCell(days: number | null): string {
  return days === null ? 'unknown' : `${days} d`;
}

/** Print the comparison — the panel's header button calls this. */
export function printRevisionCompare(compare: RevisionCompare, deps: PrintDocumentDeps = {}): void {
  mountPrintDocument(<RevisionComparePrintDocument compare={compare} />, deps);
}

/**
 * One change class on paper.
 *
 * The cap is stated **in words** rather than implied by a shorter table, for the reason the
 * sibling section records: paper has no "load more", so a reader who is not told the list is
 * truncated has no way to discover it. And a class that could not be assessed prints its REASON
 * and no table — never an empty table, which on paper reads as a searched-and-found-nothing.
 */
function ChangeClassSection({
  assessment,
  cap,
}: {
  assessment: RevisionClassAssessment;
  cap: number;
}): React.ReactElement {
  const count = classCountSentence(assessment);
  const reason =
    assessment.notAssessableReason === null
      ? null
      : notAssessableSentence(assessment.notAssessableReason, assessment.changeClass);

  return (
    <>
      <h3>{classTitle(assessment.changeClass)}</h3>
      {reason !== null ? (
        <p className="revision-print-statement">{reason}</p>
      ) : (
        <>
          <p className="revision-print-meta">{count}</p>
          {assessment.total > assessment.rows.length ? (
            <p className="revision-print-meta">
              Showing the first {cap} of {assessment.total}. The remainder is not printed.
            </p>
          ) : null}
          {assessment.rows.length > 0 ? (
            // `<thead>` so the headings repeat on every page — the native pagination the printed
            // programme relies on (ADR-0059 M4), rather than a fixed header that prints once.
            <table>
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Activity</th>
                  <th>Before</th>
                  <th>After</th>
                </tr>
              </thead>
              <tbody>
                {assessment.rows.map((row) => (
                  <tr key={`${row.changeClass}:${row.activityId}`}>
                    <td>{row.code ?? '—'}</td>
                    <td>{row.name}</td>
                    <td>{row.from ?? '—'}</td>
                    <td>{row.to ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
        </>
      )}
    </>
  );
}
