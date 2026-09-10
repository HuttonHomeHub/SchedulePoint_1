# ADR-0129 — Identity across two imports is the code, and the match is shown before what it produced

- **Status:** Accepted
- **Date:** 2026-09-08
- **Supersedes:** nothing
- **Amends:** nothing — the shipped plan-nested comparison is byte-identical after this epic
- **Builds on:** ADR-0050 (an import always targets a new plan), ADR-0045 (an org-scoped route for a
  two-plan subject), ADR-0125 (the delta, and D1's parity sentence), ADR-0126 (a baseline freezes
  the plan's shape), ADR-0127 (the overlay draws what it knows and counts what it does not),
  ADR-0082 (omit versus shade), ADR-0116 (caps carry their true totals; the role-invariance gate)
- **Spec:** [`docs/specs/revision-compare-imported/`](../specs/revision-compare-imported/)

## Context

Three tiers of revision comparison ship, and every one of them is plan-nested and correlates on
`activities.id`. That is right for the case they were built for — a plan against its own baseline —
and it cannot answer the case a planner actually pays for.

**An import always targets a NEW plan** (ADR-0050). So a re-issued P6 file arrives as a **sibling
plan**, not as a baseline of the first, and the two plans share no activity ids at all. A comparison
keyed on id reports every row of one as removed and every row of the other as added: technically
true, and a picture of nothing.

**The blocker is identity, not plumbing.** Everything downstream already works across two plans —
`computeRevisionDelta`'s own docblock records that it cannot tell which side came from
`baseline_activities` and which from `activities`, which is exactly why baseline-vs-baseline was free
at ADR-0125. What was missing was an answer to "is this the same activity?"

## Decisions

### D1 — the correlation key is `activities.code`, matched exactly

No case folding, no trimming, no punctuation normalisation. `uq_activities_plan_code` is a plain
btree on `text` and is therefore **case-sensitive**, so `EXC-100` and `exc-100` are two activities
the product permits inside one plan; folding would map them onto one key and **manufacture a
duplicate the database deliberately allows**. ADR-0073 C2.1's `toLowerCase()` precedent does not
transfer: there the stored row is itself lowercased, so folding restores an equivalence the data
asserts, and here nothing is folded anywhere.

The four cases are answered in `revision-correlate.ts` and each has a named unit case:

- **absent** — an uncoded row is excluded from the correlation and **counted**, in its own third
  state. It is neither an addition nor a removal, because the product does not know which, and
  folding it into either would be the ADR-0073 C1 defect: two facts arriving in one channel as one.
- **duplicated within one side** — **not a branch, because the database refuses it.**
- **one-sided** — reported as removed or added, with the re-code ambiguity stated rather than
  resolved (see Consequences).
- **re-used across sides** — the match, presented under one key so the unmodified pure functions can
  run.

**The duplication answer is a recorded finding rather than a design choice.** The backlog row and
this epic's own brief both asserted that `Activity.code` has **no** unique constraint, and named the
method that established it: grepping for `@@unique`/`@unique`. That method **structurally cannot see
the answer**, because Prisma cannot express a partial unique index and every one of them in this
repository lives in raw SQL. The obligation that leaves is a **test** — an API e2e case reads
`pg_indexes` on the running database and asserts the index is still UNIQUE over `(plan_id, code)`
with its partial predicate, and proves the assertion discriminates by relaxing the index inside a
rolled-back transaction and requiring the assertion to reject it. Reading the migration file would
have described history rather than what is currently enforced.

### D2 — a match the reader cannot verify is a refusal

The coverage block is rendered **and announced before** anything derived from it, on screen and on
paper, because every number below it is worth exactly what it says they are: "twelve left the
critical path" means one thing at 98 % coverage and something else at 40 %. Every count is present
including the zeroes — a missing count is indistinguishable from a zero one — and every capped list
carries its **true total** beside it (ADR-0116 D3).

`matched === 0` is a **200 with a typed reason and no delta**, not a 4xx: the question was well
formed and the answer is a fact about the data. Running the delta anyway would report every old
activity as removed and every new one as added, which is ADR-0125's gate-pass defect verbatim — each
row technically true, the picture a lie, in exactly the meeting-prep moment this feature exists for.
The reason is carried on the criticality block **as well as** at the top level, and that is not
redundancy: a consumer reading only that block would otherwise see four empty sets and a null reason,
which reads as "assessed, and nothing changed".

**No hard coverage threshold below which the comparison is refused.** That would be a number tuned to
no data, and a partial match is precisely the case the coverage block lets a human judge. Only the
arithmetic refusal is imposed.

### D3 — the route is org-scoped, not plan-nested

`GET /api/v1/organizations/:orgSlug/cross-plan-revision-compare`, following the precedent
`docs/API.md` states in as many words for cross-plan dependencies: a route carrying **two** plan ids
has no honest `:planId` segment, and nesting it would make that segment a lie for one of the sides.
Both plan ids are **required**, so no union state exists for the service to answer for.

**The shipped route is byte-identical**, asserted by its existing e2e cases passing unchanged rather
than claimed. Widening it was rejected: it would change a contract for every existing consumer to
spare one controller.

### D4 — two org-scoped resolutions, a uniform 404, and a same-plan 422 that comes first

Both plans resolve in one round trip and either miss is the same 404 — never a 403, which would
confirm the id names a real plan somewhere. Each side's revision is resolved **against its own
plan**, so a baseline of the other plan named on the wrong side is a 404 too rather than a quiet
comparison of unrelated snapshots.

`fromPlanId === toPlanId` is **422 `CROSS_PLAN_SAME_PLAN`, checked before the revisions are
resolved**, and the ordering is the decision rather than the check: a same-plan pair is the wrong
question whatever revisions it names, so resolving them first would answer a 404 about a revision
when the real answer is "use the other route" — sending a reader to look for a typo in an id that is
perfectly correct. It is not a silent success because **the two routes correlate on different keys**:
a re-coded activity reads as `RECODED` on the plan-nested route and as removed-plus-added here, so
answering it would give a different and worse answer to something the product already answers well.

### D5 — the pure functions are not modified

The correlation fills the slot the delta, the classifier and the ghost builder already correlate on;
their existing suites pass **unchanged** and are the before/after oracle (the ADR-0078
barrel-preserving argument). What was extracted rather than copied is the pair of **side
projections** — a second copy would drift, and the drift would be invisible, because each projection
looks right alone and only a reader comparing a same-plan report against a cross-plan one over the
same activity would ever see one side missing a field the other carries. A structural test asserts
one definition, and it was widened to `apps/api/test` after it found a verbatim copy sitting there
under a comment saying this milestone would remove it: the difference between an intention and a
gate.

### D6 — the parity sentence is ADR-0125 D1's strong form

**`computeSchedule` is not called, not imported, and not reachable from this feature's module
graph. The ADR-0034 recalculation parity gate is untouched by construction.** It is verifiable
rather than asserted: both sides are persisted columns, so there is no input to hold parity for.
Enforced by a gate that already existed and that covers the new module on the day it was written,
because `revision-sources.ts` derives its roster by the `revision-` prefix.

**ADR-0116 D7's weaker sibling — "computes read-only, persists nothing" — does not apply and is
named so nobody reaches for the wrong one.** That sentence belongs to the critical-path test, which
genuinely runs the engine twice. Nothing here runs it at all.

### D7 — the overlay draws what has an honest lane and counts what does not

**Time is a shared coordinate across two plans and lane is not.** `fromStart`/`fromFinish` are
absolute calendar dates, comparable between any two plans; a lane index is a position in a layout
each plan derived alone — an imported activity's lane is its position in the source file until phase
3 repacks it by computed dates, and phase 3 is best-effort, so one plan may be time-packed and the
other still in source order.

So: a **matched** activity's ghost is placed at the **anchor's** lane, which is honest by
construction — it is literally where that bar is in the diagram being drawn on. One-sided work has
no honest lane here and is **counted** through ADR-0127 D3's existing channel rather than placed.

**The `moved` test drops its lane clause cross-plan**, and that is the epic's single most dangerous
line: left in, it fires on nearly every activity and the overlay silently becomes the whole-old-plan
design the product owner rejected at ADR-0127 CQ-2 — busy, plausible, and failing nothing. A unit
case on a pair identical except for lane packing asserts **zero** ghosts, verified red.

**ADR-0127 D2 is not overturned; it is applied.** The lane is still recorded and never guessed.
Cross-plan there simply is no recorded lane for one-sided work, so it is not drawn.

The overlay's **undrawable sentence takes a reason discriminator**, because the two comparisons have
different true answers and one is not the other's default. Same-plan the old side did not record a
position; cross-plan it **did**, and the position is not comparable. Reusing the same-plan wording
would state something false about the other plan's data — the likeliest defect in the milestone,
precisely because the mechanism is correct and reusing it feels like reuse.

**The exported picture names both plans.** The comparison overlay is composed into the deliverable
(ADR-0103), so a title naming one plan over ghosts drawn from another is a false statement to
exactly the reader an export exists for. Established by reading the title band rather than assumed.

### D8 — no schema change, and that is a statement rather than an omission

There is no model, column, index, constraint or migration in this epic, confirmed against the diff,
so `database-architect` is not engaged. Recorded so "the agent was not run" cannot read as an
oversight. **A persisted comparison entity was rejected**: nothing needs storing, both sides are
persisted and the derivation is pure and cheap, and a capture entity would bring a model, a
migration, a retention decision and a cascade — ADR-0125 deleted exactly that milestone for exactly
this reason.

### D9 — the printed document and the screen state the same facts, both ways

The rule is symmetric: **the printed document states no fact the screen withholds and withholds none
the screen states.** Both directions are asserted, because this repository has shipped each once —
ADR-0125's gate pass found three facts printed while the screen withheld them; ADR-0106's found the
inverse. The test walks the ONE shared sentence module and asserts both renderings consume it, which
makes the claim structural rather than a comparison of two hand-written lists.

The one deliberate asymmetry is an **affordance** and not a fact: the correlation rows print in full
where the screen keeps them behind a disclosure. Paper has nothing to open, so a collapsed list there
is a list nobody can read; expanding every list on screen would bury the sentence the block exists to
lead with.

## Rejected

| Option                                            | Why not                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Match on `name`, or fall back to it**           | P6 makes the **code** unique, not the name, and this repository has the measurement: a real file carried **1,911 duplicate names and 0 duplicate codes**. A name match cannot be verified by the reader and would silently pair different work. Put to the product owner as CQ-2 rather than decided unilaterally.                                                             |
| **Case-folding the code**                         | Would manufacture duplicates the database deliberately permits (D1).                                                                                                                                                                                                                                                                                                           |
| **A persisted `PlanComparison` entity**           | See D8.                                                                                                                                                                                                                                                                                                                                                                        |
| **A hard coverage threshold**                     | A number tuned to no data. See D2.                                                                                                                                                                                                                                                                                                                                             |
| **Both sides freely chosen**                      | Reveal would have no single meaning, the 380 px dock does not fit a third free-standing picker, and "compare this against that older import" is the question a planner asks. Put to the product owner as CQ-1 and not taken. A fourth reason emerged later and is recorded because nobody was pricing it: a fixed anchor is what makes the overlay's link half work unchanged. |
| **Deferring the overlay to a later milestone**    | Rejected by the product owner as CQ-3: it would create a release in which the `Compare on diagram` toggle is present and declines for a comparison the product can perfectly well draw.                                                                                                                                                                                        |
| **A reserved band below the scene for lost work** | A remedy designed for a guess that D7 no longer has to make.                                                                                                                                                                                                                                                                                                                   |

## Consequences

**A re-code is indistinguishable from a removal plus an addition, permanently and by construction.**
The product says so, in the reader's words, wherever added or removed rows appear — rather than
implying a fidelity it does not have. The same is true one level down for a **re-typed link**: the
edge key is `(predecessorCode, successorCode, type)`, the triple `uq_dependencies_pred_succ_type`
guarantees is unique within a plan, and the type has to be in it because one plan may legitimately
hold an FS and an SS between the same pair. So a re-typed link is one REMOVED plus one ADDED, while
a lag change keeps the key and is CHANGED. Honest rather than wrong, and written down because the
epic's own journey asserted otherwise on its first run.

**MSPDI imports whose code falls back to `<WBS>` correlate poorly across revisions.** An outline
number renumbers when a task is inserted. Reasoned from the MSPDI schema, not observed in a real file
in this repository — labelled as such (ADR-0083's rule) rather than presented as measured.

**The diagram cannot say where removed work sat, only that it existed.** That is the same limitation
a pre-ADR-0126 baseline already carries, through the same mechanism and a different sentence.

**The rate budget is the global one**, on a rule committed before the number existed: at or under
250 ms p95 the global budget stands. Measured 215.2 ms end-to-end at 2,000 activities per side, with
the harness half of the same run at 208.2 ms and both divergences from the M0 figure stated rather
than smoothed. Worth recording that the fallback formula would have yielded a budget **looser** than
the global one it would have replaced — a second reason the threshold rule was the right instrument
and the formula alone would have been the wrong one.

**That figure is one reading of an instrument whose spread is comparable to its own bar, and the
release found out how.** Re-run on the same container while PR #491 was in CI, the same code
reported **255.2 ms end-to-end in the suite — a FAIL — and 191.2 ms alone, a PASS**, against 215.2
here; and the harness half inverts, passing at 211.0 ms in the suite and failing at **5954.2 ms**
alone, because run in isolation its first five samples are 5937/5954/5902/6045/5748 ms before it
settles to ~160 ms. **Each configuration passes one half and fails the other.** CI's own runner then
passed both, which is what let the epic merge — so the conclusion this decision rests on is
unchanged and the confidence in the number is not. Then CI failed the probe at **5050.6 ms on a
pull request that changed two markdown files**, which moved it from a filed observation to a gate
blocking unrelated work. **The assertions are gone** (product-owner decision, 2026-09-09): both
figures and every sample are still printed, the non-vacuity checks stay, and neither the bar nor the
cold samples were touched — a falsification condition is a measurement taken to settle a question,
not a standing gate, and both sibling M0 probes and ADR-0128 had already said so. The probe's own
docblock had also attributed those cold opening samples to suite contention, which the isolated run
falsifies: nothing else was running. `docs/TECH_DEBT.md` **#266** carries the detail and what is
still owed — the probe runs minutes of measurement on every pull request and now asserts nothing, so
it wants its own CI step the way the ADR-0066 pairwise differential has one.

**P3 — the overlay's paint cost on a cross-plan pair — is TAKEN, and it PASSES** (product owner's
hardware, 2026-09-09T08:20Z, `web-v0.125.0`). It could not be taken in this container, whose own
no-change baseline moved by five times the bar between two runs an hour apart, so it went to the
ADR-0128 staff probe: `revision-diff`, **Week** framing, 2,000 activities per side, 180 frames × 3,
1912×948 CSS px on an Intel Arc Pro. **Baseline 0.00 pp, treatment 0.00 pp at 60.0 fps, delta
+0.00 pp** against ADR-0127's 2.00 pp bar.

**The verdict is meaningful rather than merely favourable, and the reason is the second limb.** A
delta inside the bar decides nothing on its own — ADR-0127 D8 recorded a run where the machine's own
no-change baseline moved 0.56 → 1.85 pp and 0.93 → 10.00 pp, and the honest outcome there was
INDETERMINATE. Here the **run-to-run spread is 0.00 pp**, well below the bar, so the instrument could
resolve the question it was asked. It is also the mirror image of `docs/TECH_DEBT.md` **#260**: that
row records a Fit-framing baseline of 98.33 pp leaving the delta arithmetically incapable of failing,
whereas an **unsaturated** 0.00 pp baseline leaves the delta free to rise, and it did not.

**And it was not vacuous** — the probe reports **37 of 264 on-screen bars changed (14.0 %) and 49 of
372 links (13.2 %)**, so the overlay was drawing when it was measured. A pair with nothing to draw
would have produced the same beautiful number for the wrong reason, which is why the plan made the
drawn-ghost count a task step rather than a closing formality.

**The prediction holds.** D7 narrows what is drawn, so the cross-plan overlay should cost **no more**
than the same-plan one; ADR-0127 D8a's same-plan reading was baseline 0.19 pp / treatment 0.00 pp at
60.0 fps, and this is 0.00 / 0.00 at 60.0 fps. **Materially more would have meant the lane clause
leaked back in** — the epic's most dangerous defect, because it fails no gate and merely looks busy.
It did not.

**What this does NOT establish, restated so it is not quietly widened.** One framing, one machine.
**Fit remains ungraded** (#260), and Week culls hard — 264 of 2,160 bars are on screen at 12.00 px/day
— which is ADR-0128's second reading set saying the same thing: cost tracks **bars drawn**, not plan
size. So "the overlay is free" is true of the framing a planner works at and is not a claim about
every framing. And a 0.00 pp baseline cannot resolve a cost below one dropped frame in 540, which is
far under the bar and therefore does not touch the verdict.

**No feature flag.** ADR-0088 D1 established that a `VITE_` constant is inlined at build time and has
never been an operator rollback; the rollback here is a commit boundary, and the panel's existing
suites plus a journey step asserting the return to **This plan** are the contract.
