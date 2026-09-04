/**
 * **M0-T3 — the change-set generator, and C4 (non-vacuity) which runs FIRST.**
 *
 * C4 exists because C1 and C2 pass trivially against a change set that moves nothing — the failure
 * ADR-0093 and ADR-0108 both record, where a green suite cannot tell "all correct" from "found
 * nothing". So this file's job is to build a change set that is provably NOT vacuous, and to fail
 * loudly if it cannot.
 *
 * See `m0-attribution-prototype.mts` for where this whole harness bypasses the product.
 */
import {
  clone,
  computeSchedule,
  fixtureSpec,
  perturbableAncestorsOfCarrier,
  specToEngineInput,
  selectCompletionCarrier,
  measureCarrierMovementDays,
  type EngineInput,
} from './m0-attribution-prototype.mjs';

/** The classes M0 can exercise on this subject. `RESOURCE` is absent — see the prototype's docblock. */
export const M0_CLASSES = [
  'SCOPE',
  'DURATION',
  'LOGIC',
  'BOUNDS',
  'CALENDAR',
  'PROGRESS',
  'PLAN_OPTION',
] as const;
export type M0Class = (typeof M0_CLASSES)[number];

/** A TOTAL map: adding a class without an edit is a typecheck failure, never a silently unattributed change. */
export type ClassEdits = { readonly [K in M0Class]: (input: EngineInput) => EngineInput };

const addDays = (iso: string, days: number): string => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/**
 * Build the edits. **Selection is type-aware throughout** — `perturbableOnCriticalPath` filters by
 * `isPerturbableType`, so no edit can land on a summary, an LOE or a milestone where it would be
 * silently inert.
 */
export function buildEdits(base: EngineInput): ClassEdits {
  const targets = perturbableAncestorsOfCarrier(base, 6);
  if (targets.length < 4) {
    throw new Error(`C4 cannot be satisfied: only ${targets.length} perturbable ancestors of the carrier`);
  }
  const [t0, t1, t2, t3] = targets as [typeof targets[0], typeof targets[0], typeof targets[0], typeof targets[0]];

  return {
    // Two activities on the critical path grow. Chosen over "add an activity", which needs an edge
    // to matter and would then be indistinguishable from LOGIC.
    DURATION: (i) => {
      const out = clone(i);
      for (const a of out.activities) {
        if (a.id === t0.id) a.durationMinutes += 8 * 60 * 15;
        if (a.id === t1.id) a.durationMinutes += 8 * 60 * 10;
      }
      return out;
    },
    // **The lag on the edge that feeds the carrier grows.** "Lag changed" is in the LOGIC class by
    // definition (spec §2 US-2), and unlike adding a fresh edge it **binds by construction** — the
    // edge is already driving, so the successor cannot absorb it.
    //
    // The first version added a new FS edge between two carrier ancestors and moved the carrier by
    // **0 days**: both endpoints already had enough float for the new edge to be non-binding. C4-c
    // caught it. That is the per-class non-triviality limb doing exactly its job — an edit that
    // looks like a logic change, is a logic change, and attributes nothing.
    LOGIC: (i) => {
      const out = clone(i);
      const control = computeSchedule(i.activities, i.edges, i.options);
      const carrier = selectCompletionCarrier(i.activities, control.results);
      for (const e of out.edges) {
        if (carrier !== undefined && e.successorId === carrier.activityId) {
          e.lagMinutes += 8 * 60 * 12;
        }
      }
      return out;
    },
    // **The plan calendar's working day gets two hours shorter.** This moves every activity that
    // inherits CAL-01, so it is the other half of C4-b (two classes competing for the same float).
    //
    // The first version dropped Friday from every calendar and **threw** inside
    // `rollForwardToWorking` — `Invalid time value`, the working-time horizon being exceeded. That
    // was not a defect in the edit or in the engine. Two of the fixture's calendars (`CAL-05`, the
    // Heavy Lift / Weather Window, and `RCAL-CRANE600`) are ADR-0067 **window-only** base weeks:
    // measured, they have **no working weekdays at all** and every working minute comes from dated
    // exceptions. Shortening the plan week pushed downstream work past the last of those exceptions,
    // so the roll had nowhere left to land.
    //
    // Recorded rather than tidied away, because it is direct evidence for two things the reviews
    // raised: the architect's Q10 (a calendar whose rows are absent does not fail, it schedules
    // wrongly — and here the failure mode is the other one, a bounded window running out) and ER-8's
    // "structurally unreplayable" state, which Tier 3 must report as a typed reason rather than a
    // 500. A narrower, realistic edit avoids it: the working day shortens, the week does not.
    CALENDAR: (i) => {
      const out = clone(i);
      const spec = fixtureSpec();
      const narrowed = {
        ...spec,
        calendars: spec.calendars.map((c) =>
          c.key === spec.plan.defaultCalendarKey
            ? {
                ...c,
                days: c.days.map((d) =>
                  d.windows.length === 0
                    ? d
                    : { ...d, windows: d.windows.map((w, idx) => (idx === d.windows.length - 1 ? { ...w, endMinute: w.endMinute - 120 } : w)) },
                ),
              }
            : c,
        ),
      };
      out.options = { ...out.options, calendar: specToEngineInput(narrowed).options.calendar };
      return out;
    },
    // **An SNET pin placed relative to the activity's OWN computed early start**, so it binds. A
    // fixed offset from the data date does not: the activity may already start later than the pin,
    // in which case the constraint is inert and the class attributes nothing.
    BOUNDS: (i) => {
      const out = clone(i);
      const control = computeSchedule(i.activities, i.edges, i.options);
      const r = control.results.find((x) => x.activityId === t2.id);
      if (r !== undefined) {
        for (const a of out.activities) {
          if (a.id === t2.id) {
            a.constraintType = 'SNET';
            a.constraintDate = addDays(r.earlyStart.slice(0, 10), 25);
          }
        }
      }
      return out;
    },
    // **Remaining work grows on the carrier's immediate predecessor**, which is on the driving chain
    // by construction. Targeting an arbitrary ancestor moved the carrier 0 days.
    PROGRESS: (i) => {
      const out = clone(i);
      const control = computeSchedule(i.activities, i.edges, i.options);
      const carrier = selectCompletionCarrier(i.activities, control.results);
      const feeder = i.edges.find((e) => carrier !== undefined && e.successorId === carrier.activityId)?.predecessorId;
      for (const a of out.activities) {
        if (a.id === feeder) {
          a.remainingMinutes = (a.remainingMinutes ?? a.durationMinutes) + 8 * 60 * 8;
        }
      }
      return out;
    },
    // The data date moves forward — a plan-level scalar, not a per-activity edit.
    PLAN_OPTION: (i) => {
      const out = clone(i);
      out.options = { ...out.options, dataDate: addDays(out.options.dataDate, 10) };
      return out;
    },
    // An activity leaves the plan, with its edges.
    SCOPE: (i) => {
      const out = clone(i);
      out.activities = out.activities.filter((a) => a.id !== t1.id);
      out.edges = out.edges.filter((e) => e.predecessorId !== t1.id && e.successorId !== t1.id);
      return out;
    },
  };
}

/** Apply every class, in the given order, to produce `R_new`. */
export function applyAll(base: EngineInput, edits: ClassEdits, order: readonly M0Class[]): EngineInput {
  return order.reduce<EngineInput>((acc, k) => edits[k](acc), base);
}

/** The carrier's movement between two inputs, measured on the CARRIER's own calendar (spec §4.5). */
export function carrierMovementDays(base: EngineInput, next: EngineInput): number {
  const control = computeSchedule(base.activities, base.edges, base.options);
  const carrier = selectCompletionCarrier(base.activities, control.results);
  if (carrier === undefined) throw new Error('no carrier in the control run');
  const after = computeSchedule(next.activities, next.edges, next.options);
  const carrierAfter = after.results.find((r) => r.activityId === carrier.activityId);
  if (carrierAfter === undefined) return Number.NaN; // the carrier itself left the plan
  const carrierActivity = base.activities.find((a) => a.id === carrier.activityId);
  const calendar = carrierActivity?.calendar ?? base.options.calendar;
  return measureCarrierMovementDays({
    carrier,
    carrierPerturbed: carrierAfter,
    calendar,
    dayFactorMinutes: 8 * 60,
  });
}

if (process.argv[1]?.includes('m0-change-set')) {
  const base = specToEngineInput(fixtureSpec());
  const edits = buildEdits(base);
  const order = [...M0_CLASSES];
  const rNew = applyAll(base, edits, order);

  console.log(`base: ${base.activities.length} activities / ${base.edges.length} edges`);
  const total = carrierMovementDays(base, rNew);
  console.log(`C4  total carrier movement: ${total} working days (bar: |x| >= 10)`);

  // C4-c — per-class non-triviality, each measured ALONE from R_old.
  let nonTrivial = 0;
  let sawLogic = false;
  let sawCalendar = false;
  for (const k of M0_CLASSES) {
    const alone = edits[k](base);
    const d = carrierMovementDays(base, alone);
    const ok = Number.isNaN(d) ? true : Math.abs(d) > 0;
    if (ok) nonTrivial += 1;
    if (ok && k === 'LOGIC') sawLogic = true;
    if (ok && k === 'CALENDAR') sawCalendar = true;
    console.log(`  ${k.padEnd(12)} alone: ${Number.isNaN(d) ? 'carrier removed' : `${d} d`}${ok ? '' : '   <-- INERT'}`);
  }
  console.log(`C4  classes moving the carrier alone: ${nonTrivial}/${M0_CLASSES.length} (bar: >= 3)`);
  console.log(`C4  logic present: ${sawLogic} | calendar present: ${sawCalendar}`);
  // MAGNITUDE, not sign. C4 asks that the change set "moves the carrier by >= 10 working days";
  // a plan can legitimately get SHORTER, and the first version tested `total >= 10`, which would
  // have reported a 134-day contraction as vacuous.
  const pass = Math.abs(total) >= 10 && nonTrivial >= 3 && sawLogic && sawCalendar;
  console.log(`C4  ${pass ? 'PASS' : 'FAIL'}`);
}
