import { describe, expect, it } from 'vitest';

import {
  computeEarnedValue,
  type EvActivityInput,
  type EvAssignmentInput,
  type EvInput,
} from './earned-value';
import {
  absMinutesToInstant,
  instantToAbsMinutes,
  type WorkingTimeCalendar,
} from './working-time-calendar';

/**
 * First-principles Earned-Value goldens (EV2b-core, ADR-0042 / ADR-0035 §29). Every expected number is
 * **hand-worked** and asserted exactly — there is no external oracle (ADR-0034 §2). To keep the PV
 * time-phasing fractions exact and hand-checkable we use a **continuous 24/7** calendar so
 * `workingTimeBetween(a, b)` is simply the wall-clock minute difference (1 day = 1440 minutes); the
 * time-phasing arithmetic is then plain proportions of whole days.
 */
const continuousCalendar: WorkingTimeCalendar = {
  workingTimeBetween: (from, to) => instantToAbsMinutes(to) - instantToAbsMinutes(from),
  addWorkingTime: (from, minutes) => absMinutesToInstant(instantToAbsMinutes(from) + minutes),
};

function assignment(overrides: Partial<EvAssignmentInput> = {}): EvAssignmentInput {
  return {
    budgetedCost: null,
    actualCost: 0,
    budgetedUnits: 0,
    actualUnits: 0,
    costPerUnit: null,
    ...overrides,
  };
}

function activity(overrides: Partial<EvActivityInput> & { activityId: string }): EvActivityInput {
  return {
    type: 'TASK',
    parentId: null,
    percentCompleteType: 'DURATION',
    percentComplete: 0,
    physicalPercentComplete: null,
    budgetedExpense: 0,
    actualExpense: 0,
    assignments: [],
    baselineStart: null,
    baselineFinish: null,
    baselineBudgetedCost: null,
    earlyStart: null,
    earlyFinish: null,
    ...overrides,
  };
}

function run(
  activities: EvActivityInput[],
  dataDate: string | null,
  eacMethod: EvInput['eacMethod'] = 'CPI',
): ReturnType<typeof computeEarnedValue> {
  return computeEarnedValue({ activities, dataDate, eacMethod, calendar: continuousCalendar });
}

describe('computeEarnedValue', () => {
  it('(1) values a single 50%-duration-complete resourced activity (BAC/EV/AC/PV → SV/CV/SPI/CPI/EAC)', () => {
    // BAC = 100000 (assignment override), AC = 40000. DURATION 50% → EV = 100000×0.50 = 50000.
    // PV: baseline 2026-01-01→2026-01-11 (10 days), data date 2026-01-06 is 5 days in = 50% elapsed
    //     ⇒ 100000×0.50 = 50000. SV = 50000−50000 = 0; CV = 50000−40000 = 10000.
    //     SPI = 50000/50000 = 1.0; CPI = 50000/40000 = 1.25; EAC(CPI) = 100000/1.25 = 80000.
    const result = run(
      [
        activity({
          activityId: 'A',
          percentComplete: 50,
          assignments: [assignment({ budgetedCost: 100000, actualCost: 40000 })],
          baselineStart: '2026-01-01',
          baselineFinish: '2026-01-11',
          baselineBudgetedCost: 100000,
        }),
      ],
      '2026-01-06',
    );

    expect(result.costBaselineMissing).toBe(false);
    const row = result.activities[0]!;
    expect(row).toMatchObject({
      activityId: 'A',
      performancePercent: 50,
      bac: 100000,
      pv: 50000,
      ev: 50000,
      ac: 40000,
      sv: 0,
      cv: 10000,
      spi: 1,
      cpi: 1.25,
      eac: 80000, // 100000 / 1.25
      etc: 40000, // 80000 − 40000
      tcpi: 0.8333, // (100000−50000)/(100000−40000) = 50000/60000
      vac: 20000, // 100000 − 80000
    });
    expect(result.total).toMatchObject({ bac: 100000, ev: 50000, ac: 40000, eac: 80000 });
  });

  it('(2) UNITS type derives performance % from actualUnits / budgetedUnits', () => {
    // BAC = 100 units × 1000/unit = 100000. UNITS: 40/100 = 40% → EV = 40000. AC = 40000.
    // PV: baseline 2026-01-01→2026-01-05 (4 days), data date 2026-01-02 = 1 day in = 25% ⇒ 25000.
    const result = run(
      [
        activity({
          activityId: 'U',
          percentCompleteType: 'UNITS',
          assignments: [
            assignment({
              budgetedUnits: 100,
              actualUnits: 40,
              costPerUnit: 1000,
              actualCost: 40000,
            }),
          ],
          baselineStart: '2026-01-01',
          baselineFinish: '2026-01-05',
          baselineBudgetedCost: 100000,
        }),
      ],
      '2026-01-02',
    );

    expect(result.activities[0]).toMatchObject({
      performancePercent: 40,
      bac: 100000,
      pv: 25000,
      ev: 40000,
      ac: 40000,
      sv: 15000, // 40000 − 25000
      cv: 0, // 40000 − 40000
      spi: 1.6, // 40000 / 25000
      cpi: 1, // 40000 / 40000
      eac: 100000, // 100000 / 1.0
      tcpi: 1, // (100000−40000)/(100000−40000)
      vac: 0,
    });
  });

  it('(3) PHYSICAL type earns on the hand-entered physical %-complete (lump-sum expense)', () => {
    // BAC = 200000 (budgeted expense, no assignments). PHYSICAL 75% → EV = 150000. AC = 100000.
    // PV: baseline 2026-01-01→2026-01-05 (4 days), data date 2026-01-04 = 3 days in = 75% ⇒ 150000.
    const result = run(
      [
        activity({
          activityId: 'P',
          percentCompleteType: 'PHYSICAL',
          physicalPercentComplete: 75,
          budgetedExpense: 200000,
          actualExpense: 100000,
          baselineStart: '2026-01-01',
          baselineFinish: '2026-01-05',
          baselineBudgetedCost: 200000,
        }),
      ],
      '2026-01-04',
    );

    expect(result.activities[0]).toMatchObject({
      performancePercent: 75,
      bac: 200000,
      pv: 150000,
      ev: 150000,
      ac: 100000,
      sv: 0,
      cv: 50000, // 150000 − 100000
      spi: 1,
      cpi: 1.5, // 150000 / 100000
      eac: 133333, // round(200000 / 1.5) = round(133333.33)
      etc: 33333, // 133333 − 100000
      tcpi: 0.5, // (200000−150000)/(200000−100000) = 50000/100000
      vac: 66667, // 200000 − 133333
    });
  });

  it('(4a) AC = 0 ⇒ CPI is null and the CPI-EAC falls back to AC + (BAC − EV)', () => {
    // BAC = 100000, DURATION 30% → EV = 30000, AC = 0. PV: baseline half-elapsed ⇒ 50000.
    const result = run(
      [
        activity({
          activityId: 'ZC',
          percentComplete: 30,
          budgetedExpense: 100000,
          baselineStart: '2026-01-01',
          baselineFinish: '2026-01-11',
          baselineBudgetedCost: 100000,
        }),
      ],
      '2026-01-06',
    );

    const row = result.activities[0]!;
    expect(row.ac).toBe(0);
    expect(row.cpi).toBeNull();
    expect(row.spi).toBe(0.6); // PV = 50000 > 0 ⇒ SPI defined = 30000/50000
    expect(row.eac).toBe(70000); // fallback AC + (BAC − EV) = 0 + 70000
    expect(row.etc).toBe(70000);
    expect(row.tcpi).toBe(0.7); // 70000 / 100000
    expect(row.vac).toBe(30000);
  });

  it('(4b) PV = 0 ⇒ SPI is null (nothing planned by the data date)', () => {
    // Data date 2026-01-01 is on/before the baseline start 2026-02-01 ⇒ planned % = 0 ⇒ PV = 0.
    const result = run(
      [
        activity({
          activityId: 'ZP',
          percentComplete: 100,
          budgetedExpense: 50000,
          actualExpense: 25000,
          baselineStart: '2026-02-01',
          baselineFinish: '2026-02-11',
          baselineBudgetedCost: 50000,
        }),
      ],
      '2026-01-01',
    );

    const row = result.activities[0]!;
    expect(row.pv).toBe(0);
    expect(row.spi).toBeNull();
    expect(row.ev).toBe(50000);
    expect(row.cpi).toBe(2); // 50000 / 25000 (AC > 0, so CPI defined)
    expect(row.sv).toBe(50000); // EV − PV = 50000 − 0
  });

  it('(5) a WBS summary rolls up its two children (Σ BAC/PV/EV/AC, then derived indices)', () => {
    // Child A: bac 100000, pv 50000, ev 50000, ac 40000. Child B: bac 200000, pv 100000, ev 50000, ac 60000.
    // Summary: bac 300000, pv 150000, ev 100000, ac 100000.
    //   SV = −50000; CV = 0; SPI = 100000/150000 = 0.6667; CPI = 1.0; EAC = 300000; perf% = 100000/300000 = 33.33.
    const result = run(
      [
        activity({ activityId: 'S', type: 'WBS_SUMMARY', parentId: null }),
        activity({
          activityId: 'A',
          parentId: 'S',
          percentComplete: 50,
          assignments: [assignment({ budgetedCost: 100000, actualCost: 40000 })],
          baselineStart: '2026-01-01',
          baselineFinish: '2026-01-11',
          baselineBudgetedCost: 100000,
        }),
        activity({
          activityId: 'B',
          parentId: 'S',
          percentComplete: 25,
          assignments: [assignment({ budgetedCost: 200000, actualCost: 60000 })],
          baselineStart: '2026-01-01',
          baselineFinish: '2026-01-11',
          baselineBudgetedCost: 200000,
        }),
      ],
      '2026-01-06',
    );

    const byId = new Map(result.activities.map((r) => [r.activityId, r]));
    expect(byId.get('A')).toMatchObject({ bac: 100000, pv: 50000, ev: 50000, ac: 40000 });
    expect(byId.get('B')).toMatchObject({ bac: 200000, pv: 100000, ev: 50000, ac: 60000 });

    const summary = byId.get('S')!;
    expect(summary).toMatchObject({
      performancePercent: 33.33, // round2(100000/300000×100)
      bac: 300000,
      pv: 150000,
      ev: 100000,
      ac: 100000,
      sv: -50000,
      cv: 0,
      spi: 0.6667, // 100000 / 150000
      cpi: 1,
      eac: 300000,
      etc: 200000,
      tcpi: 1, // (300000−100000)/(300000−100000)
      vac: 0,
    });
    // Plan total = the single top-level row (the summary).
    expect(result.total).toMatchObject({ bac: 300000, pv: 150000, ev: 100000, ac: 100000 });
  });

  it('(6) costBaselineMissing is true when a baseline budget is absent; PV falls back to live BAC on early dates', () => {
    // No baseline dates/cost ⇒ PV uses (earlyStart, earlyFinish) and pvCost = BAC.
    // early 2026-01-01→2026-01-11 (10 days), data date 2026-01-04 = 3 days in = 30% ⇒ PV = 100000×0.30 = 30000.
    const result = run(
      [
        activity({
          activityId: 'NB',
          percentComplete: 40,
          budgetedExpense: 100000,
          actualExpense: 30000,
          earlyStart: '2026-01-01',
          earlyFinish: '2026-01-11',
          // baselineStart/Finish/BudgetedCost all null
        }),
      ],
      '2026-01-04',
    );

    expect(result.costBaselineMissing).toBe(true);
    expect(result.activities[0]).toMatchObject({
      bac: 100000,
      ev: 40000, // 100000 × 0.40
      ac: 30000,
      pv: 30000, // live BAC time-phased on early dates
      sv: 10000, // 40000 − 30000
      spi: 1.3333, // 40000 / 30000
      cpi: 1.3333, // 40000 / 30000
    });
  });

  it('(7) the three EAC methods differ on the same BAC/EV/AC/PV', () => {
    // BAC 100000, DURATION 40% → EV 40000, AC 50000, PV 50000 (baseline half-elapsed).
    //   CPI          = 40000/50000 = 0.8  ⇒ EAC = 100000/0.8 = 125000
    //   REMAINING    = AC + (BAC−EV) = 50000 + 60000 = 110000
    //   CPI_TIMES_SPI= AC + (BAC−EV)/(CPI×SPI) = 50000 + 60000/(0.8×0.8) = 50000 + 93750 = 143750
    const base: EvActivityInput = activity({
      activityId: 'M',
      percentComplete: 40,
      budgetedExpense: 100000,
      actualExpense: 50000,
      baselineStart: '2026-01-01',
      baselineFinish: '2026-01-11',
      baselineBudgetedCost: 100000,
    });

    const cpi = run([base], '2026-01-06', 'CPI').activities[0]!;
    expect(cpi).toMatchObject({ ev: 40000, ac: 50000, pv: 50000, eac: 125000, vac: -25000 });

    const remaining = run([base], '2026-01-06', 'REMAINING_AT_BUDGET').activities[0]!;
    expect(remaining).toMatchObject({ eac: 110000, etc: 60000, vac: -10000 });

    const cpiSpi = run([base], '2026-01-06', 'CPI_TIMES_SPI').activities[0]!;
    expect(cpiSpi).toMatchObject({ eac: 143750, etc: 93750, vac: -43750 });
  });

  it('milestones earn all-or-nothing on schedule %-complete regardless of type', () => {
    // A finish milestone carrying an expense: earns its full BAC only once complete; PV binary on start.
    const incomplete = run(
      [
        activity({
          activityId: 'MS',
          type: 'FINISH_MILESTONE',
          percentComplete: 99,
          budgetedExpense: 10000,
          baselineStart: '2026-01-10',
          baselineFinish: '2026-01-10',
          baselineBudgetedCost: 10000,
        }),
      ],
      '2026-01-06',
    ).activities[0]!;
    expect(incomplete).toMatchObject({ performancePercent: 0, ev: 0, pv: 0 }); // data date < start

    const complete = run(
      [
        activity({
          activityId: 'MS',
          type: 'FINISH_MILESTONE',
          percentComplete: 100,
          budgetedExpense: 10000,
          baselineStart: '2026-01-10',
          baselineFinish: '2026-01-10',
          baselineBudgetedCost: 10000,
        }),
      ],
      '2026-01-12',
    ).activities[0]!;
    expect(complete).toMatchObject({ performancePercent: 100, ev: 10000, pv: 10000 }); // data date ≥ start
  });

  it('the assignment budgeted-cost override falls back to budgetedUnits × costPerUnit when null', () => {
    // Two assignments: one override (150000), one derived (25 × 2000 = 50000) ⇒ BAC = 200000.
    const row = run(
      [
        activity({
          activityId: 'MIX',
          percentComplete: 0,
          assignments: [
            assignment({ budgetedCost: 150000 }),
            assignment({ budgetedCost: null, budgetedUnits: 25, costPerUnit: 2000 }),
          ],
        }),
      ],
      null,
    ).activities[0]!;
    expect(row.bac).toBe(200000);
  });

  it('(N24) actual cost/units on a NOT-STARTED activity is a read-time warning, never a reject — EV still values it normally', () => {
    // percentComplete 0 + physicalPercentComplete unset ⇒ "not started"; an assignment already shows
    // actual cost booked against it. The row must still compute (no throw) and count exactly one warning.
    const result = run(
      [
        activity({
          activityId: 'NS',
          percentComplete: 0,
          assignments: [assignment({ budgetedCost: 100000, actualCost: 20000 })],
        }),
        // A genuinely untouched sibling contributes no warning.
        activity({ activityId: 'CLEAN', percentComplete: 0, budgetedExpense: 5000 }),
      ],
      null,
    );

    expect(result.costWarningCount).toBe(1);
    const row = result.activities.find((r) => r.activityId === 'NS')!;
    expect(row).toMatchObject({ bac: 100000, ac: 20000, ev: 0 }); // 0% duration ⇒ EV = 0, AC still reported
  });

  it('(N24) an actual booked via units, or a physical/duration %-complete > 0, does not count as a warning', () => {
    const unitsActual = run(
      [
        activity({
          activityId: 'U',
          percentComplete: 0,
          assignments: [assignment({ budgetedUnits: 10, actualUnits: 4, costPerUnit: 1000 })],
        }),
      ],
      null,
    );
    expect(unitsActual.costWarningCount).toBe(1); // actualUnits > 0 on a not-started activity also warns

    const started = run(
      [
        activity({
          activityId: 'STARTED',
          percentComplete: 10, // already underway ⇒ not "not started"
          assignments: [assignment({ budgetedCost: 100000, actualCost: 20000 })],
        }),
      ],
      null,
    );
    expect(started.costWarningCount).toBe(0);

    const physicalStarted = run(
      [
        activity({
          activityId: 'PHYS',
          percentComplete: 0,
          physicalPercentComplete: 5, // physically underway ⇒ not "not started"
          budgetedExpense: 100000,
          actualExpense: 20000,
        }),
      ],
      null,
    );
    expect(physicalStarted.costWarningCount).toBe(0);
  });
});
