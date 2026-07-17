import { loadFixture } from '@repo/engine-conformance';
import { describe, expect, it } from 'vitest';

import { allMinutesWorkCalendar, computeEarnedValue } from '../engine';

import { buildEvActivityInputsFromFixture, EV_FIXTURE_ACTIVITY_IDS } from './earned-value-adapter';

/**
 * The **EV3 conformance slice** (ADR-0042 / ADR-0035 §29): proves `computeEarnedValue` against real
 * numbers from the P6-class conformance fixture (`@repo/engine-conformance`), plus the
 * "flip-one-option-must-differ" differential proof ADR-0034 §2 requires. EV is a **pure read-model**
 * (ADR-0042 §2) — it never enters `computeSchedule` and owns no engine column, so unlike the CPM
 * differentials in `scenarios.spec.ts` this suite calls `computeEarnedValue` directly rather than
 * routing through `adaptFixture`/`runScenario` (documented in `earned-value-adapter.ts`). The CPM
 * engine, its golden suite, and the S01–S13 differential scaffold are completely untouched by this file.
 *
 * Every BAC/AC/EV number below is hand-derived from the fixture's own resource rates
 * (`resources.price_per_unit`), assignment quantities (`assignments.budgeted_units`/`actual_units`) and
 * `expenses` rows — see `earned-value-adapter.ts` for the two documented, non-fixture-real choices (no
 * cost baseline on this fixture; actual cost derived from actual units). This is the first-principles
 * golden (ADR-0034 §3): every expected number is computed by hand below, not read back from the module.
 */
describe('EV3 conformance — earned value against the real P6 fixture (ADR-0042 / ADR-0035 §29)', () => {
  const fixture = loadFixture();
  const activities = buildEvActivityInputsFromFixture(fixture);

  it('selects every curated fixture activity (no drift)', () => {
    expect(activities.map((a) => a.activityId).sort()).toEqual([...EV_FIXTURE_ACTIVITY_IDS].sort());
  });

  it('(first-principles golden) BAC/AC/EV per activity, the real WBS rollup, and the plan total derive exactly from the fixture — no cost baseline ⇒ PV = 0 and costBaselineMissing', () => {
    const result = computeEarnedValue({
      activities,
      dataDate: null,
      eacMethod: 'CPI',
      calendar: allMinutesWorkCalendar,
    });
    expect(result.costBaselineMissing).toBe(true);

    const byId = new Map(result.activities.map((r) => [r.activityId, r]));

    // A4200 (pct_physical, the fixture's own prog_rd_vs_pct_divergence case): LAB-CIVIL 2000h×£38 +
    // NL-EXCAV 200h×£65 ⇒ BAC = 76000 + 13000 = 89000. Actuals: 1200h×£38 + 120h×£65 = 45600 + 7800 =
    // 53400. PHYSICAL 35% (the fixture's own weighted-STEPS figure, deliberately ≠ the 40% duration-%)
    // ⇒ EV = round(89000 × 0.35) = 31150.
    expect(byId.get('A4200')).toMatchObject({
      bac: 89000,
      ac: 53400,
      ev: 31150,
      performancePercent: 35,
    });

    // A7100 (pct_physical, NOT_STARTED, 4 assignments all at 0 actual): LAB-PIPE 2400h×£48 +
    // LAB-WELD 1104h×£58 + NL-MEWP 600h×£22 + MAT-SPOOL 220ea×£780 = 115200+64032+13200+171600 = 364032.
    // AC = 0; PHYSICAL 0% ⇒ EV = 0.
    expect(byId.get('A7100')).toMatchObject({ bac: 364032, ac: 0, ev: 0, performancePercent: 0 });

    // A8010 (pct_units, NOT_STARTED): LAB-EI 1600h×£52 + MAT-CABLE 12000m×£14 = 83200 + 168000 = 251200.
    // AC = 0; UNITS 0/13600 = 0% ⇒ EV = 0.
    expect(byId.get('A8010')).toMatchObject({ bac: 251200, ac: 0, ev: 0, performancePercent: 0 });

    // A6100 (RESOURCE_DEPENDENT, cost_expense E001 45000/0 + NL-CRANE600 60h×£340 + LAB-STEEL 480h×£46):
    // BAC = 45000 + 20400 + 22080 = 87480. AC = 0. DURATION 0% ⇒ EV = 0.
    expect(byId.get('A6100')).toMatchObject({ bac: 87480, ac: 0, ev: 0, performancePercent: 0 });

    // A3010 (COMPLETED, the fixture's own cost_overrun case: expense E002 68000/71500 + LAB-CIVIL
    // 600h×£38 both budgeted and actual): BAC = 68000 + 22800 = 90800. AC = 71500 + 22800 = 94300.
    // DURATION 100% ⇒ EV = 90800.
    expect(byId.get('A3010')).toMatchObject({
      bac: 90800,
      ac: 94300,
      ev: 90800,
      performancePercent: 100,
    });

    // A10300 (cost_expense E003 12000/0 + LAB-WELD 768h×£58 + NL-WELDSET 768h×£9): BAC = 12000 + 44544 +
    // 6912 = 63456. AC = 0. DURATION 0% ⇒ EV = 0.
    expect(byId.get('A10300')).toMatchObject({ bac: 63456, ac: 0, ev: 0, performancePercent: 0 });

    // W4000/W7000 are the real WBS-summary ancestors of A4200/A7100 (ADR-0035 §24); this curated slice
    // includes only one child each, so the rollup equals that child's own figures exactly.
    expect(byId.get('W4000')).toMatchObject({ bac: 89000, ac: 53400, ev: 31150 });
    expect(byId.get('W7000')).toMatchObject({ bac: 364032, ac: 0, ev: 0 });

    // Plan total = Σ the top-level rows (the two summaries + the four ungrouped leaves):
    //   BAC = 89000+364032+251200+87480+90800+63456 = 945968
    //   AC  = 53400+0+0+0+94300+0                   = 147700
    //   EV  = 31150+0+0+0+90800+0                    = 121950
    // SV = EV−PV = 121950−0 = 121950; CV = EV−AC = 121950−147700 = −25750.
    // SPI: PV = 0 ⇒ null (the divide-by-zero guard, ADR-0035 §29). CPI = 121950/147700 = 0.8257.
    // EAC(CPI) = round(945968/0.8257) = 1145656; ETC = 1145656−147700 = 997956;
    // TCPI = (945968−121950)/(945968−147700) = 824018/798268 = 1.0323; VAC = 945968−1145656 = −199688.
    expect(result.total).toMatchObject({
      bac: 945968,
      ac: 147700,
      ev: 121950,
      pv: 0,
      sv: 121950,
      cv: -25750,
      spi: null,
      cpi: 0.8257,
      eac: 1145656,
      etc: 997956,
      tcpi: 1.0323,
      vac: -199688,
    });
  });

  it("(differential — flip the %-complete type) A4200 is the fixture's own prog_rd_vs_pct_divergence discriminator: PHYSICAL 35% and DURATION 40% must earn different EV", () => {
    const run = (percentCompleteType: 'PHYSICAL' | 'DURATION') =>
      computeEarnedValue({
        activities: activities.map((a) =>
          a.activityId === 'A4200' ? { ...a, percentCompleteType } : a,
        ),
        dataDate: null,
        eacMethod: 'CPI',
        calendar: allMinutesWorkCalendar,
      });

    const physicalRow = run('PHYSICAL').activities.find((r) => r.activityId === 'A4200')!;
    const durationRow = run('DURATION').activities.find((r) => r.activityId === 'A4200')!;

    expect(physicalRow.ev).toBe(31150); // 89000 × 0.35 (physical_percent_complete)
    expect(durationRow.ev).toBe(35600); // 89000 × 0.40 (duration_percent_complete)
    expect(durationRow.ev).not.toBe(physicalRow.ev); // the flip must differ — ADR-0034 §2
  });

  it('(differential — flip the EAC method) the same real plan-total BAC/AC/EV forecasts differently under CPI vs REMAINING_AT_BUDGET', () => {
    const run = (eacMethod: 'CPI' | 'REMAINING_AT_BUDGET') =>
      computeEarnedValue({
        activities,
        dataDate: null,
        eacMethod,
        calendar: allMinutesWorkCalendar,
      });

    const cpi = run('CPI').total;
    const remaining = run('REMAINING_AT_BUDGET').total;

    expect(cpi.eac).toBe(1145656); // round(945968 / 0.8257)
    expect(remaining.eac).toBe(971718); // AC + (BAC − EV) = 147700 + (945968 − 121950)
    expect(remaining.eac).not.toBe(cpi.eac); // the flip must differ — ADR-0034 §2
  });

  it('(differential — add/remove the cost baseline) A4200 with a committed cost-baseline window earns a defined PV instead of the "no anchor at all" fallback', () => {
    const a4200 = activities.find((a) => a.activityId === 'A4200')!;
    // Isolated as a top-level (parentId null) single-activity plan so the plan total mirrors the row.
    const solo = { ...a4200, parentId: null };

    const withoutBaseline = computeEarnedValue({
      activities: [solo],
      dataDate: '2026-01-06',
      eacMethod: 'CPI',
      calendar: allMinutesWorkCalendar,
    });
    // No baseline AND no live earlyStart/earlyFinish anchor (this adapter never runs computeSchedule) ⇒
    // there is nothing to time-phase against, so PV = 0 — the fixture's honest "no anchor at all" case.
    expect(withoutBaseline.costBaselineMissing).toBe(true);
    expect(withoutBaseline.total.pv).toBe(0);

    const withBaseline = computeEarnedValue({
      activities: [
        {
          ...solo,
          baselineStart: '2026-01-01',
          baselineFinish: '2026-01-11',
          baselineBudgetedCost: 89000,
        },
      ],
      dataDate: '2026-01-06',
      eacMethod: 'CPI',
      calendar: allMinutesWorkCalendar,
    });
    // Data date 2026-01-06 is 5 of the baseline's 10 (continuous) days in ⇒ planned% = 50 ⇒
    // PV = round(89000 × 0.50) = 44500.
    expect(withBaseline.costBaselineMissing).toBe(false);
    expect(withBaseline.total.pv).toBe(44500);
    expect(withBaseline.total.pv).not.toBe(withoutBaseline.total.pv); // the flip must differ — ADR-0034 §2
  });

  it('(N24 — read-time warning, never a reject) A6100 is real and NOT_STARTED; booking an actual cost against it warns but still values normally', () => {
    // A6100 (RESOURCE_DEPENDENT, DURATION 0%, NOT_STARTED) has no real actuals booked in the fixture, so
    // the baseline slice reports zero warnings. This case asks the honest "what if a not-started
    // activity already had cost booked?" question the N24 negative case is for (ADR-0035 §29): the
    // module must still value it (BAC/AC unchanged in shape) and never throw or reject — only warn.
    const baseline = computeEarnedValue({
      activities,
      dataDate: null,
      eacMethod: 'CPI',
      calendar: allMinutesWorkCalendar,
    });
    expect(baseline.costWarningCount).toBe(0);

    const withBookedActual = activities.map((a) =>
      a.activityId === 'A6100'
        ? {
            ...a,
            assignments: a.assignments.map((asg, i) =>
              i === 0 ? { ...asg, actualCost: 5000 } : asg,
            ),
          }
        : a,
    );
    const result = computeEarnedValue({
      activities: withBookedActual,
      dataDate: null,
      eacMethod: 'CPI',
      calendar: allMinutesWorkCalendar,
    });
    expect(result.costWarningCount).toBe(1); // flagged, not rejected
    expect(result.activities.find((r) => r.activityId === 'A6100')).toMatchObject({
      bac: 87480, // unchanged — BAC never reacts to actuals
      ac: 5000, // the booked actual is still reported (the CV signal, surfaced not hidden)
      ev: 0, // still 0% duration-complete ⇒ EV = 0
    });
  });
});
