import { loadFixture } from '@repo/engine-conformance';
import { describe, expect, it } from 'vitest';

import { computeSchedule } from '../engine';

import { adaptFixture } from './adapter';

/**
 * Adapter tests (ADR-0034 §2, §7). Two jobs: prove the adapter's **classification
 * is honest** (the right rows are excluded/approximated, for the right reasons),
 * and prove the supported subset **schedules structurally** — a 129-activity real
 * network exercising all four relationship kinds runs clean, which is the
 * structural-regression half of the M1 safety net (dates here are a degradation,
 * not a golden — see `goldens.ts` for date assertions).
 */
describe('conformance adapter', () => {
  const fixture = loadFixture();
  const network = adaptFixture(fixture);

  it('classifies the fixture into the supported subset with honest counts', () => {
    // 103 TASK + 4 START_MS + 12 FINISH_MS + 5 LOE + 3 WBS + 2 RESOURCE_DEPENDENT (M7) supported —
    // every fixture activity type now schedules, so nothing is excluded and the 9 relationships that
    // touched the (previously excluded) resource activities are retained.
    expect(network.report.supportedActivities).toBe(129);
    expect(network.report.excludedActivities).toBe(0);
    expect(network.report.supportedRelationships).toBe(188);
    expect(network.report.excludedRelationships).toBe(0);
    expect(network.activities).toHaveLength(129);
    expect(network.edges).toHaveLength(188);
  });

  it('records why each unsupported feature was dropped, never faking it', () => {
    const kinds = new Set(network.report.notes.map((n) => n.kind));
    // Every fixture activity type is now supported (RESOURCE_DEPENDENT landed at M7), so nothing is
    // excluded for its type.
    expect(network.report.notes.filter((n) => n.kind === 'type-unsupported')).toHaveLength(0);
    // Durations/lags are now minute-EXACT (hours × 60, M1/ADR-0036) — nothing rounds away.
    expect(network.report.notes.filter((n) => n.kind === 'duration-rounded')).toHaveLength(0);
    expect(network.report.notes.filter((n) => n.kind === 'lag-rounded')).toHaveLength(0);
    // The honest M5 gap surfaced per-row: 94 supported activities are assigned a calendar
    // other than the plan default (CAL-01) and are scheduled on the default instead (now incl. the
    // two LOE hammocks A1030/A3100, the three WBS summaries W4000/W5000/W7000, and — since M7 — the
    // non-default resource activity A6100 on CAL-06; A8300 is already on CAL-01 so it isn't noted).
    expect(
      network.report.notes.filter((n) => n.kind === 'activity-calendar-substituted'),
    ).toHaveLength(94);
    // Twenty progressed activities have their progress ignored here (now incl. the four in-progress LOEs).
    expect(network.report.notes.filter((n) => n.kind === 'progress-ignored')).toHaveLength(20);
    // The one 24H lag-calendar override is now HONOURED (M3) — no longer dropped.
    expect(network.report.notes.filter((n) => n.kind === 'lag-calendar-dropped')).toHaveLength(0);
    // M4 (ADR-0035 §7/§9/§10/§11) feeds the advanced constraints instead of dropping them: the
    // secondary constraint, expected finish and as-late-as-possible are no longer degradation notes,
    // and every fixture constraint kind is representable, so nothing drops as an unmodelled constraint.
    expect(network.report.notes.filter((n) => n.kind === 'constraint-dropped')).toHaveLength(0);
    // No relationship is dropped for an excluded endpoint any more — every activity type schedules
    // (the 9 ties that touched the resource activities are retained now they're supported).
    expect(network.report.notes.filter((n) => n.kind === 'endpoint-excluded')).toHaveLength(0);
    // The plan-wide degradations are spelled out.
    expect(network.report.approximations.length).toBeGreaterThanOrEqual(4);
    // The honest per-row gap map is still populated (the M5 per-activity-calendar substitutions remain).
    expect(kinds.has('activity-calendar-substituted')).toBe(true);
  });

  it('feeds the M4 advanced constraints through instead of dropping them (ADR-0035 §7/§9/§10/§11)', () => {
    const byId = new Map(network.activities.map((a) => [a.id, a]));
    // A5200 carries its secondary constraint (SNET primary + FNLT secondary, §10).
    expect(byId.get('A5200')).toMatchObject({
      constraintType: 'SNET',
      secondaryConstraintType: 'FNLT',
    });
    // A6200 carries its expected finish (§9), fed unconditionally (the engine acts on it under the option).
    expect(byId.get('A6200')?.expectedFinish).toBe('2026-08-14');
    // A9400's AS_LATE_AS_POSSIBLE maps to the placement flag, not a constraint (§11).
    expect(byId.get('A9400')?.scheduleAsLateAsPossible).toBe(true);
    expect(byId.get('A9400')?.constraintType).toBeUndefined();
    // The mandatory pins pass through as produce-and-flag constraints (§7), no longer parked.
    expect(byId.get('A10100')?.constraintType).toBe('MANDATORY_START');
    expect(byId.get('A10500')?.constraintType).toBe('MANDATORY_FINISH');
  });

  it('maps hour durations/lags faithfully to minutes over the default shift calendar', () => {
    // The whole network is scheduled on the project default (CAL-01).
    expect(network.report.planCalendarId).toBe('CAL-01');
    // Every duration/lag is a whole number of minutes derived from the fixture's hours
    // (× 60) — no day-collapse. Tasks carry positive minutes; milestones are zero.
    for (const activity of network.activities) {
      expect(Number.isInteger(activity.durationMinutes)).toBe(true);
      expect(activity.durationMinutes).toBeGreaterThanOrEqual(0);
    }
    expect(
      network.activities.some((a) => a.durationMinutes > 0 && a.durationMinutes % 60 === 0),
    ).toBe(true);
    for (const edge of network.edges) expect(Number.isInteger(edge.lagMinutes)).toBe(true);
  });

  it('honours the one 24-Hour per-relationship lag calendar (M3, ADR-0036 §6)', () => {
    // The fixture carries exactly one per-edge lag calendar (the concrete-cure A4430→A4440
    // FS + 168h / 24H edge); it now carries an elapsed-lag port, not a dropped note.
    const withLagCalendar = network.edges.filter((e) => e.lagCalendar !== undefined);
    expect(withLagCalendar).toHaveLength(1);
    // The baseline adaptation (honorLagCalendars: false) leaves it on the plan calendar.
    const baseline = adaptFixture(fixture, { honorLagCalendars: false });
    expect(baseline.edges.filter((e) => e.lagCalendar !== undefined)).toHaveLength(0);
    expect(baseline.report.notes.filter((n) => n.kind === 'lag-calendar-dropped')).toHaveLength(1);
  });

  it('substitutes a resource activity’s driving-resource calendar, type-gated (ADR-0035 §23 / ADR-0039, M7)', () => {
    // Flip `honorResourceCalendars` on: a RESOURCE_DEPENDENT activity picks up its DRIVING resource's
    // calendar as its scheduling port (`res_driving` + `res_calendar_drives`); a plain TASK that merely
    // has a resource assigned does NOT (the A5500 contrast — type-gated for free). The DATE differential
    // is proven in the `resource-calendar-drives` golden (a 24/7 driving crew vs a Mon–Fri plan); on the
    // real fixture A8300's driver RCAL-SPECIALIST is a COMPRESSED 4-day week (Mon–Thu ×10h) with the SAME
    // weekly capacity as the plan's 5-day ×8h, so its 3-week span lands the same date — a documented
    // capacity-equivalence (like S13), which is why we assert the wiring structurally here.
    const baseById = new Map(network.activities.map((a) => [a.id, a]));
    const resourced = adaptFixture(fixture, { honorResourceCalendars: true });
    const resById = new Map(resourced.activities.map((a) => [a.id, a]));

    // A8300 (RESOURCE_DEPENDENT) is driven by AS0039 → LAB-EI-SPEC on RCAL-SPECIALIST. Baseline: its own
    // calendar is CAL-01 (= the plan default), so no port. With resource calendars on it schedules on the
    // driving resource's calendar (a port is now attached) — the driver was picked and its calendar drives.
    expect(baseById.get('A8300')?.calendar).toBeUndefined();
    expect(resById.get('A8300')?.calendar).toBeDefined();

    // A5500 is a TASK_DEPENDENT that HAS a resource assignment (AS0021 → LAB-STEEL on CAL-02) but is not
    // resource-dependent, so it never picks up the resource's calendar (`type_task_vs_resource_contrast`).
    // With per-activity calendars off it stays portless in both — the resource calendar is type-gated out.
    expect(resById.get('A5500')?.calendar).toBeUndefined();

    // A6100's driving resource (NL-CRANE600 on the window-only RCAL-CRANE600) can't be placed in-window
    // yet (an M5-epic edge case), so it's honestly substituted onto the plan default and noted — the
    // driver is still identified, never faked.
    expect(
      resourced.report.notes.some(
        (n) => n.id === 'A6100' && n.kind === 'resource-calendar-substituted',
      ),
    ).toBe(true);

    // Every RESOURCE_DEPENDENT activity in the fixture has a driving assignment, so none is flagged
    // driver-missing (produce-and-flag is proven at the engine level in compute.resource.spec).
    expect(resourced.report.notes.filter((n) => n.kind === 'resource-driver-missing')).toHaveLength(
      0,
    );
    expect(resourced.activities.every((a) => a.resourceDriverMissing !== true)).toBe(true);
  });

  it('reads the fixture duration types and reproduces their durations under honorDurationTypes (ADR-0040, self-consistent/driver-less parity)', () => {
    // The fixture carries a `duration_type` on every activity; all four P6 values appear. The
    // non-default ones (the units-driven FIXED_UNITS/FIXED_UNITS_TIME and the held FIXED_DURATION_AND_UNITS):
    const durationTypeIds = fixture.activities
      .filter((a) => a.duration_type !== 'FIXED_DURATION_AND_UNITS_TIME')
      .map((a) => a.id);
    expect(durationTypeIds).toEqual(
      expect.arrayContaining(['A3010', 'A4330', 'A4430', 'A7100', 'A7200', 'A7400']),
    );

    // NONE of the fixture's duration-type activities carries a DRIVING assignment (`res_driving`), so
    // the triad has no driver to consult — only the driving assignment participates (ADR-0040 §3), so
    // the derivation is INERT. (The fixture's two drivers, A6100/A8300, are the default held type.)
    const drivingActivityIds = new Set(
      fixture.assignments
        .filter((asg) => asg.test_tags.includes('res_driving'))
        .map((asg) => asg.activity),
    );
    for (const id of durationTypeIds) expect(drivingActivityIds.has(id)).toBe(false);

    // Their units/duration/rate are internally self-consistent (e.g. A7100 FIXED_UNITS 300 h; its
    // LAB-PIPE assignment 2 400 u ÷ 8 u/h = 300 h), so honouring duration types resolves each
    // durationMinutes to exactly the fixture duration — byte-parity, the same S13/A8300 self-consistency
    // the harness is honest about (proven for real by the resolveTriad goldens, not a fixture date shift).
    const withTypes = adaptFixture(fixture, { honorDurationTypes: true });
    const baseById = new Map(network.activities.map((a) => [a.id, a.durationMinutes]));
    const typedById = new Map(withTypes.activities.map((a) => [a.id, a.durationMinutes]));
    for (const id of durationTypeIds) expect(typedById.get(id)).toBe(baseById.get(id));

    // The WHOLE network is byte-identical (the flag is a no-op on this fixture — the ADR-0040 parity gate);
    // no activity is flagged `duration-derived` because the branch never fires.
    expect(withTypes.activities.map((a) => a.durationMinutes)).toEqual(
      network.activities.map((a) => a.durationMinutes),
    );
    expect(withTypes.report.notes.filter((n) => n.kind === 'duration-derived')).toHaveLength(0);

    // N19 (negative rate) and N20 (zero-rate divisor) are BOUNDARY-owned (ADR-0035 §25/§27): rejected at
    // the DTO `@Min(0)` + service pre-division guard, not the adapter. The fixture carries only valid
    // non-negative rates and the adapter never divides here (inert), so there is nothing to reject —
    // the service-level proof lives in `resolve-triad.spec.ts` + the write-path specs, referenced not re-run.
    expect(fixture.assignments.every((asg) => asg.units_per_hour >= 0)).toBe(true);
  });

  it('builds the WBS parent tree from the fixture wbs codes and rolls a summary up its branch (ADR-0035 §24)', () => {
    // The adapter maps the fixture's dotted `wbs` codes to `parentId`: the TT.4-branch summary W4000
    // (wbs TT.4) parents every DEEPER-level activity under it (TT.4.1 / TT.4.2 / TT.4.3) — but not the
    // TT.4-level tasks themselves (an equal code is not a strict prefix). None of those children is a
    // WBS summary, so the tree here is flat.
    const w4000Children = network.activities.filter((a) => a.parentId === 'W4000').map((a) => a.id);
    expect(w4000Children.length).toBeGreaterThan(0);
    // Sanity on the mapping: the TT.4.1 task A4200 rolls up to W4000; the TT.4-level task A4100 does not.
    expect(w4000Children).toContain('A4200');
    expect(w4000Children).not.toContain('A4100');

    const output = computeSchedule(network.activities, network.edges, network.options);
    const byId = new Map(output.results.map((r) => [r.activityId, r]));
    const summary = byId.get('W4000')!;
    const children = w4000Children.map((id) => byId.get(id)!);
    // The summary's rolled-up span IS its branch: earliest child start → latest child finish (dates sort
    // lexicographically = chronologically). All TT.4.x children are tasks, so the finish mapping lines up.
    const minStart = children.map((c) => c.earlyStart).sort()[0];
    const maxFinish = children
      .map((c) => c.earlyFinish)
      .sort()
      .at(-1);
    expect(summary.earlyStart).toBe(minStart);
    expect(summary.earlyFinish).toBe(maxFinish);
    // Late pinned to the rolled-up early ⇒ a by-convention 0 float; a summary is never critical.
    expect(summary.lateStart).toBe(summary.earlyStart);
    expect(summary.lateFinish).toBe(summary.earlyFinish);
    expect(summary.totalFloat).toBe(0);
    expect(summary.freeFloat).toBe(0);
    expect(summary.isCritical).toBe(false);
    // W5000 (wbs TT.5) has no deeper-level members in the fixture ⇒ an empty summary at the data date.
    const emptySummary = byId.get('W5000')!;
    expect(network.activities.filter((a) => a.parentId === 'W5000')).toHaveLength(0);
    expect(emptySummary.earlyStart).toBe(emptySummary.earlyFinish);
    expect(emptySummary.isCritical).toBe(false);
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
    expect(output.summary.activityCount).toBe(129);
    expect(output.results).toHaveLength(129);
    expect(output.summary.projectFinish).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    for (const result of output.results) {
      expect(result.earlyStart).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(result.earlyFinish).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(result.lateStart).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(result.lateFinish).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});
