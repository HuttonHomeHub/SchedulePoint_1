import { loadFixture } from '@repo/engine-conformance';
import type { SeedSpec } from '@repo/seed';

/**
 * **Is every capability the app claims reachable in a plan a person can read?** (ADR-0066 M2.2)
 *
 * The fixture carries a `coverage_index` — 117 named capabilities mapped to the objects that
 * exercise them — which turns that question from a matter of opinion into a computation. This module
 * runs it: every key is either **reached** by a capability plan (an activity in it carries the key
 * in `testTags`) or **explicitly excepted with a reason**. There is no third state, and the test
 * beside this file fails on one.
 *
 * The exception list is the valuable half. Each entry is a capability the engine implements and the
 * **product cannot author** — a gap the ADR-0034 conformance suite is structurally unable to see,
 * because it feeds the engine directly. Growing this list is how the catalogue reports what it found;
 * an exception with a vague reason is worse than a failing test.
 */

/** A capability key that no capability plan can reach, and why. */
export interface CoverageException {
  reason: string;
  /** The `docs/TECH_DEBT.md` entry tracking it, where one exists. */
  debt: number | null;
}

/**
 * Capabilities the **application** cannot express, grouped by cause.
 *
 * Every one of these is green in the ADR-0034 goldens: the engine implements it, storage holds it,
 * and no client can create it. That asymmetry is precisely what ADR-0066 was written to surface.
 */
export const UNREACHABLE: Readonly<Record<string, CoverageException>> = {
  // ── The SEEDER still sends a weekday mask, not shift windows (TECH_DEBT #80, narrowed) ─────
  // This block used to say "no write path accepts shift windows", which was true when it was
  // written and stopped being true in api-v0.34.0: `CreateCalendarDto.shifts` takes them, and the
  // flagged web editor authors them. What remains is narrower and belongs here rather than to the
  // API — a `SeedSpec` calendar carries working DAYS, so the seeder has nothing to send. Reaching
  // these four needs the SeedSpec model to carry windows, not another API change.
  cal_split_shift: {
    reason: 'the SeedSpec sends a weekday mask, not shift windows — the API now takes either',
    debt: 80,
  },
  cal_night_crosses_midnight: {
    reason: 'the SeedSpec sends a weekday mask, not shift windows — the API now takes either',
    debt: 80,
  },
  cal_asymmetric_week: {
    reason: 'the SeedSpec sends a weekday mask, not shift windows — the API now takes either',
    debt: 80,
  },
  cal_forces_split: {
    reason: 'the SeedSpec sends a weekday mask, not shift windows — the API now takes either',
    debt: 80,
  },
  // ── Expressible now, but no catalogue plan seeds one (TECH_DEBT #79, narrowed) ─────────────
  // These two were excepted as "a mask of 0 is a 422". That stopped being true in api-v0.34.0, and
  // the seeder now sends 0 rather than refusing, so the *cause* recorded here was wrong. What is
  // still true is smaller and is stated instead of inherited: no plan in the catalogue has a
  // window-only calendar, so nothing demonstrates the capability end to end. The remedy is a seed
  // plan, not another API change — which is a different piece of work from the one #79 tracked.
  cal_window_only: {
    reason: 'creatable since api-v0.34.0 and the seeder sends it; no catalogue plan has one yet',
    debt: 79,
  },
  cal_empty_base_week: {
    reason: 'creatable since api-v0.34.0 and the seeder sends it; no catalogue plan has one yet',
    debt: 79,
  },

  // ── No concept in the application at all (ADR-0039; reported as unplaceable by the fixture) ──
  res_role: {
    reason: 'SchedulePoint has no role model; a resource is assigned directly',
    debt: null,
  },
  res_assignment_lag: {
    reason: 'an assignment has no lag field: work starts with its activity',
    debt: null,
  },
} as const;

export interface CoverageRow {
  key: string;
  /** Seed names of the capability plans reaching it; empty when unreached. */
  reachedBy: string[];
  exception: CoverageException | null;
}

export interface CoverageReport {
  rows: CoverageRow[];
  reached: number;
  excepted: number;
  /** Keys that are neither reached nor excepted. A non-empty list is a **gap in the catalogue**. */
  missing: string[];
}

/** Every capability key the fixture names, in its own order. */
export function capabilityKeys(): string[] {
  const fixture = loadFixture() as unknown as { coverage_index: Record<string, unknown> };
  return Object.keys(fixture.coverage_index);
}

/** Which capability plans reach which keys — the computation this module exists for. */
export function coverageReport(specs: readonly SeedSpec[]): CoverageReport {
  const reachedBy = new Map<string, string[]>();
  for (const spec of specs) {
    for (const activity of spec.activities) {
      for (const tag of activity.testTags) {
        const seen = reachedBy.get(tag);
        if (seen === undefined) reachedBy.set(tag, [spec.seedName]);
        else if (!seen.includes(spec.seedName)) seen.push(spec.seedName);
      }
    }
  }

  const rows = capabilityKeys().map((key) => ({
    key,
    reachedBy: reachedBy.get(key) ?? [],
    exception: UNREACHABLE[key] ?? null,
  }));

  return {
    rows,
    reached: rows.filter((row) => row.reachedBy.length > 0).length,
    excepted: rows.filter((row) => row.reachedBy.length === 0 && row.exception !== null).length,
    missing: rows
      .filter((row) => row.reachedBy.length === 0 && row.exception === null)
      .map((row) => row.key),
  };
}

/**
 * Tags a plan carries that are **not** capability keys. A typo in a `testTags` string is otherwise
 * completely silent: the key it meant to reach stays unreached and something that looks like
 * coverage is recorded against a name nothing asks about.
 */
export function unknownTags(specs: readonly SeedSpec[]): string[] {
  const known = new Set(capabilityKeys());
  const seen = new Set<string>();
  for (const spec of specs) {
    for (const activity of spec.activities) {
      for (const tag of activity.testTags) if (!known.has(tag)) seen.add(tag);
    }
  }
  return [...seen].sort();
}

/** A one-screen rendering for the CLI, listing every gap and every exception with its reason. */
export function formatCoverage(report: CoverageReport): string {
  const total = report.rows.length;
  const lines = [
    `Capability coverage: ${report.reached}/${total} reached, ${report.excepted} excepted, ` +
      `${report.missing.length} missing`,
    '',
  ];
  for (const row of report.rows.filter((r) => r.reachedBy.length === 0 && r.exception !== null)) {
    const debt = row.exception?.debt === null ? '' : ` (TECH_DEBT #${String(row.exception?.debt)})`;
    lines.push(`  excepted  ${row.key.padEnd(38)} ${row.exception?.reason ?? ''}${debt}`);
  }
  for (const key of report.missing) {
    lines.push(`  MISSING   ${key}`);
  }
  lines.push('');
  lines.push(
    report.missing.length === 0
      ? '  Every capability is either demonstrated by a plan or excepted with a reason.'
      : `  ${report.missing.length} capability key(s) have no plan and no exception.`,
  );
  return lines.join('\n');
}
