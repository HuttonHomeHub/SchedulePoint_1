import type { ScheduleHealthReport } from '@repo/types';

import './HealthPrintDocument.css';

import { buildHealthRows } from '../model/health-rows';

import { mountPrintDocument, type PrintDocumentDeps } from '@/lib/print-document';

/**
 * **The printed health report** (health M4) — the DCMA 14-point assessment as a paper document a
 * planner puts in a submission pack.
 *
 * Built from the SAME report object the panel renders, through the same `buildHealthRows` — one
 * derivation, not two (the ADR-0063 M5 rule: two answers to one question differ eventually, and
 * only in a printed document). Mounted through `mountPrintDocument`, never a print stylesheet over
 * the live panel: the panel is a scrollable column, and printing it would emit whichever rows were
 * scrolled into view — a report silently truncated to a scroll position, which looks complete and
 * is not (`lib/print-document.ts`'s own founding rule).
 *
 * **Every offender list prints, up to the payload's cap, and a truncated list says so in words**
 * (CQ-5, decided 2026-08-27). The rejected compact alternative is recorded because it is the
 * tempting one: a page reading "Missing logic — Fail — 41" gives a QS nothing to act on. And the
 * cap sentence matters MORE on paper than on screen — paper has no "load more", so a list that
 * simply stops is indistinguishable from a complete one (ADR-0100's rule).
 *
 * Reasons print as SENTENCES, never codes — `NO_ACTIVE_BASELINE` reaching paper is the defect the
 * unit suite greps for.
 */
export function ScheduleHealthPrintDocument({
  report,
}: {
  report: ScheduleHealthReport;
}): React.ReactElement {
  const rows = buildHealthRows(report);
  return (
    <div className="health-print">
      <header>
        <h1>Schedule health check</h1>
        <p className="health-print-meta">
          {report.planName} · data date {report.dataDate} ·{' '}
          {report.computedAt === null
            ? 'never calculated'
            : `calculated ${report.computedAt.slice(0, 10)}`}{' '}
          · {report.schedulingMode === 'EARLY' ? 'Early' : 'Visual'} scheduling · baseline:{' '}
          {report.baseline?.name ?? 'none'}
        </p>
        <p className="health-print-meta">
          {report.summary.failed} failed · {report.summary.passed} passed ·{' '}
          {report.summary.notAssessable} not assessed · {report.summary.informational} informational
          — over {report.activityCount} activities and {report.relationshipCount} relationships
        </p>
      </header>

      <table>
        <thead>
          <tr>
            <th scope="col">#</th>
            <th scope="col">Metric</th>
            <th scope="col">Verdict</th>
            <th scope="col">Measured</th>
            <th scope="col">Judged against</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.metric.id}>
              <td>{row.metric.ordinal}</td>
              <td>{row.metric.name}</td>
              <td>{row.verdictLabel}</td>
              <td>{row.measuredLabel ?? '—'}</td>
              <td>{row.thresholdLabel ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {rows.some((row) => row.reasonSentence !== null) ? (
        <section>
          <h2>Not assessed, and why</h2>
          <ul>
            {rows
              .filter((row) => row.reasonSentence !== null)
              .map((row) => (
                <li key={row.metric.id}>
                  <strong>{row.metric.name}:</strong> {row.reasonSentence}
                </li>
              ))}
          </ul>
        </section>
      ) : null}

      {rows
        .filter((row) => row.metric.offenders.length > 0)
        .map((row) => (
          <section key={row.metric.id}>
            <h2>
              {row.metric.name} — {row.metric.offenderCount}{' '}
              {row.metric.offenderCount === 1 ? 'finding' : 'findings'}
            </h2>
            {row.metric.offendersTruncated ? (
              <p className="health-print-cap">
                Showing the first {Math.min(report.offenderCap, row.metric.offenders.length)} of{' '}
                {row.metric.offenderCount} — open the plan for the full list.
              </p>
            ) : null}
            <ul>
              {row.metric.offenders.map((offender) => (
                <li key={`${offender.kind}-${offender.id}`}>
                  {offender.code === null ? offender.name : `${offender.code} ${offender.name}`} —{' '}
                  {offender.note}
                </li>
              ))}
            </ul>
          </section>
        ))}

      <footer>
        <p>
          Assessed against the DCMA 14-Point Assessment conventions; each metric&apos;s bar is
          printed in the &ldquo;Judged against&rdquo; column, from the same figures the application
          applied. Resources (metric 10) reads resource-assignment existence only, so this document
          is identical for every reader regardless of role. This report describes how the plan is
          built; it is separate from the issues a recalculation finds, and the two can honestly
          disagree about negative float.
        </p>
      </footer>
    </div>
  );
}

/** Mount, print and tear down — the Gantt programme's lifecycle, reused verbatim. */
export function printHealthReport(
  report: ScheduleHealthReport,
  deps: PrintDocumentDeps = {},
): void {
  mountPrintDocument(<ScheduleHealthPrintDocument report={report} />, deps);
}
