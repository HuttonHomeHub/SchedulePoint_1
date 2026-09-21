---
Status: Approved
---

# M-J-T1 — the gate pass, and the four things it found that no gate could

**Written 2026-09-21**, over the combined M-A…M-I diff. Six specialist reviews plus the author's
own pass. This records what they found, what was folded, what was **refused**, and — the part worth
reading first — the four findings where an instrument or a document was wrong rather than the code.

---

## 1. The largest finding: the epic had no ADR

`implementation-plan.md` M-A-T5 specified **ADR-01NN**, twelve decisions; `feature-spec.md` §4.16
outlined D0–D11 and §1 said _"a new ADR is required"_. Nothing was written, for **eight
milestones**, across a change that deletes ADR-0033's central concept from the public contract
(`feat(api)!`), performs an **irreversible** edit to customer data, and amends seven other ADRs.
`docs/adr/` ended at 0147 and `CLAUDE.md` §16 had no entry.

**Both gates that would have caught it pass BECAUSE it is missing.** `check:adr-coverage` validates
the ADRs that exist, not the ones a plan promises; and ADR-0131's refusal bites only a `Draft` spec
**cited by an ADR** — so the absent ADR suppressed the check on its own spec's `Draft` header. The
plan's testing line also named `check:adr-register`, a script that does not exist (ADR-0147 folded
that limb into `check:adr-coverage`), so the one instruction a reader might have followed named
something unrunnable.

Filed as **ADR-0148**, with its §16 entry and its `docs/ROADMAP.md` row **in the same commit**
(ADR-0147's rule), and both spec headers moved to `Approved`.

## 2. FC-10 clause C was asserted and denied a hundred lines apart

The clause is _"the bars do not move, **proved on a real plan**"_ — the load-bearing safety promise
of an irreversible migration. `strip-drag-constraints-migration.e2e-spec.ts:11` claimed it; `:115`
of the same file says, correctly, that it writes `early_start` directly because _"a recalculation
here would be a second subject"_. Right for **that** file's subject — what the migration READS — and
exactly why the clause went undischarged: it is about what the **engine** produces either side of
the strip, and nothing in the epic called it.

`strip-bars-do-not-move.e2e-spec.ts` closes it, and **its first version failed against a correct
migration**, which is the useful half:

> It asserted a successor's `totalFloat` rose on a plan where the constrained chain **was** the
> longest path. Total float is measured against the **project finish**, which is itself the maximum
> of every early finish — so stripping the constraint pulled the finish in with it and the chain
> stayed critical at zero float on both sides. **The float that "comes back" is only observable
> where something else holds the finish still.**

The fixture now hangs the constrained branch off a 20-day independent spine and **asserts the spine
holds the finish before measuring anything**, so that arrangement cannot rot silently. Verified red
against three mutations, each recorded in the file with the assertion it hit — and the second
mutation is why `SPINE2` carries an **inert** constraint: without it the fixture holds one SNET,
that SNET is binding, and widening the migration's `WHERE` to convert every class converts the same
row, so the mutation would be invisible.

## 3. The mandatory re-measurement changed a verdict — and then the gate refused the remedy

`implementation-plan.md:718-726` makes the join-vs-`EXISTS` re-run **mandatory**; it had never been
run. Swept at eight densities, the shipped join goes 82 → 314 → **425 ms** and touches ADR-0140's
500 ms bar at 90 % placement density (457–523 ms across five runs, 918,360 joined rows, spilling to
temp). The recorded escalation trigger — _"a substantial majority of plans carry at least one
placement"_ — **saturates at 1 % density**, where the join still wins by 3×, so a reader following
it would have swapped to the slower shape.

A third shape is flat (**37–48 ms at every density**, byte-identical numbers) and **it does not
ship**, for a reason found by building it: gate **S-4 refused it**. That gate reads the `SELECT`
list of _every_ statement in the registry file — because `$queryRaw`'s row type is an unchecked
cast — and the CTE projects `a.plan_id`. The review that proposed the shape reported it as
S-4-compliant, which is true of the outermost `SELECT` only.

So shipping it means **widening a security gate whose entire value is that it is syntactic**, which
is an ADR-0140-level decision and an ADR-0105 shared-gate trigger. The join is kept, the sweep is
recorded, the trigger is restated on the **(baselines × placed activities) product**, and the
remedy is named for whoever reaches it. Nothing is on fire: the deployed host holds 164 activities.

## 4. FC-2 clause 3's red run was owed from M-D, and it narrowed the condition

The clause names `m-d/fc2-red-run.md` **by path**, so its absence was checkable from the day M-D
landed. Produced now. The mutation — `earlyStart: activity.visualStart ?? earlyStartDate`, the
smallest plausible version of the defect — takes `compute.visual.spec.ts` red on six cases and
leaves **`compute.spec.ts` and all 118 conformance cases green**: not one of their fixtures carries
a `visualStart`.

**So clause 1's corpus is structurally blind to the risk the rollup marks catastrophic, and clause
2's `pureFields` is the only guard in the repository that catches it.** That makes FC-2's own scope
note load-bearing rather than cautious.

---

## What else was folded

| Finding                                                                         | Where                                                     |
| ------------------------------------------------------------------------------- | --------------------------------------------------------- |
| The accessible listbox announced **network** dates while every bar draws placed | `render/a11y.ts` — now through the shared `barDatesFor`   |
| The conflict badge marked the **start** for both reasons                        | `render/paint.ts` — `LATER_THAN_BOUND` marks the finish   |
| `repositionCommand` alive, exported and tested with no caller                   | deleted; `m-f/collapse.md`'s "tsc found all three" fixed  |
| Nine stale `SNET` docblocks on public prop types                                | `TsldPanel.tsx`, `use-plan-workspace-model.ts`            |
| The migration's plan-shape claim (it **does** seq-scan, and that is faster)     | `migration.sql`, `m-i/record.md`, the changeset           |
| `docs/API.md` never told about any of the epic                                  | two new sections                                          |
| `placement-on-early-plan`'s premise lapsed at M-F                               | re-natured `retrospective`; **retires with the column**   |
| The two M-E conflict diagnostics shipped uncosted                               | measured 37.8 / 41.6 / 40.2 ms, written into the registry |
| `float-basis.structural.spec.ts` guarded 2 of its own 3 stated reasons          | 4 entries now, the new ones mutation-verified             |
| `placementNotAssessableReason` reads as "a comparison was done"                 | both DTOs say no comparison is implemented yet            |
| The cross-plan placed columns have **no backfill** before 2026-07-14            | recorded on the field, with what an unexpected N32 means  |
| UUID v7 "orders them exactly" — 20 ms buckets, up to 183 rows each              | narrowed in three places; the decision is unchanged       |
| The rollback recipe "HAS NEVER BEEN RUN"                                        | run once against the M-I schema; narrowed to that         |
| `dump-sql.mts` has never existed                                                | `m0/measurements.md` corrected                            |
| `retention-boundary.structural.spec.ts:53-58` → `:55-57`                        | five citation sites                                       |
| 68 prior migrations → 67                                                        | `migration.sql`, `m-i/record.md`                          |
| A grep cited as evidence that now matches its own two docblock lines            | comment-stripping form, in a forward-only file            |

## What was refused, with reasons

- **The flat diagnostic shape** — §3 above. Recorded, not shipped.
- **Making baseline variance placement-aware** (`docs/TECH_DEBT.md` #359). Two rows of §4.11's API
  table were specified and never built, and they are **one** piece of work. It is **live-wrong after
  M-I** rather than merely incomplete — the strip moves a converted activity's `early_start` earlier
  while its drawn span stays put, so variance reports it as ahead of baseline when the bar has not
  moved — and the honest fix is placed-vs-placed gated on the snapshot level, which changes
  `BaselineVarianceRow`'s public contract and the Gantt's variance bar. ADR-0105 full-spec trigger;
  §4.11 is struck in place so the table cannot read as a record of what shipped.
- **An `e2e-placement-migration` journey** — refused at M-I on structural grounds (no journey in this
  repository can create a `placement_migrations` row), unchanged.

## The journey sweep

**46 suites, 45 green.** The one failure is `overview`, on its last case, and it is **not this
epic's** — `git diff origin/main..HEAD` over `apps/web/e2e-overview/` and its config is empty, so it
is pre-existing on `main`. Reproduced in isolation, and the case **passes when run alone**: the
suite's first eight cases spend the global 100-per-60-second rate-limit budget and the ninth meets
the wall. Filed as `docs/TECH_DEBT.md` #360 with the reproduction, the precedent that would fix it,
and the reason that precedent's argument does not transfer.

**What the sweep was for**: `a11y.ts` changes the Tier-1 sentence that many journeys assert on, so a
change to which dates it speaks could have moved text under nineteen suites. None of them moved.

## Still owed

**FC-1's estate readings** (`m0/estate-readings.md` does not exist). They come from the ADR-0140
staff diagnostics on the deployed host and are the product owner's to take. **The window closes on
deploy**: the strip runs inside `prisma migrate deploy` at boot on a host that auto-pulls, so
afterwards `snet-binding` reads only the already-placed exclusions, `visual-placement-activities`
includes the conversions, and `baselines-over-placed-plans`' pre-state is not reconstructible at
all. One press of the staff panel before merge closes a condition whose withdrawal clause is
**none**; afterwards it is permanently unclosable. Recorded as owed rather than estimated
(ADR-0127 D8).
