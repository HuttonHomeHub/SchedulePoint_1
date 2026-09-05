# Revision Compare (critical-path delta) — the M0 falsification condition

> **Committed before the harness exists.** This file is M0-T1 and it lands on its own, so the
> predicate cannot be adjusted after a number is seen. It is copied from
> [`feature-spec.md`](./feature-spec.md) §4.7; the spec is the source, this is the commitment.
>
> The practice is repeated verbatim from the superseded epic because it worked: that condition file
> is trustworthy precisely because nothing was known when it was written, and it went on to
> **withdraw** the design it belonged to. A condition written after the run is not a condition.
>
> **This M0 is smaller and more answerable than the last one.** The research risk that justified the
> previous M0 — is a sequential replay's attribution stable? — was withdrawn along with the design
> it belonged to. What remains are three claims that decide the work and that nobody can establish
> by reading.

## Subject

The seeded fixture plan `plan:fixture-p6-torture-v1` — **147 activity rows, 188 dependencies.**

That total was established by the previous epic's M0-T2 through the public REST API, and is reused;
its _decomposition_ was got wrong twice there and is deliberately not carried forward.

**A baseline must be captured through the public REST API first**, because the seed catalogue
captures none (`docs/TEST_PLAYBOOK.md:196`). That is the same route ADR-0116's health-check M6 took.

## The conditions

### F1 — fidelity

For the same plan state, the delta computed from **persisted/frozen columns** equals the delta
computed from two authoritative `computeSchedule` runs over the same two input states: **identical
`entered` and `left` sets**, and carrier movement within **±1 working day**.

**Why it can fail.** The persisted columns are day-denominated projections of minute quantities
(ADR-0036 §7), and a baseline's frozen values were written by a **possibly-older engine**. The whole
design rests on those two sides agreeing; nothing currently proves they do.

**If it fails.** The failure names which side and which quantity disagreed. The remedy is a scope
decision for the product owner, **not a softened bar**.

### F2 — carrier agreement

The carrier derived from **date-only** persisted columns is the same activity
`selectCompletionCarrier` picks from engine results on the same plan — including at least one
**deliberately constructed tie** (two non-summary activities finishing on the same date).

**Why it can fail.** The date-vs-minute granularity gap (§4.4 D3). Two activities that differ by
hours are indistinguishable once projected to days, so the two rules can pick different winners.

**If it fails.** The tie-break rule is stated in the response and the panel names the carrier, so a
reader can see which activity the number is about — but the disagreement is **recorded, not hidden**.

### F3 — cost

The route completes in **≤ 250 ms p95 end-to-end** at **2,000 activities**, over the real HTTP route.

**Basis.** ADR-0116 measured its four persisted loads sub-1 ms at the same scale, and the superseded
spec's own review measured a whole-baseline load at 0.439 ms at 2,000 rows. So this should clear the
bar by two orders of magnitude, and **its purpose is to catch an accidental N+1 or a per-row query**,
not to be tight. A bar that can only fail on a mistake is still worth having when the mistake is
silent.

**If it fails.** The throttle decision in §4.5 is reopened with the number beside it.

### Non-vacuity — the pinned positive case, checked FIRST

The change set between the two sides must move at least **3 activities into** the critical path and
**1 out**, and move the carrier by **≥ 5 working days**.

Without this, F1 passes trivially against two identical schedules. That is the failure ADR-0093 and
ADR-0108 both record — a green suite that cannot distinguish "all correct" from "found nothing" —
and it is why this limb runs **before** the other three.

**If the generator cannot produce a qualifying pair through the public write path, that is itself
the finding**, and it is reported rather than worked around. The previous epic's non-vacuity limb
earned its keep exactly here: four of six change classes attributed zero on the first run, and the
limb is what made that visible instead of passing quietly.

## Where the harness bypasses the product

ADR-0081 §3, and the previous M0's own practice.

**F1 and F2 call the delta function and the engine directly, not over HTTP.** A pass says the
**method** is sound. It says nothing about a route, a DTO, a guard or a permission. **F3 goes over
the real route precisely because the other two do not.**

## Falsification

If any limb fails, the failure is reported with its number and the remedy is a scope decision for
the product owner. Nothing here is a bar to be relaxed until it passes.

Two things this epic already knows, which is why the condition is worth committing rather than
assumed:

- The previous epic's harness built its engine input from the wrong source and **scheduled a plan
  four and a half months different from the product**. Every number taken before that was corrected
  had to be withdrawn, including a PASS. F1 exists because that can happen again in the other
  direction — this time between a frozen column and a live one.
- Two of the previous epic's four conditions failed, and the design was withdrawn. **M0 is allowed
  to say no**, and saying no is not a failure of the milestone.

## The verdict

M0-T2 writes `m0-measurement.md` stating **PROCEED / RESHAPE / WITHDRAW** against these limbs, with
the numbers, and **corrects in place** every claim in the spec or the plan that the run contradicted.
