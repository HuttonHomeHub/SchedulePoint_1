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
  // ── No intraday shift patterns on any write path (TECH_DEBT #80) ───────────────────────────
  // `fullDayShiftsFromMask` in `calendar.repository.ts` derives every calendar's shifts from the
  // weekday mask, on the single create, the update AND the interchange batch. So a calendar day is
  // always the whole day, and ADR-0036's intraday shift patterns — its headline capability — have
  // no author anywhere in the product.
  cal_split_shift: {
    reason: 'a working day is always the full day: no write path accepts shift windows',
    debt: 80,
  },
  cal_night_crosses_midnight: {
    reason: 'needs two adjacent-day windows; no write path accepts shift windows',
    debt: 80,
  },
  cal_asymmetric_week: {
    reason: 'needs different hours per weekday; the mask carries working/not, never hours',
    debt: 80,
  },
  cal_forces_split: {
    reason: 'needs an intraday gap for the work to split across; no write path accepts one',
    debt: 80,
  },

  // ── The weekday mask must name at least one working day (TECH_DEBT #79) ────────────────────
  cal_window_only: {
    reason: 'a non-working base week with dated working windows is a 422: workingWeekdays >= 1',
    debt: 79,
  },
  cal_empty_base_week: {
    reason: 'same @Min(1) on the mask — the engine supports it, the API refuses it',
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
