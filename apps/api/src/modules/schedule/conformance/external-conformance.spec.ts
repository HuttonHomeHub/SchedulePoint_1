import { loadFixture } from '@repo/engine-conformance';
import { describe, expect, it } from 'vitest';

import { computeSchedule } from '../engine';
import type { EngineResult } from '../engine';

import { adaptFixture } from './adapter';
import { toCalendarDay } from './type-map';

/**
 * The **F3 external / inter-project conformance goldens** (ADR-0043 / ADR-0035 §30, ADR-0034 §3). These
 * assert the documented §30 semantics on the P6-class fixture's *real* external activities — the
 * SchedulePoint contract, self-baselined with **no external oracle** (ADR-0034's no-oracle strategy):
 * every asserted value is either the fixture's own imported external date (§30.1/§30.2) or the internal
 * FINISH_ON pin (§30.3), and each is proven to DRIVE by contrasting the honoured schedule against the
 * ignore-external one (the same network with `ignoreExternalRelationships` on). We assert *which bound
 * drives* and the external-driven flag — not incidental downstream offsets.
 *
 * The pure-engine arithmetic of these shapes (SNET-forward, FNLT-backward, later-drives, hard-pin-wins,
 * N25 clamp+warn, negative float) is unit-tested first-principles in `engine/compute.external.spec.ts`;
 * this file is the conformance half — the wiring from the fixture's `external_early_start` /
 * `external_late_finish` columns through the adapter to those semantics on the actual A2120/A2200/A12500.
 */
describe('F3 external / inter-project conformance goldens (ADR-0043 / ADR-0035 §30)', () => {
  const fixture = loadFixture();
  // The S01 baseline anchor — the unprogressed network at the project's planned start (2026-01-05).
  const dataDate = toCalendarDay(fixture.project.planned_start);

  // Honoured: external bounds fed AND acted on (the default — the adapter maps them unconditionally).
  const honoured = adaptFixture(fixture, { dataDate });
  // Ignored: the same network with the plan-level ignore-external option on (§30.4, S09).
  const ignored = adaptFixture(fixture, { dataDate, ignoreExternalRelationships: true });

  const honOut = computeSchedule(honoured.activities, honoured.edges, honoured.options);
  const ignOut = computeSchedule(ignored.activities, ignored.edges, ignored.options);
  const hon = new Map<string, EngineResult>(honOut.results.map((r) => [r.activityId, r]));
  const ign = new Map<string, EngineResult>(ignOut.results.map((r) => [r.activityId, r]));
  const honActivity = new Map(honoured.activities.map((a) => [a.id, a]));

  it('A2120 — the LATER of an internal FS predecessor and the external early start drives (§30.1)', () => {
    // A2120 carries BOTH an internal FS predecessor (R0013: A2110 → A2120, FS+160h) AND an imported
    // external early start of 2026-04-13 (from the Engineering project). §30.1: the later drives.
    const a2120 = honActivity.get('A2120')!;
    expect(a2120.externalEarlyStart).toBe('2026-04-13'); // fed from the fixture column
    expect(honoured.edges.some((e) => e.successorId === 'A2120' && e.type === 'FS')).toBe(true);

    const h = hon.get('A2120')!;
    const i = ign.get('A2120')!;
    // Honoured: the external 2026-04-13 is later than the internal-logic early start, so it drives and
    // the milestone is flagged external-driven (§30.1 later-drives + the observability flag).
    expect(h.earlyStart).toBe('2026-04-13');
    expect(h.externalDriven).toBe(true);
    // Ignored: the external bound drops and the internal FS predecessor drives — strictly EARLIER (the
    // procurement/engineering chain pulls left). Dates sort lexicographically = chronologically.
    expect(i.earlyStart < h.earlyStart).toBe(true);
    expect(i.externalDriven).toBeUndefined();
  });

  it('A2200 — a clean external early start drives the early start; ignore pulls it back to the data date (§30.1/§30.4)', () => {
    // A2200 is an open-start procurement milestone (net_external_open_start): no internal predecessor,
    // so its only forward bound is the imported external early start of 2026-07-27.
    const a2200 = honActivity.get('A2200')!;
    expect(a2200.externalEarlyStart).toBe('2026-07-27');

    const h = hon.get('A2200')!;
    const i = ign.get('A2200')!;
    // Honoured: the external date IS the early start (a milestone, start = finish), external-driven.
    expect(h.earlyStart).toBe('2026-07-27');
    expect(h.earlyFinish).toBe('2026-07-27');
    expect(h.externalDriven).toBe(true);
    // Ignored: with nothing but the (dropped) external bound, the open-start milestone floors at the
    // data date — dramatically earlier (the "chain pulls left" of the S09 assertion).
    expect(i.earlyStart).toBe(dataDate);
    expect(i.earlyStart < h.earlyStart).toBe(true);
    expect(i.externalDriven).toBeUndefined();
  });

  it('A12500 — an external late finish COEXISTS with a FINISH_ON pin; the hard pin governs (§30.3)', () => {
    // A12500 (RFSU) carries a FINISH_ON constraint (2026-12-04) AND an imported external late finish
    // (2026-12-11) from the downstream Start-Up project. §30.3: an external bound is SOFT — a hard pin
    // overrides it. The adapter feeds BOTH onto the same activity (the coexistence the fixture proves).
    const a12500 = honActivity.get('A12500')!;
    expect(a12500.constraintType).toBe('MFO'); // FINISH_ON → MFO both-pass pin
    expect(a12500.constraintDate).toBe('2026-12-04');
    expect(a12500.externalLateFinish).toBe('2026-12-11'); // fed, but soft

    const h = hon.get('A12500')!;
    const i = ign.get('A12500')!;
    // The FINISH_ON pin governs both passes: early = late = the pin, NOT the softer external 2026-12-11.
    expect(h.earlyFinish).toBe('2026-12-04');
    expect(h.lateFinish).toBe('2026-12-04');
    // Because the pin — not the external bound — is binding, the milestone is NOT flagged external-driven.
    expect(h.externalDriven).toBeUndefined();
    // And dropping the external late finish changes nothing: the pin already governed (§30.3).
    expect(i.earlyFinish).toBe(h.earlyFinish);
    expect(i.lateFinish).toBe(h.lateFinish);
  });

  it('rolls up the external-driven count and leaves it absent once the bounds are ignored (§30 observability / §30.4)', () => {
    // Exactly the five external-early-start milestones drive under the honoured baseline; A12500's soft
    // late finish is discarded by its pin, so it is not counted.
    expect(honOut.summary.externalDrivenCount).toBe(5);
    for (const id of ['A2120', 'A2200', 'A2210', 'A2220', 'A2230']) {
      expect(hon.get(id)!.externalDriven).toBe(true);
    }
    // Ignore-external drops every bound: no activity is external-driven, and the optional count is ABSENT
    // (⇔ 0), the same parity shape the no-external path carries.
    expect(ignOut.summary.externalDrivenCount).toBeUndefined();
    for (const r of ignOut.results) expect(r.externalDriven).toBeUndefined();
  });
});
