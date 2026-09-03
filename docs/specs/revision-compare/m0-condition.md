# Revision Compare — the M0 falsification condition

> **Committed before the harness exists.** This file is M0-T1, and it lands on its own so that the
> predicate cannot be adjusted after a number is seen. It is copied verbatim from
> [`feature-spec.md`](./feature-spec.md) §4.7; the spec is the source, this is the commitment.
>
> The reason it is a separate commit rather than a section: this repository has three recorded cases
> where a condition committed **before** the run changed or killed an approved design — ADR-0099 M0
> (the reduced strip was 302 px over and the epic was redesigned), ADR-0121 (both committed
> conditions failed and the segment cap changed), and ADR-0097 Landing C (withdrawn on its own
> condition). It also has one where an **uncommitted** verdict was produced from an `undefined`,
> because the edit meant to supply the worst-case figure silently failed to apply and
> `undefined >= 120` is `false` — the right answer from a missing number. A condition written after
> the run is not a condition.

## What M0 asks

Does one-change-at-a-time replay produce an attribution **complete and stable enough to show a
planner as a verdict**?

This is research, not engineering, and the reason is specific: attribution is **order-dependent**.
Two changes can each move nothing alone and forty days together; or each move forty days alone and
forty days together. A sequential replay is one path through a lattice and its answer depends on the
path taken. Nothing in this repository establishes that a real construction programme's change sets
are benign in that respect — so it is measured rather than assumed.

## Subject

The seeded fixture plan `plan:fixture-p6-torture-v1` — **147 activity rows and 188 dependencies**,
confirmed by M0-T2 through the public REST API.

Not 129. `docs/TEST_PLAYBOOK.md` gives **both** numbers for **different objects**: `:24` and `:38`
name the 129-activity _fixture file_, `:43` records the _seeded plan_ at 147.

> **This paragraph said "147 activity rows (129 tasks + 18 `WBS_SUMMARY`)" when it was committed,
> and M0-T2 disproved the parenthesis within the hour.** The total was right; the decomposition was
> wrong in **both** terms. Read back by type, the plan is **126 non-summary + 21 `WBS_SUMMARY`** —
> `TASK` 103, `FINISH_MILESTONE` 12, `LEVEL_OF_EFFORT` 5, `START_MILESTONE` 4, `RESOURCE_DEPENDENT`
> 2, `WBS_SUMMARY` 21.
>
> The cause is the 129-vs-147 confusion **one level down**. `147 = 129 + 18` is true of the
> **sources** — the fixture's `activities` array plus its `wbs` array. `147 = 126 + 21` is true of
> the **types**, because **3 of the fixture's own 129 activities already carry
> `activity_type: "WBS_SUMMARY"`**. Two correct decompositions of one total, describing different
> objects — which is exactly the trap this section's own 129/147 warning exists to flag, fallen into
> one line below the warning.
>
> Established by `GET …/plans/:id/activities` paged to exhaustion and tallied by `type`, against
> `node -e` over the fixture JSON's `activity_type` field. Neither number was counted by eye.

## Setup

Generate a change set against a captured revision of that plan.

- `total` — the completion carrier's movement from `R_old` to `R_new` **in one pass**, in working
  days on the carrier's calendar.
- `Σ` — the sum of per-class attributions from **one sequential replay**.

Two rules are **inherited, not invented**, and both were paid for once already in
`apps/api/src/modules/schedule/critical-path-test.ts`:

- **The carrier, not the max** (`:149-166`). The subject of "did the completion move" is the control
  run's latest-finishing non-summary activity. The changed activities' own finishes move
  unconditionally, so measuring the max project finish passes a plan whose downstream logic absorbed
  everything — a fixture written against the first draft of that module proved exactly this, with a
  MANDATORY pin masking the whole chain and reading as PASS.
- **Measure on the subject's own calendar, over its own day factor** (`:168-179`). Measuring on the
  plan frame under-reads exactly when the subject works a wider week than the plan.

**Reuse both by import. Do not restate them.**

## The conditions

### C1 — completeness

`|Σ − total| ≤ 1 working day`.

The residual is the interaction term. One day absorbs calendar-window rounding; the same code path
already accepts 5 days against a 600-day injection (`critical-path-test.ts:39`), so this is the
stricter of the two bars.

### C2 — order-stability

Over **all 6 permutations** of the three largest-contributing classes (remaining classes held in a
fixed tail): no class's attributed share moves by more than **10 percentage points of `total`**,
**and** the rank order of the top three classes is **identical in all six runs**.

### C3 — cost

One full attribution over the fixture completes in **≤ 3.0 s p95** measured end-to-end over the real
route, and the number of engine passes is **O(classes present), capped at 12** — never O(changed
activities).

Cost basis: one extra pass at 2,000 activities measured at ≈150 ms, from ADR-0116's 846.5 ms
two-pass route against a 694.3 ms one-pass recalculate.

### C4 — non-vacuity (the pinned positive case)

The generated change set moves the carrier by **≥ 10 working days** and touches **≥ 3 distinct
classes**, at least one a **logic** change and one a **calendar** change.

Without this, C1 and C2 pass **trivially** against a change set that moves nothing. That is the
failure ADR-0093 and ADR-0108 both record — a green suite that cannot distinguish "all correct" from
"found nothing" — and it is why C4 is run **first**. If the generator cannot produce a qualifying
change set, that is itself the finding and the whole predicate is vacuous.

## Falsification

If **any** of C1–C4 fails, **Tier 3 as specified is WITHDRAWN**, and one of two pre-named fallbacks
ships instead:

- **(a) Contribution without ranking** — each class's _isolated_ effect measured from `R_old`,
  order-free by construction, explicitly labelled "if this were the only change". It does **not** sum
  to the total, and it says so.
- **(b) The critical-path delta only** — which activities entered and left the critical path and by
  how much, with **no causal claim at all**.

**The choice between (a) and (b) goes to the product owner with the measured numbers.** It is not
made by the implementer, and it is deliberately **not** pre-committed — see the spec's CQ-4.
Pre-committing would mean choosing a remedy for a failure whose _shape_ is exactly what M0 measures.

## The honesty requirement, whatever M0 says

A non-zero residual is displayed as an **Interaction** row, and is **never distributed** across the
ranked classes.

Distributing it converts a measurement into a fabrication, and the fabrication would be invisible:
every number on screen would still look reasonable.

## The verdict

M0-T4 writes `m0-measurement.md` stating **PROCEED / RESHAPE / WITHDRAW** against these four
conditions, with the numbers, and with every claim in the spec or the plan that the run contradicted
**corrected in place rather than deleted**.
