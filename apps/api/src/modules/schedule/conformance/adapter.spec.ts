import { loadFixture } from '@repo/engine-conformance';
import { describe, expect, it } from 'vitest';

import { computeSchedule } from '../engine';

import { adaptFixture } from './adapter';

/**
 * Adapter tests (ADR-0034 §2, §7). Two jobs: prove the adapter's **classification
 * is honest** (the right rows are excluded/approximated, for the right reasons),
 * and prove the supported subset **schedules structurally** — a 119-activity real
 * network exercising all four relationship kinds runs clean, which is the
 * structural-regression half of the M1 safety net (dates here are a degradation,
 * not a golden — see `goldens.ts` for date assertions).
 */
describe('conformance adapter', () => {
  const fixture = loadFixture();
  const network = adaptFixture(fixture);

  it('classifies the fixture into the supported subset with honest counts', () => {
    // 103 TASK + 4 START_MS + 12 FINISH_MS supported; 5 LOE + 3 WBS + 2 RESOURCE_DEPENDENT excluded.
    expect(network.report.supportedActivities).toBe(119);
    expect(network.report.excludedActivities).toBe(10);
    expect(network.report.supportedRelationships).toBe(169);
    expect(network.report.excludedRelationships).toBe(19);
    expect(network.activities).toHaveLength(119);
    expect(network.edges).toHaveLength(169);
  });

  it('records why each unsupported feature was dropped, never faking it', () => {
    const kinds = new Set(network.report.notes.map((n) => n.kind));
    // Unsupported activity types are excluded with a reason.
    expect(network.report.notes.filter((n) => n.kind === 'type-unsupported')).toHaveLength(10);
    // The five fractional-day tasks are rounded (hours restored in M1).
    expect(network.report.notes.filter((n) => n.kind === 'duration-rounded')).toHaveLength(5);
    // Sixteen progressed activities have their progress ignored (no progress model yet).
    expect(network.report.notes.filter((n) => n.kind === 'progress-ignored')).toHaveLength(16);
    // The one 24H lag-calendar override and the one secondary constraint are dropped.
    expect(network.report.notes.filter((n) => n.kind === 'lag-calendar-dropped')).toHaveLength(1);
    expect(
      network.report.notes.filter((n) => n.kind === 'secondary-constraint-dropped'),
    ).toHaveLength(1);
    // AS_LATE_AS_POSSIBLE is dropped as an unmodelled constraint.
    expect(
      network.report.notes.some(
        (n) => n.kind === 'constraint-dropped' && n.reason.includes('as-late-as-possible'),
      ),
    ).toBe(true);
    // Every edge dropped for an excluded endpoint is recorded.
    expect(network.report.notes.filter((n) => n.kind === 'endpoint-excluded')).toHaveLength(19);
    // The plan-wide degradations are spelled out.
    expect(network.report.approximations.length).toBeGreaterThanOrEqual(4);
    expect(kinds.has('type-unsupported')).toBe(true);
  });

  it('never emits an edge to an excluded activity (the graph stays a valid DAG)', () => {
    const ids = new Set(network.activities.map((a) => a.id));
    for (const edge of network.edges) {
      expect(ids.has(edge.predecessorId)).toBe(true);
      expect(ids.has(edge.successorId)).toBe(true);
    }
  });

  it('schedules the supported subset without error and produces complete dates', () => {
    const output = computeSchedule(network.activities, network.edges, network.options);
    expect(output.summary.activityCount).toBe(119);
    expect(output.results).toHaveLength(119);
    expect(output.summary.projectFinish).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    for (const result of output.results) {
      expect(result.earlyStart).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(result.earlyFinish).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(result.lateStart).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(result.lateFinish).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});
