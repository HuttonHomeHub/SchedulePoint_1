import type { StaffDiagnosticRow, StaffDiagnostics } from '../api/staff-diagnostics';

/**
 * What one diagnostic says on screen, in words.
 *
 * **The two zero shapes are different facts and are said differently** — the distinction ADR-0073
 * C1's accessibility gate found collapsed into one sentence on the audit log, where "nothing
 * recorded yet" and "nothing matches what you asked for" both rendered as "Showing 0 events". Here
 * it is "no work of this shape exists on this installation" against "none of it is affected", and a
 * reader acting on the first would go looking for a defect in a population that does not exist.
 *
 * Pure and exported so the copy is assertable from literals rather than only by driving a panel —
 * the `formatProbeReport` precedent, and what stops the screen and the pasted block disagreeing
 * about the same reading.
 */
export function diagnosticSentence(row: StaffDiagnosticRow): string {
  if (row.examined === 0) {
    return 'No work of this shape exists on this installation, so there was nothing to examine.';
  }
  if (row.affected === 0) {
    return `None of the ${count(row.examined, 'activity', 'activities')} examined is affected.`;
  }
  return (
    `${String(row.affected)} of ${count(row.examined, 'activity', 'activities')}, ` +
    `across ${count(row.affectedPlans, 'plan', 'plans')} ` +
    `in ${count(row.affectedOrganizations, 'organisation', 'organisations')}.`
  );
}

/**
 * The whole panel's one-line status, for the polite region `Panel` owns.
 *
 * It names the questions rather than summing them. Two diagnostics ask different questions of
 * different populations, so a total would be a number with no meaning — and the panel exists
 * because meaningless-looking-authoritative numbers are what `psql` produces at 2am.
 */
export function diagnosticsStatus(result: StaffDiagnostics | undefined): string {
  if (result === undefined) return '';
  const affected = result.diagnostics.filter((row) => row.affected > 0);
  if (affected.length === 0) {
    return `Diagnostics complete. Nothing affected in ${count(result.diagnostics.length, 'check', 'checks')}.`;
  }
  return `Diagnostics complete. ${affected
    .map((row) => `${row.label}: ${String(row.affected)}`)
    .join('; ')}.`;
}

/**
 * The paste-ready block, and **this is the deliverable rather than the panel** (the ADR-0128 /
 * ADR-0130 rule): a number that stays on one operator's screen answers nothing. It is pasted into
 * `docs/TECH_DEBT.md` #86's owed M0-T3, so it must carry everything needed to argue with it —
 * when it was taken, which build produced it, and the denominator each count is a fraction of.
 *
 * **A zero is printed, never omitted.** #86's own plan task says so in as many words: a zero is the
 * strongest possible answer to that question and must not be left unstated. An omitted row is
 * indistinguishable from a diagnostic that failed.
 *
 * Pure: no clipboard, no DOM, no clock. Every line below is assertable from a literal.
 */
export function formatDiagnosticsReport(result: StaffDiagnostics): string {
  const lines = [
    'SchedulePoint staff diagnostics',
    '',
    `  taken at     ${result.takenAt}`,
    `  API version  ${result.apiVersion}`,
    '',
  ];

  for (const row of result.diagnostics) {
    lines.push(
      `${row.label} (${row.id})`,
      `  examined               ${String(row.examined)}`,
      `  affected               ${String(row.affected)}`,
      `  affected plans         ${String(row.affectedPlans)}`,
      `  affected organisations ${String(row.affectedOrganizations)}`,
      `  elapsed                ${String(row.elapsedMs)} ms`,
      `  ${diagnosticSentence(row)}`,
      `  ${natureSentence(row)}`,
      '',
    );
  }

  lines.push(
    'Counts only. No plan, client, project or activity is named at any size, and the route',
    'accepts no parameter — see ADR-0140 for why both of those are the decision rather than',
    'an omission.',
  );

  return lines.join('\n');
}

/**
 * **What a non-zero count means, which is the sentence the M4 UX review found missing everywhere.**
 *
 * "17 of 1,284" reads as "17 activities are broken right now" to anybody who has not read ADR-0139
 * — which is nearly everybody who will later read the pasted block. Both of today's diagnostics are
 * **retrospective**: they size whose stored numbers changed meaning when a release landed, so the
 * count says who to tell rather than what to fix.
 *
 * Driven off `row.nature` rather than written as one sentence on the panel, because a global
 * sentence is true only by coincidence: the day a prospective diagnostic is added it would lie, and
 * nothing would fail.
 */
export function natureSentence(row: StaffDiagnosticRow): string {
  return row.nature === 'retrospective'
    ? 'Retrospective: this sizes work whose stored numbers changed meaning when a past release ' +
        'landed. A count here is who to tell, not what is broken now.'
    : 'Live: this sizes work that is wrong now.';
}

/**
 * The figures, in one place, so the screen and the pasted block cannot word them differently.
 *
 * Exported because it is copy — the one line of it that was written inline in the component printed
 * "1 organisations" on the commonest installation shape there is, because it hard-coded the plural
 * while the sentence above it singularised correctly through {@link count}. Two renderings of the
 * same numbers, one of them right.
 */
export function diagnosticBreakdown(row: StaffDiagnosticRow): string {
  return [
    `${String(row.examined)} examined`,
    `${String(row.affected)} affected`,
    count(row.affectedPlans, 'plan', 'plans'),
    count(row.affectedOrganizations, 'organisation', 'organisations'),
    `${String(row.elapsedMs)} ms`,
  ].join(' · ');
}

function count(n: number, singular: string, plural: string): string {
  return `${String(n)} ${n === 1 ? singular : plural}`;
}
