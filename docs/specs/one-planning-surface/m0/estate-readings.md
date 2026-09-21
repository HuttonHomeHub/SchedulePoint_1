# FC-1 — the estate readings: **UNANSWERED, and now permanently so**

**Status:** UNANSWERED (ADR-0127 D8) · **Closed:** 2026-09-21 · **Owner:** product owner

## The verdict

**No estate readings were taken before the collapse shipped.** FC-1 asked for the eight
staff-diagnostics figures that M0 built the means to take (ADR-0140, `staff-diagnostics.registry.ts`),
on the deployed host, against the pre-collapse estate. They were never pressed.

This is recorded as UNANSWERED rather than filled in. ADR-0127 D8 is the precedent: a measurement
that was not taken is reported as not taken, never reconstructed, and never replaced by a figure
that looks like one. There is no number in this file because there is no number.

## Why it cannot be taken now

Two independent closures, either of which is sufficient:

1. **The strip has run.** `20260921120000_strip_drag_constraints` executes inside
   `prisma migrate deploy` at container boot (ADR-0018), and `api-v0.70.0` published to GHCR at
   2026-09-21 05:55Z on a host that auto-pulls (ADR-0047). Once it ran, the pre-strip state is not
   reconstructible — the conversion is irreversible by design and `placement_migrations` records
   what changed, not what the aggregate counts were.
2. **One of the readings no longer exists.** `placement-on-early-plan` was retired with
   `plans.scheduling_mode` at M-J-T2. Its query cannot be run again by anybody, because neither the
   entry nor the column it filtered on is in the product.

## The decision, and who made it

The `placement-on-early-plan` docblock said the entry was kept for one release **specifically
because** these readings were owed, and that deleting it beforehand "would remove the only
pre-collapse figure for this population, permanently."

That was put to the product owner on 2026-09-21, before the entry was deleted, with the cost
stated and the alternative (hold PR #2 for one button press) offered. **They chose to proceed and
accept the loss.** The forfeit is therefore deliberate and attributed, not an oversight.

## What this does and does not cost

**Does not cost:** any product behaviour. Nothing in the running application read these figures;
they were decision inputs for two questions that have since been answered by other means — whether
a baseline capture needed a migration or a default (answered by ADR-0126's capture-level column)
and whether the strip could run unattended (answered by M-I's four-class test and FC-10 clause C's
executable proof).

**Does cost:** the ability to say afterwards how large the affected population was on the one
deployed installation. If somebody later asks "how many activities did the strip actually convert
here?", `placement_migrations` answers that — it is the strip's own record. What is gone is the
_surrounding_ context: how much of the estate had ever been placed, how many baselines sat over
placed plans, and the four SNET class counts, as they stood before the conversion.

## The transferable finding

FC-1 named a condition whose evidence could only be produced by a person with access this session
does not have, and set no deadline against the release that would destroy it. A falsification
condition that depends on somebody else's hardware needs its **window** written down beside it, not
just its question — otherwise it expires silently while everything else proceeds correctly.
ADR-0128 exists because a measurement was unreachable by the person who needed to take it; this is
the same failure one step along, where the measurement was reachable and nobody was told it was
about to stop being.

---

## Addendum — the POST-strip readings, taken 2026-09-21

**FC-1's verdict above is unchanged and this addendum does not close it.** These readings were
taken at **2026-09-21T09:14:32Z against `api` 0.71.0** — after both releases, so after the strip
ran at boot. They cannot answer the pre-strip question and are not offered as if they could. They
are recorded because they were taken, because nothing else in this repository holds an estate-wide
number for the placement model, and because one of them confirms a design property that had only
ever been asserted.

| diagnostic                           | affected / examined | plans | elapsed |
| ------------------------------------ | ------------------- | ----- | ------- |
| `day-factor-divergence`              | 2 / 2               | 1     | 19 ms   |
| `inherited-day-factor`               | 19 / 164            | 1     | 5 ms    |
| `visual-placement-plans`             | 4 / 4               | 4     | 2 ms    |
| `visual-placement-activities`        | 14 / 164            | 4     | 2 ms    |
| `baselines-over-placed-plans`        | 2 / 2               | 1     | 4 ms    |
| `snet-binding`                       | 1 / 6               | 1     | 3 ms    |
| `snet-inert`                         | 5 / 6               | 3     | 2 ms    |
| `snet-unclassified`                  | 0 / 6               | —     | 2 ms    |
| `snet-full-baseline-coverage`        | 0 / 1               | —     | 4 ms    |
| `visual-conflict-earlier-than-logic` | 2 / 14              | 1     | 3 ms    |
| `visual-conflict-later-than-bound`   | 0 / 14              | —     | 2 ms    |

One organisation throughout.

### What they establish

**1. The disjointness guard holds on real data, for the first time.** `snet-binding` 1 +
`snet-inert` 5 + `snet-unclassified` 0 = **6**, which is the shared `SNET_DENOMINATOR`. The registry
calls that identity _"the cheapest possible guard against a mis-written `WHERE`"_ and asserts it in
the repository spec against fixtures; this is its first confirmation against a deployed estate.

**2. The strip's four-class test is visible in the outcome.** Five of the six surviving SNETs are
`inert` — `early_start > constraint_date`, the class the migration deliberately leaves because
converting one would place the bar **earlier** than logic allows. That is the single largest class
on this installation, and it is the one a naive `WHERE` would have moved.

**3. Every plan on the installation now carries a placement** (`visual-placement-plans` 4 of 4),
across 14 of 164 activities. The placement model is not a corner of this estate; it is all of it.

**4. Two placements are in live conflict and the product can now say so.** `visual-conflict-
earlier-than-logic` is 2 of 14 — placements the engine reports as earlier than their logic allows,
which is exactly what M-D's `visualConflictReason` and M-E's feasible window were built to show.
`later-than-bound` is 0, so the sign-error class the M-J gate pass fixed (`Math.abs()` erasing
direction before the word "before" was applied to it) is **not exercised on this estate** — the fix
is unproven in production rather than proven.

### What they cannot say, and it matters

**One binding SNET survives, and this reading cannot tell you which of two things it is.**
`snet-binding` counts `early_start = constraint_date` with **no** `visual_start IS NULL` clause,
while the migration's `WHERE` has one. So the survivor is either

- the designed **"already placed"** exclusion — a row carrying both a stale placement and a binding
  constraint, which the strip skips because converting it would overwrite the placement (the clause
  measured as protecting 706 rows on the 102k fixture); or
- a constraint **created or re-bound since** the strip ran, an SNET still being a first-class
  planner input.

Both are consistent with 1, and the count cannot separate them. Named rather than picked.
`snet-full-baseline-coverage` adds that this survivor is **not** covered by a FULL baseline, so no
historic copy of it exists anywhere in the system.

**The conversion count is not here and is not estate-wide anywhere** — but it is reachable, which
the body of this file understates. `GET /organizations/:orgSlug/plans/:planId/placement-migration`
returns every row the strip converted on a plan, and
`apps/web/src/features/placement-migration/` surfaces it as a workspace notice. Per plan, in the
app, by any member. What has no reader is the estate-wide sum.

### The one actionable line

`day-factor-divergence` (2 / 2) and `inherited-day-factor` (19 / 164) are **identical to the
2026-09-14 reading**. Those 21 activities keep their pre-ADR-0139 figures until their plans are
recalculated, so a week has passed with the remedy un-applied. On a single-tenant installation
"who to tell" is the reader of this file, and what to tell them is **which plan to recalculate**.

### What this is not

It is not a test of ADR-0140's cost limb. Every entry ran in 2–19 ms, and both re-arm triggers were
derived against a 102,000-activity synthetic while this host holds 164 activities — so the ≤ 500 ms
bar remains untested rather than cleared, exactly as ADR-0140's own entry records.
