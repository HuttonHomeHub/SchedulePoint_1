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

> **The carrier is FIXED ONCE, from the control run — and that makes C1 nearly a tautology, which
> this condition now says out loud rather than discovering after the fact (2026-09-03, the
> specialist review).** The review's question was the right one: if the carrier is fixed, `Σ` is a
> telescoping sum of one fixed activity's consecutive deltas along a chain ending at `R_new`, and
> `Σ = total` **by arithmetic**, not because the attribution means anything. C1 could then only fail
> on day-snapping noise accumulated across up to 12 passes — which the ±1-day tolerance is designed
> to absorb.
>
> Fixed is still the right choice: re-deriving the carrier per step sums the movements of
> **different activities**, which is not a decomposition of anything, and it makes `total`'s own
> carrier ambiguous. So the semantics stay, and **C1 is downgraded in what it claims**. It is an
> arithmetic self-check — it catches a harness that drops a class, double-counts one, or accumulates
> rounding — and it is **not** evidence that attribution is meaningful. **C2 and C4 carry that
> weight alone.** Stating this now costs nothing; discovering it in the verdict would have meant
> reporting a PASS that three quarters of the predicate did not support.

### C2 — order-stability

Over **all 6 permutations** of the three largest-contributing classes (remaining classes held in a
fixed tail): no class's attributed share moves by more than **10 percentage points of `total`**,
**and** the rank order of the top three classes is **identical in all six runs**.

### C3 — cost (two limbs)

> **The cost basis this condition shipped with was WRONG, and C3 gains a second limb because of
> it (2026-09-03, the specialist review).** It read: _"one extra pass at 2,000 activities measured
> at ≈150 ms, from ADR-0116's 846.5 ms two-pass route against a 694.3 ms one-pass recalculate."_
> That subtraction is invalid. The two routes do not differ only in pass count: `recalculate`
> (`schedule.service.ts:265-312`) takes the plan advisory lock, asserts the pen, and then **writes**
> — `writeResults`, `writeDrivingFlags`, `stampScheduleComputedAt`, thousands of rows.
> `critical-path-test` writes nothing. So `846.5 − 694.3` is (one extra pass) **minus** (the entire
> write-back), not (one extra pass). ADR-0116's own `m6-measurement.md:60` states the caveat; the
> figure was quoted forward without it.
>
> Two reviewers measured the bare pass independently: **≈240 ms and ≈343 ms p95 at 2,000
> activities**, against the ≈150 ms asserted. So the capped replay is **3.1–4.4 s of engine alone**
> against a 3.0 s budget, before HTTP, hydrating two snapshots, building two graphs and diffing.
>
> **C3 as originally written could not have detected this**, because its subject is the 147-activity
> fixture, where 12 passes ≈ 320 ms — it clears 3.0 s by an order of magnitude and says nothing
> about the scale S6 is written for. A condition that cannot fail at the size that matters is not a
> condition. Hence **C3-b**.

**C3-a — cost on the fixture.** One full attribution over the 147-activity fixture completes in
**≤ 3.0 s p95** measured end-to-end over the real route, and the number of engine passes is
**O(classes present), capped at 12** — never O(changed activities).

**C3-b — cost at scale (the limb that can actually fail).** The same attribution over a
**2,000-activity** plan completes in **≤ 3.0 s p95** end-to-end. If it does not, C3 fails, and the
remedy is a scope decision for the product owner rather than a softened bar: shrink the replayable
class vocabulary until the pass count fits, restate S6 as a function of plan size, or accept that
Tier 3 is available only below a stated size — each with the measured number beside it.

Cost basis, corrected: **one bare `computeSchedule` pass at 2,000 activities is ≈240–343 ms p95**,
measured directly in-process rather than derived by subtracting two routes. The lower figure is the
more conservative of the two independent measurements and the higher was taken on a network
replicated as disjoint components, which shortens critical paths — so the true figure is at or above
240 ms, and the arithmetic above holds either way.

### C4 — non-vacuity (the pinned positive case)

The generated change set moves the carrier by **≥ 10 working days** and touches **≥ 3 distinct
classes**, at least one a **logic** change and one a **calendar** change.

**C4-b — the adversarial requirement.** At least **two** of the changed classes must act on
activities that **compete for the same float** — that is, they must share a float-bearing path to
the carrier. Without this, C1 and C2 can be satisfied by three independent, non-interacting chains
each carrying one class, which tests nothing about the order-dependence the epic exists to measure.
The review named the incentive plainly: a generator built by someone hoping for PROCEED will produce
exactly that change set unless the condition forbids it.

**C4-c — per-class non-triviality.** **Each** touched class must move the carrier by a non-zero
amount **on its own**, asserted per class rather than in aggregate. C4's ≥10-day/≥3-class bar can be
met with two classes carrying the whole movement and a third contributing exactly zero — and the
verdict would then claim to have validated a class that was never exercised.

The concrete trap is already known: a `DURATION` change applied to a `WBS_SUMMARY` (no logic,
ADR-0038), a `LEVEL_OF_EFFORT` (duration is an **output** — its span is derived) or a milestone (zero
duration by definition) is **silently inert**. `critical-path-test.ts:44-48` already carries this
knowledge as `PERTURBABLE_TYPES`. So the generator selects by a **type-aware candidate map per
class** read back from the API — never by index into the fixture array — and reuses that constant
rather than restating it.

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
