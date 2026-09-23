import type {
  DiagnosticUnit,
  StaffDiagnosticRow,
  StaffDiagnostics,
} from '../api/staff-diagnostics';

/**
 * What one diagnostic says on screen, in words.
 *
 * **The two zero shapes are different facts and are said differently** — the distinction ADR-0073
 * C1's accessibility gate found collapsed into one sentence on the audit log, where "nothing
 * recorded yet" and "nothing matches what you asked for" both rendered as "Showing 0 events". Here
 * it is "no work of this shape exists on this installation" against "none of it is affected", and a
 * reader acting on the first would go looking for a defect in a population that does not exist.
 *
 * **The noun comes from the row's `unit`, never from a literal here** (`docs/TECH_DEBT.md` #362).
 * It was hard-coded to "activities", so the two diagnostics that do not count activities — one
 * counting plans, one counting baselines — reported their counts as counts of activities on the one
 * screen whose whole purpose is to give a count its denominator correctly. The registry entry knows
 * what it asked about; this function did not, and said so anyway.
 *
 * Pure and exported so the copy is assertable from literals rather than only by driving a panel —
 * the `formatProbeReport` precedent, and what stops the screen and the pasted block disagreeing
 * about the same reading.
 */
export function diagnosticSentence(row: StaffDiagnosticRow): string {
  const { one, many } = UNIT_NOUNS[row.unit];
  if (row.examined === 0) {
    return 'No work of this shape exists on this installation, so there was nothing to examine.';
  }
  if (row.affected === 0) {
    return `None of the ${count(row.examined, one, many)} examined is affected.`;
  }
  // **The distribution clause is withheld when the unit IS a plan, and the test is the UNIT rather
  // than `affected === affectedPlans`.** For `visual-placement-plans` that equality is structural —
  // the registry says so in its own words — so "1 of 4 plans, across 1 plan" offers two numbers
  // that can never differ, which reads as information and is not. A value test would instead
  // withhold it from an ACTIVITY diagnostic whose rows happened to land one per plan, hiding a real
  // fact exactly when it is most surprising: an absence a reader cannot tell from a fact, which is
  // the ADR-0073 C3.1 rule. The count is still printed by {@link diagnosticBreakdown}.
  const spread = row.unit === 'plan' ? '' : `across ${count(row.affectedPlans, 'plan', 'plans')} `;
  return (
    `${String(row.affected)} of ${count(row.examined, one, many)}, ` +
    spread +
    `in ${count(row.affectedOrganizations, 'organisation', 'organisations')}.`
  );
}

/**
 * The noun each unit is counted in — **total over the vocabulary, so the compiler asks the
 * question** the day a fourth grain joins the registry (`docs/TECH_DEBT.md` #362).
 *
 * The plurals live here rather than on the wire because this module is the single renderer of these
 * sentences, for the screen and the pasted block alike; its own docblocks say so. The server sends
 * a closed literal instead of a `{ one, many }` pair so that gate S-1's exception list stays backed
 * by a vocabulary somebody had to write down — see the registry's `DIAGNOSTIC_UNITS` for why that
 * deviates from #362's prescribed remedy.
 */
const UNIT_NOUNS: Record<DiagnosticUnit, { one: string; many: string }> = {
  activity: { one: 'activity', many: 'activities' },
  plan: { one: 'plan', many: 'plans' },
  baseline: { one: 'baseline', many: 'baselines' },
};

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
 * — which is nearly everybody who will later read the pasted block. A **retrospective** entry sizes
 * whose stored numbers changed meaning when a release landed, so the count says who to tell rather
 * than what to fix.
 *
 * Driven off `row.nature` rather than written as one sentence on the panel, because a global
 * sentence is true only by coincidence: the day a prospective diagnostic is added it would lie, and
 * nothing would fail. **That prediction came true one level down** (`docs/TECH_DEBT.md` #377): the
 * `prospective` branch read "this sizes work that is wrong now", and the nine one-planning-surface
 * counts that arrived are mostly ordinary use — "Plans carrying a hand-placed activity" was being
 * called a fault on the live panel. A prospective count describes the installation now; only its
 * question says whether that is a problem, so the sentence says exactly that and no more.
 */
export function natureSentence(row: StaffDiagnosticRow): string {
  return row.nature === 'retrospective'
    ? 'Retrospective: this sizes work whose stored numbers changed meaning when a past release ' +
        'landed. A count here is who to tell, not what is broken now.'
    : 'Live: this counts the installation as it stands now. Whether a count is a problem ' +
        'depends on the question — some count ordinary use.';
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
