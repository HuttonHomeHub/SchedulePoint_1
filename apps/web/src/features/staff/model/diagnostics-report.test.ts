import { describe, expect, it } from 'vitest';

import type { StaffDiagnosticRow, StaffDiagnostics } from '../api/staff-diagnostics';

import {
  diagnosticBreakdown,
  diagnosticSentence,
  diagnosticsStatus,
  formatDiagnosticsReport,
  natureSentence,
} from './diagnostics-report';

function row(overrides: Partial<StaffDiagnosticRow> = {}): StaffDiagnosticRow {
  return {
    id: 'day-factor-divergence',
    label: 'Day factor divergence (driving resource)',
    nature: 'retrospective',
    unit: 'activity',
    examined: 1284,
    affected: 17,
    affectedPlans: 3,
    affectedOrganizations: 1,
    elapsedMs: 214,
    ...overrides,
  };
}

const result: StaffDiagnostics = {
  takenAt: '2026-09-13T14:02:11.482Z',
  apiVersion: '0.63.0',
  diagnostics: [row()],
};

describe('diagnosticSentence', () => {
  it('gives the count its denominator', () => {
    // A count on its own lets a reader conclude a defect is large when it is a rounding error.
    expect(diagnosticSentence(row())).toBe(
      '17 of 1284 activities, across 3 plans in 1 organisation.',
    );
  });

  it('separates "nothing to examine" from "nothing affected"', () => {
    // Two different facts, and a reader acting on the first would go looking for a defect in a
    // population that does not exist. The audit log collapsed exactly this distinction once
    // (ADR-0073 C1) and the accessibility gate caught it.
    expect(diagnosticSentence(row({ examined: 0, affected: 0 }))).toContain(
      'No work of this shape exists',
    );
    expect(diagnosticSentence(row({ examined: 1284, affected: 0 }))).toBe(
      'None of the 1284 activities examined is affected.',
    );
  });

  it('names the unit the diagnostic actually counts', () => {
    // `docs/TECH_DEBT.md` #362: the noun was a hard-coded literal, so `visual-placement-plans` —
    // whose denominator is `FROM plans` — reported its plan count as a count of activities, on the
    // one screen whose entire purpose is to state a count's denominator correctly.
    expect(
      diagnosticSentence(
        row({
          id: 'visual-placement-plans',
          unit: 'plan',
          examined: 4,
          affected: 1,
          affectedPlans: 1,
        }),
      ),
    ).toBe('1 of 4 plans, in 1 organisation.');

    expect(
      diagnosticSentence(row({ id: 'baselines-over-placed-plans', unit: 'baseline', affected: 2 })),
    ).toBe('2 of 1284 baselines, across 3 plans in 1 organisation.');

    expect(diagnosticSentence(row({ unit: 'baseline', examined: 7, affected: 0 }))).toBe(
      'None of the 7 baselines examined is affected.',
    );
  });

  it('withholds the plan spread only when the unit IS a plan', () => {
    // The discriminator is the unit, never `affected === affectedPlans`. A value test would hide a
    // real spread from an ACTIVITY diagnostic whose rows happened to land one per plan — an absence
    // a reader cannot tell from a fact.
    expect(diagnosticSentence(row({ affected: 3, affectedPlans: 3 }))).toBe(
      '3 of 1284 activities, across 3 plans in 1 organisation.',
    );
    expect(diagnosticSentence(row({ unit: 'plan', affected: 3, affectedPlans: 3 }))).not.toContain(
      'across',
    );
  });

  it('agrees in number with what it is counting', () => {
    expect(diagnosticSentence(row({ examined: 1, affected: 1, affectedPlans: 1 }))).toBe(
      '1 of 1 activity, across 1 plan in 1 organisation.',
    );
    expect(
      diagnosticSentence(row({ affected: 2, affectedPlans: 2, affectedOrganizations: 2 })),
    ).toContain('across 2 plans in 2 organisations');
  });
});

describe('diagnosticBreakdown', () => {
  it('agrees in number with what it is counting', () => {
    // The line this replaces was written inline in the component with a hard-coded plural, so on a
    // single-organisation installation — the commonest shape there is, and the one the ADR's own
    // example uses — it printed "1 organisations". Two renderings of the same numbers, one right.
    expect(diagnosticBreakdown(row({ affectedPlans: 1, affectedOrganizations: 1 }))).toBe(
      '1284 examined · 17 affected · 1 plan · 1 organisation · 214 ms',
    );
    expect(diagnosticBreakdown(row())).toContain('3 plans · 1 organisation');
  });
});

describe('natureSentence', () => {
  it('says a retrospective count is who to tell, not what is broken', () => {
    // The misreading this panel is most likely to produce: "17 of 1,284" reads as "17 activities
    // are wrong right now" to anybody who has not read ADR-0139.
    expect(natureSentence(row())).toMatch(/Retrospective/);
    expect(natureSentence(row())).toMatch(/not what is broken now/);
  });

  it('says the opposite for a live one, so the sentence cannot go stale', () => {
    // The reason this is a FIELD and not one sentence on the panel: a global sentence would be
    // true only by coincidence, and would lie the day a prospective diagnostic is added.
    expect(natureSentence(row({ nature: 'prospective' }))).toMatch(/Live/);
    expect(natureSentence(row({ nature: 'prospective' }))).not.toMatch(/Retrospective/);
  });

  it('does not call a live count a fault, because most live counts are ordinary use (#377)', () => {
    // "Plans carrying a hand-placed activity" is prospective and is not a defect; the sentence
    // used to say "work that is wrong now" about it and eight siblings on the deployed panel.
    const sentence = natureSentence(row({ nature: 'prospective' }));
    expect(sentence).not.toMatch(/wrong|broken|defect|fault/i);
    expect(sentence).toMatch(/as it stands now/);
  });
});

describe('diagnosticsStatus', () => {
  it('says nothing until there is something to say', () => {
    // Empty while pending is the whole mechanism behind `Panel`'s polite region: it is mounted
    // before the answer exists, so filling it later is a change a screen reader speaks.
    expect(diagnosticsStatus(undefined)).toBe('');
  });

  it('names the questions that found something, rather than summing them', () => {
    expect(diagnosticsStatus(result)).toBe(
      'Diagnostics complete. Day factor divergence (driving resource): 17.',
    );
  });

  it('says so plainly when nothing is affected', () => {
    expect(diagnosticsStatus({ ...result, diagnostics: [row({ affected: 0 })] })).toBe(
      'Diagnostics complete. Nothing affected in 1 check.',
    );
  });
});

describe('formatDiagnosticsReport', () => {
  it('carries when it was taken and which build produced it', () => {
    // The block is the deliverable, not the panel (ADR-0128 / ADR-0130). A number pasted into a
    // record is comparable with one taken a release later only if it says which release it is.
    const report = formatDiagnosticsReport(result);

    expect(report).toContain('taken at     2026-09-13T14:02:11.482Z');
    expect(report).toContain('API version  0.63.0');
  });

  it('prints every count beside the denominator it is a fraction of', () => {
    const report = formatDiagnosticsReport(result);

    expect(report).toContain('examined               1284');
    expect(report).toContain('affected               17');
    expect(report).toContain('affected plans         3');
    expect(report).toContain('affected organisations 1');
  });

  it('prints a zero rather than omitting the row', () => {
    // `docs/TECH_DEBT.md` #86's plan task says so in as many words: a zero is the strongest
    // possible answer to that question and must not be left unstated. An omitted row is
    // indistinguishable from a diagnostic that failed.
    const report = formatDiagnosticsReport({
      ...result,
      diagnostics: [row({ examined: 0, affected: 0, affectedPlans: 0, affectedOrganizations: 0 })],
    });

    expect(report).toContain('Day factor divergence (driving resource)');
    expect(report).toContain('examined               0');
    expect(report).toContain('No work of this shape exists');
  });

  it('states what the route will not do, so a reader of the record knows what it is not', () => {
    expect(formatDiagnosticsReport(result)).toContain('accepts no parameter');
  });

  it('says what a non-zero count MEANS, beside every count', () => {
    // The block is what gets pasted into `docs/TECH_DEBT.md` #86, where its reader has none of the
    // context the panel's reader had. A number without this sentence is a number that will be
    // read as a live defect.
    expect(formatDiagnosticsReport(result)).toMatch(/Retrospective: this sizes work whose stored/);
  });

  it('names every registry entry it was given', () => {
    const report = formatDiagnosticsReport({
      ...result,
      diagnostics: [row(), row({ id: 'inherited-day-factor', label: 'Inherited', affected: 4 })],
    });

    expect(report).toContain('(day-factor-divergence)');
    expect(report).toContain('(inherited-day-factor)');
  });
});
