import { describe, expect, it } from 'vitest';

import { wouldCreatePlanCycle } from '../../cross-plan-dependencies/cross-plan-cycle-detector';
import { deriveExternalInstants } from '../cross-plan-derivation';

import {
  checkCrossPlanCoverage,
  crossPlanCoverageIndex,
  DIAMOND_FIXTURE,
  FS_INTERFACE_FIXTURE,
  REQUIRED_CROSS_PLAN_TAGS,
  solveProgramme,
  solveTargetAlone,
  toPlanEdges,
  type ComputedDates,
  type CrossPlanFixture,
} from './cross-plan-adapter';
import { resultsDiffer } from './scenarios';

/**
 * **F7 — live cross-plan / programme conformance** (inter-project M2, ADR-0045 §2–§5 / ADR-0035
 * §30.5–§30.8, ADR-0034 three tiers). The live cross-plan axis is derived **above** the unchanged
 * engine, so — exactly like the M1 external goldens (`external-conformance.spec.ts`) — this file asserts
 * the DERIVED inputs (`resolveProgrammeOrder` + `deriveExternalInstants`) and the engine's existing
 * response to them, never new engine arithmetic.
 *
 * No external oracle (ADR-0034 §3): both fixtures run on a 24/7 calendar (1 working day = 1440 min), so
 * every asserted date is hand-computed here from the §30.5–§30.8 semantics and self-baselined. Each
 * golden's derivation is spelled out inline the way the existing goldens document theirs.
 *
 * Structure mirrors the single-plan conformance harness: a tier-1 structural coverage gate, a tier-2
 * differential ("programme recalc ≠ downstream-alone"), tier-3 first-principles goldens, and the
 * N30–N33 negatives (engine-free where the derivation owns them, boundary-referenced otherwise).
 */

/** Every activity result of a full-programme solve, indexed by activity id (a small convenience). */
function programmeResults(fixture: CrossPlanFixture, ignoreExternal = false) {
  const solve = solveProgramme(fixture, { ignoreExternalRelationships: ignoreExternal });
  return { solve, result: (id: string) => solve.resultsByActivity.get(id)! };
}

// --------------------------------------------------------------------------------------------------
// Tier 1 — structural coverage gate (ADR-0034 §1)
// --------------------------------------------------------------------------------------------------

describe('F7 tier-1 — cross-plan structural coverage gate (ADR-0034 §1)', () => {
  it('claims every required cross-plan capability tag', () => {
    const coverage = checkCrossPlanCoverage();
    expect(coverage.missing, `uncovered cross-plan tags: ${coverage.missing.join(', ')}`).toEqual(
      [],
    );
    expect(coverage.ok).toBe(true);
  });

  it('maps every required tag to at least one covering object (fixture, edge, or negative case)', () => {
    const index = crossPlanCoverageIndex();
    for (const tag of REQUIRED_CROSS_PLAN_TAGS) {
      expect(index[tag], `no object claims "${tag}"`).toBeDefined();
      expect(index[tag]!.length).toBeGreaterThan(0);
    }
  });
});

// --------------------------------------------------------------------------------------------------
// Tier 2 — the live-axis differential (ADR-0034 §2): programme recalc ≠ downstream-alone
// --------------------------------------------------------------------------------------------------

describe('F7 tier-2 — cross-plan differential (ADR-0035 §30.7/§30.8)', () => {
  // A STALE Procurement snapshot: an OLDER schedule where PROC_STEEL finished 2026-01-04 (six days
  // before its fresh 2026-01-10). This is the "downstream computed against a superseded upstream" case
  // §30.7 tracks. Only the early finish drives the FS derivation; the rest is filled for shape.
  const staleUpstream = new Map<string, ComputedDates>([
    [
      'PROC_STEEL',
      {
        earlyStart: '2025-12-26',
        earlyFinish: '2026-01-04',
        lateStart: '2025-12-26',
        lateFinish: '2026-01-04',
      },
    ],
  ]);

  it('programme recalc (upstream fresh) differs from downstream-alone (upstream stale) for the driven activity', () => {
    // Programme: PROC_STEEL recomputed fresh (EF 2026-01-10) ⇒ derived FS+2 = 2026-01-12 drives
    // CONS_ERECT to 2026-01-12. Downstream-alone: reads the STALE 2026-01-04 ⇒ derived FS+2 = 2026-01-06.
    // "Flip the axis (fresh vs stale upstream), the dates must move" — the live-axis differential.
    const programme = solveProgramme(FS_INTERFACE_FIXTURE);
    const alone = solveTargetAlone(FS_INTERFACE_FIXTURE, staleUpstream);

    const downstreamOut = programme.outputs.get('PLAN_CONSTRUCTION')!;
    expect(resultsDiffer(alone.output, downstreamOut)).toBe(true);

    const fresh = downstreamOut.results.find((r) => r.activityId === 'CONS_ERECT')!;
    const stale = alone.output.results.find((r) => r.activityId === 'CONS_ERECT')!;
    expect(fresh.earlyStart).toBe('2026-01-12'); // fresh upstream (EF 2026-01-10) + FS 2
    expect(stale.earlyStart).toBe('2026-01-06'); // stale upstream (EF 2026-01-04) + FS 2
    // The stale downstream sits EARLIER than the fresh programme recalc: an older (earlier-finishing)
    // upstream schedule under-derives the interface, which is precisely why a programme recalc is due.
    expect(stale.earlyStart < fresh.earlyStart).toBe(true);
  });

  it('an all-fresh programme solve does not differ from itself (differential sanity)', () => {
    const a = solveProgramme(FS_INTERFACE_FIXTURE);
    const b = solveProgramme(FS_INTERFACE_FIXTURE);
    expect(
      resultsDiffer(a.outputs.get('PLAN_CONSTRUCTION')!, b.outputs.get('PLAN_CONSTRUCTION')!),
    ).toBe(false);
  });
});

// --------------------------------------------------------------------------------------------------
// Tier 3 — first-principles goldens (ADR-0034 §3 / ADR-0035 §30.5–§30.8), self-baselined, no oracle
// --------------------------------------------------------------------------------------------------

describe('F7 tier-3 — golden: FS-across-plan later-of-two (§30.5 / §30.1)', () => {
  // Upstream PROC_STEEL: 10 working days from the 2026-01-01 data date on a 24/7 calendar ⇒ inclusive
  // early finish 2026-01-10 (start + 9). The FS+2 cross-plan edge derives CONS_ERECT's external early
  // start as 2026-01-10 + 2 = 2026-01-12 (§30.5, §30.1-shaped). The effective external early start is
  // the LATER of that derived bound and CONS_ERECT's hand-entered M1 column.
  it('the derived cross-plan bound drives when it is later than the M1 column', () => {
    // M1 column = 2026-01-05 (earlier than 2026-01-12) ⇒ later-of = the derived 2026-01-12.
    const { solve, result } = programmeResults(FS_INTERFACE_FIXTURE);
    expect(solve.order).toEqual(['PLAN_PROCUREMENT', 'PLAN_CONSTRUCTION']);

    // The upstream anchors the interface (first-principles: 10d from 2026-01-01 ⇒ EF 2026-01-10).
    expect(result('PROC_STEEL').earlyFinish).toBe('2026-01-10');

    // The composed (derived later-of M1) external early start fed to the engine.
    expect(solve.derivedByActivity.get('CONS_ERECT')!.externalEarlyStart).toBe('2026-01-12');
    const cons = result('CONS_ERECT');
    expect(cons.earlyStart).toBe('2026-01-12'); // SNET-shaped: max(data date, external) = external
    expect(cons.earlyFinish).toBe('2026-01-16'); // 2026-01-12 + (5 − 1)
    expect(cons.externalDriven).toBe(true); // the external bound raised it above the data-date floor
  });

  it('the M1 hand-entered column drives when it is later than the derived bound', () => {
    // Same network, but the M1 column is 2026-01-20 (later than the derived 2026-01-12) ⇒ later-of =
    // the M1 2026-01-20 (§30.5 "the manual column stands when it is later"). The derived value never
    // overwrites it — it composes with it.
    const m1Later: CrossPlanFixture = {
      ...FS_INTERFACE_FIXTURE,
      plans: FS_INTERFACE_FIXTURE.plans.map((plan) =>
        plan.id === 'PLAN_CONSTRUCTION'
          ? {
              ...plan,
              m1: { CONS_ERECT: { externalEarlyStart: '2026-01-20', externalLateFinish: null } },
            }
          : plan,
      ),
    };
    const { solve, result } = programmeResults(m1Later);
    expect(solve.derivedByActivity.get('CONS_ERECT')!.externalEarlyStart).toBe('2026-01-20');
    const cons = result('CONS_ERECT');
    expect(cons.earlyStart).toBe('2026-01-20');
    expect(cons.earlyFinish).toBe('2026-01-24'); // 2026-01-20 + (5 − 1)
    expect(cons.externalDriven).toBe(true);
  });
});

describe('F7 tier-3 — golden: diamond fan-in (§30.5 latest-of / §30.8 topo order)', () => {
  // U1: 8d from 2026-01-01 ⇒ EF 2026-01-08. MA1 (FS+0) ⇒ ES 2026-01-08, 4d ⇒ EF 2026-01-11. MB1 (FS+3)
  // ⇒ ES 2026-01-08 + 3 = 2026-01-11, 6d ⇒ EF 2026-01-16. D1 has two incoming FS+0 edges, so its derived
  // external early start is the LATEST of the two mid finishes: max(2026-01-11, 2026-01-16) = 2026-01-16.
  it('resolves the programme order upstream-first, deterministic by plan id', () => {
    const solve = solveProgramme(DIAMOND_FIXTURE);
    expect(solve.order).toEqual(['PLAN_UP', 'PLAN_MID_A', 'PLAN_MID_B', 'PLAN_DOWN']);
  });

  it('the downstream derived bound is the latest of the two mid-plan-derived bounds', () => {
    const { solve, result } = programmeResults(DIAMOND_FIXTURE);

    // The two mids, first-principles from the fresh upstream (EF 2026-01-08).
    expect(result('MA1').earlyStart).toBe('2026-01-08'); // FS+0
    expect(result('MA1').earlyFinish).toBe('2026-01-11'); // 4d
    expect(result('MB1').earlyStart).toBe('2026-01-11'); // FS+3
    expect(result('MB1').earlyFinish).toBe('2026-01-16'); // 6d

    // The fan-in: D1's derived bound = latest(MA1 EF, MB1 EF) = 2026-01-16 (MB1's chain wins).
    expect(solve.derivedByActivity.get('D1')!.externalEarlyStart).toBe('2026-01-16');
    const d1 = result('D1');
    expect(d1.earlyStart).toBe('2026-01-16');
    expect(d1.earlyFinish).toBe('2026-01-18'); // 2026-01-16 + (3 − 1)
    expect(d1.externalDriven).toBe(true);
  });
});

describe('F7 tier-3 — golden: ignore-external drops the derived cross-plan bound (§30.4, S09 extended)', () => {
  it('drops the derived bound so the downstream falls back to its own logic (data-date floor)', () => {
    // The derivation still composes the 2026-01-12 bound (it is engine-free and unaffected by the
    // toggle); the ENGINE drops it under ignoreExternalRelationships, so CONS_ERECT — which has no
    // internal predecessor — floors at its 2026-01-01 data date. This is S09 (ADR-0035 §30.4) extended
    // to a DERIVED (live cross-plan) bound, not just a hand-entered M1 column.
    const honoured = programmeResults(FS_INTERFACE_FIXTURE);
    const ignored = programmeResults(FS_INTERFACE_FIXTURE, true);

    // The derived bound is identical either way — only the engine's response to it changes.
    expect(honoured.solve.derivedByActivity.get('CONS_ERECT')!.externalEarlyStart).toBe(
      '2026-01-12',
    );
    expect(ignored.solve.derivedByActivity.get('CONS_ERECT')!.externalEarlyStart).toBe(
      '2026-01-12',
    );

    const honCons = honoured.result('CONS_ERECT');
    const ignCons = ignored.result('CONS_ERECT');
    expect(honCons.earlyStart).toBe('2026-01-12'); // honoured: the derived bound drives
    expect(ignCons.earlyStart).toBe('2026-01-01'); // ignored: pulled back to the data date
    expect(ignCons.earlyStart < honCons.earlyStart).toBe(true);
    expect(ignCons.externalDriven).toBeUndefined(); // no external bound is binding once dropped
    // The whole downstream schedule differs when the derived bound is dropped.
    expect(
      resultsDiffer(
        ignored.solve.outputs.get('PLAN_CONSTRUCTION')!,
        honoured.solve.outputs.get('PLAN_CONSTRUCTION')!,
      ),
    ).toBe(true);
  });
});

// --------------------------------------------------------------------------------------------------
// Negatives N30–N33 (ADR-0035 §30.5–§30.6) — engine-free where the derivation owns them; the reject
// cases (N30/N31/N33) are boundary-owned and referenced (the F3 service + partial-unique index).
// --------------------------------------------------------------------------------------------------

describe('F7 negatives — N30–N33 (ADR-0035 §30.5–§30.6)', () => {
  it('N30: a cross-plan edge that would close a plan-level cycle is rejected (F3 detector)', () => {
    // In the diamond, DOWN is reachable from UP (UP → MID_A/MID_B → DOWN), so adding DOWN → UP would
    // close a plan-level cycle. `wouldCreatePlanCycle` rejects it (§30.6). The 409 CROSS_PLAN_CYCLE_DETECTED
    // wiring is asserted at the boundary in `cross-plan-dependencies.service.spec.ts` (N30) and the
    // detector's own units in `cross-plan-cycle-detector.spec.ts`.
    const planEdges = toPlanEdges(DIAMOND_FIXTURE);
    expect(wouldCreatePlanCycle(planEdges, 'PLAN_DOWN', 'PLAN_UP')).toBe(true);
    // A forward programme shortcut (UP → DOWN) stays acyclic — the detector is not over-eager.
    expect(wouldCreatePlanCycle(planEdges, 'PLAN_UP', 'PLAN_DOWN')).toBe(false);
  });

  it('N31: a same-plan cross-plan edge is rejected (defensive; the service rejects it 422 first)', () => {
    // Endpoints in the SAME plan are a self-cycle at plan grain; `wouldCreatePlanCycle` returns true
    // defensively. The friendly 422 CROSS_PLAN_SAME_PLAN reject ("use an intra-plan dependency") is
    // owned by the service and asserted in `cross-plan-dependencies.service.spec.ts` (N31).
    expect(wouldCreatePlanCycle([], 'PLAN_CONSTRUCTION', 'PLAN_CONSTRUCTION')).toBe(true);
  });

  it('N32: a never-computed upstream contributes no bound and is counted, warn-and-proceed (§30.5)', () => {
    // Downstream-alone with an EMPTY upstream snapshot: PROC_STEEL was never calculated, so the FS edge's
    // upstream early finish is null. The derivation contributes NO forward bound for it, increments
    // `upstreamMissingCount`, and lets CONS_ERECT's M1 column (2026-01-05) stand — never an error (§30.5).
    const alone = solveTargetAlone(FS_INTERFACE_FIXTURE, new Map());
    expect(alone.upstreamMissingCount).toBe(1);
    // The M1 column stands (no derived bound to compose with it).
    expect(alone.derived.get('CONS_ERECT')!.externalEarlyStart).toBe('2026-01-05');
    const cons = alone.output.results.find((r) => r.activityId === 'CONS_ERECT')!;
    expect(cons.earlyStart).toBe('2026-01-05'); // the surviving M1 bound, produced not rejected
  });

  it('N32 (unit): the derivation counts a missing upstream directly', () => {
    // The same warn-and-proceed at the derivation seam, in isolation: a null upstream early finish on an
    // FS edge contributes no bound and is counted (mirrors the F4 derivation unit tests).
    const { derived, upstreamMissingCount } = deriveExternalInstants({
      incoming: [
        {
          successorActivityId: 'CONS_ERECT',
          type: 'FS',
          lagDays: 2,
          predecessorEarlyStart: null,
          predecessorEarlyFinish: null,
        },
      ],
      outgoing: [],
      m1: new Map([['CONS_ERECT', { externalEarlyStart: null, externalLateFinish: null }]]),
      durationDaysByActivity: new Map([['CONS_ERECT', 5]]),
    });
    expect(upstreamMissingCount).toBe(1);
    expect(derived.get('CONS_ERECT')).toEqual({
      externalEarlyStart: null,
      externalLateFinish: null,
    });
  });

  // N33 (duplicate cross-plan edge, same predecessor/successor/type) is a WRITE-PATH reject owned by the
  // service pre-check (`findDuplicate` → 409 DUPLICATE_CROSS_PLAN_DEPENDENCY) and the partial-unique index
  // backstop — not the pure derivation. It is asserted at the boundary in
  // `cross-plan-dependencies.service.spec.ts` (N33, incl. the P2002 unique-violation backstop).
  it.todo(
    'N33: a duplicate (pred, succ, type) cross-plan edge is rejected 409 DUPLICATE_CROSS_PLAN_DEPENDENCY (F3 service / partial-unique index)',
  );
});
