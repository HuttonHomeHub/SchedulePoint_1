import type { SeedUnplaceable } from '@repo/seed';

/**
 * What a seed run did, and — more importantly — what it could not do (ADR-0066).
 *
 * The shape follows `@repo/interchange`'s `InterchangeReport` on purpose: the same rule applies, that
 * **nothing is dropped silently**. A reader must be able to tell three different things apart, and a
 * bare success/failure cannot:
 *
 * - **unplaceable** — the application has no concept for this at all (the fixture's roles,
 *   activity-code types and UDF definitions). Not a bug; a boundary.
 * - **approximated** — it was created, but not faithfully. The API is day-denominated, so an hour
 *   duration is rounded (TECH_DEBT #77). The seeded plan is then a *near* copy, and saying so is the
 *   difference between a test bed and a trap.
 * - **finding** — the API refused something a Planner should be able to do. This is a **product**
 *   defect the seed run discovered, and the run continues so that one gap does not hide the rest.
 */
export interface SeedApproximation {
  entity: string;
  sourceRef: string | null;
  detail: string;
  reason: string;
}

export interface SeedFinding {
  entity: string;
  sourceRef: string | null;
  /** The API's own machine-readable code, so a reader can grep for it. */
  code: string;
  detail: string;
}

export interface SeedPlanResult {
  seedName: string;
  planId: string | null;
  counts: {
    calendars: number;
    resources: number;
    activities: number;
    dependencies: number;
    assignments: number;
  };
  /** Wall-clock, recorded rather than asserted — hardware varies and a threshold here would lie. */
  seedMs: number;
  recalculateMs: number | null;
  unplaceable: SeedUnplaceable[];
  approximations: SeedApproximation[];
  findings: SeedFinding[];
}

export interface SeedReport {
  baseUrl: string;
  orgSlug: string;
  projectId: string;
  plans: SeedPlanResult[];
}

/** A one-screen summary for the console. The full report is written as JSON beside it. */
export function formatReport(report: SeedReport): string {
  const lines: string[] = [`Seeded into ${report.orgSlug} (${report.baseUrl})`, ''];
  for (const plan of report.plans) {
    const status = plan.planId === null ? 'FAILED' : 'ok';
    lines.push(
      `  ${status.padEnd(7)} ${plan.seedName} — ${plan.counts.activities} activities, ` +
        `${plan.counts.dependencies} links, ${plan.counts.resources} resources ` +
        `(${plan.seedMs} ms seed${plan.recalculateMs === null ? '' : `, ${plan.recalculateMs} ms recalc`})`,
    );
    for (const item of plan.findings) {
      lines.push(`      FINDING  ${item.code} on ${item.entity} — ${item.detail}`);
    }
    for (const item of plan.approximations) {
      lines.push(`      approx   ${item.entity} ${item.sourceRef ?? ''} — ${item.detail}`);
    }
    if (plan.unplaceable.length > 0) {
      const kinds = [...new Set(plan.unplaceable.map((u) => u.entity))].join(', ');
      lines.push(
        `      absent   ${plan.unplaceable.length} object(s) with no concept here: ${kinds}`,
      );
    }
  }
  const findings = report.plans.reduce((n, p) => n + p.findings.length, 0);
  lines.push('');
  lines.push(
    findings === 0
      ? '  No findings: everything the catalogue asked for, the API allowed.'
      : `  ${findings} finding(s) — the API refused something a Planner should be able to do.`,
  );
  return lines.join('\n');
}
