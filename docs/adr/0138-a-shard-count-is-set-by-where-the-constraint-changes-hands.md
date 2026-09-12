# ADR-0138: A shard count is set by where the constraint changes hands

- **Status:** **Accepted** — 2026-09-12
- **Date:** 2026-09-12
- **Deciders:** product owner ("Approve — build it", 2026-09-12, on the four-shard spec); this pass
  (the milestone slicing, the approval gate's verdict, and every measurement that changed a number)
- **Extends:** ADR-0058 (a gate that fails on day one gets deleted rather than fixed), ADR-0076
  Class 1 and Class 3 (an uncomputed count; a claim asserted and never checked), ADR-0093 (a census
  needs a pinned positive case), ADR-0105 (a shared gate is a full-spec trigger), ADR-0110 D5 (a gate
  is finished when the defect it names has made it fail), ADR-0136 (a rule is enforced where the
  artefact lands, and the roster is derived)
- **Supersedes:** nothing.
- **Spec:** [`docs/specs/ci-sharding/`](../specs/ci-sharding/)
- **Measurement:** [`docs/specs/ci-sharding/m4-measurement.md`](../specs/ci-sharding/m4-measurement.md)

## Context

`.github/workflows/ci.yml` declared three jobs, and one of them — `e2e` — ran **46 `test:e2e`
invocations as sequential steps on a single runner**. It was the critical path of every CI round
trip, at **40–47 minutes across four samples**. On a repository whose one merge gate is a human
reading check runs (`CLAUDE.md` §19.9, and §8: `main` carries no branch protection), that is the
cost of every correction, however small.

The obvious remedy is a matrix, and the reason this needed an ADR rather than a workflow edit is
that **the obvious remedy has a ceiling, and the ceiling is not where a reader looks for it.**
`docs/TECH_DEBT.md` #301 filed the problem with a table whose "critical path" column was the slowest
**end-to-end job** — the right quantity for a row about that job, and the wrong one for choosing a
shard count, because the `quality` job runs alongside and this epic does not touch it. Measured
against **whole-CI wall clock**, three shards buy 13.0 min and four buy 12.7: a gap of **sixteen
seconds**, not the minute and a half the row implied. Past four, nothing improves at all.

So the question is not "how far does this shard?" but **where does the constraint change hands?** —
and the answer was knowable before a line was written.

## Decision

**D1 — Split `e2e` into `e2e-api` and a four-entry `e2e-web` matrix.** Four, because that is where
the slowest web shard drops below `quality` and the binding constraint passes to a job this epic
does not touch. A fifth shard spends a runner to buy nothing. `fail-fast: false`, because the whole
value of sharding is lost if one red shard cancels the other three and hides what they would have
said.

**D2 — The assignment is a per-step `if:` condition, not a suite list in the matrix.** The 44 steps
carry load-bearing comments — which flag each suite pins, which defect it was written for — and a
list of script names in a `matrix` entry carries none of that. This is the same ruling
`check:ci-roster` already made for the gate steps (ADR-0136), extended to the suite steps.

**D3 — The assignment is derived, and the derivation is checked by a second one.** Longest-
processing-time-first over measured durations, with a name tie-break so it is reproducible.
`check:e2e-roster` then recomputes the four shard totals **from `ci.yml`'s own conditions** and
compares. Two derivations from different inputs reaching the same answer is the property; an
eyeballed assignment has no such property.

**D4 — The balance is printed and never asserted.** No gate in this epic carries a wall-clock bar.
Five samples of the same unchanged job span 14.5 %, and two of the slowest changed no test and no
workflow at all — so a duration assertion here would fail on a slow runner and be deleted rather
than fixed, which is ADR-0058's rule verbatim. A suite with no recorded duration is charged the
**largest** measured, never zero: a zero lets a new suite ride free in a packing.

**D5 — A timeout is a per-job runaway guard derived from that job's own expected duration, not a
per-epic constant.** See §"The defect this epic shipped" below; this clause exists because the first
version was a per-epic constant and it cancelled a healthy job.

**D6 — The 499 s API suite is deferred on a named, measured trigger**, not on "it is a different
mechanism". Splitting it buys **zero** whole-CI wall clock while `quality` sits underneath it. The
trigger is `quality` dropping below 690 s in two consecutive runs.

**D7 — No changeset and no release.** Nothing under `apps/` changes in any slice, so no image, no
migration, no bundle and no product behaviour is affected. The epic's terminal condition is
"merged", not "released".

## Consequences

**Measured, 2026-09-12: 40–47 min → 29.6 min (two jobs) → 12.2–12.3 min (four shards, n = 2).**
Between 3.3× and 3.8× faster, against the range rather than against a point. In both sharded runs the
slowest end-to-end job is below the **same run's** `quality` — 662 against 735, and 677 against 731 —
a within-run comparison that between-run variance cannot move, so **the end-to-end work is no longer
CI's critical path**, which is what the epic was for. Which end-to-end job is slowest **changes
between the two runs** (a web shard, then the API job), which is §1.3's prediction landing rather
than noise: at four shards those two are neck and neck and the constraint has passed to `quality`.
Every figure is in the measurement document with its sample size beside it.

**A hole closed that predated the sharding.** Nothing had ever asserted that `ci.yml`'s 44 web steps
matched `apps/web/package.json`'s 44 scripts; they agreed by hand. `check:ci-roster` reads root
`check:*` gates and stops there, and `check:counts` counts `e2e-*` **directories** — a different
quantity, since two suites share `./e2e-account` — so that count can be right while a suite is
unwired. Neither could see this in either direction. The gate shipped **before** the shards
deliberately: the roster lands before the roster gets more complicated.

**Runner queue time, §1.5's honest unknown, is answered: 1–4 seconds per job**, across both sharded
runs. It does not dominate, so the stated lever (fewer shards) never had to fire. Bounded rather
than over-read: public repository, no competing run in flight, `cancel-in-progress` capping
self-contention. A second contributor running concurrent PRs is the condition to re-measure.

**A named open assumption is closed, and its answer was not the worried one.** §1.4 left it unknown
whether the 410 s between the fastest and slowest pre-epic run lands in the web suites, the API
suite or the setup, and flagged that if it were the web suites the shard budget would have less
headroom than it looked. Four measurements of each segment say it is in **all** of them — web total
1,616–2,049 s (21 %), API suite + pairwise 426–640 s (33 %), per-shard fixed cost 86–112 s (23 %).
The reference run was a high draw across the board, which is why the instruction to a future reader
is "re-measure `W`" rather than "re-measure the slow suites".

**Refining the packing is now known to be below the noise.** Packed spread **17 s**; measured
suite-time spread **156 s and 123 s** across the two runs — and the same shard, on the same commit
thirteen minutes later, swings by up to **27 %**. The web total itself is measured four times at
**1,616–2,049 s, a 21 % range**, with the shipped budget packed from the top of it. D4's refusal to
assert a duration anywhere is that number's direct consequence.

## What this epic got wrong, and how each was caught

Recorded because the pattern is the useful part: **instruments and documents were wrong more often
than the code was.**

**1 — The gate printed a correct-looking summary with two regex bugs in it.** `stepsIn` shipped a
group that ran past the end of its own step, pairing step N's shard with step N+1's script; the fix
for that — `[ \t]+(?!run:|- )` — does not work and looks like it does, because the quantifier
backtracks one space so the lookahead lands on a space rather than on the dash. Written
`(?![ \t]*(?:run:|- ))` the test is made at the line's start with nothing to backtrack into. Neither
was visible against the real workflow, which cannot exhibit either, and neither was caught by
reading the expression. Both went red against a fixture. This is ADR-0110 D5's whole argument: a
gate is finished when it has been **made to fail** by the defect it names.

**2 — Two assertions could not fail, and a mutation sweep found them.** M1's prefix-guard case was
green against its own mutation **and** its docblock's stated reason was wrong: `(?![:\w-])` does not
stop `test:e2e` matching inside `test:e2e:minimap` (the greedy optional group already handles that);
what it stops is a neighbouring script whose name merely begins the same way, `test:e2e-smoke` or
`test:e2extra`, which would make the **base** suite read as wired by a step running something else.
M2's `missingFrom` "sorted" case passed an input that was already sorted, so deleting the `.sort()`
left it green.

**3 — `check-build-contract` read only the first build step**, by a non-global `exec`. Proven rather
than assumed: with `@repo/layout` deleted from the second job's step, the gate printed
`Build contract OK — 5 shared package(s) built by every consumer`. M2 created the second step, so
this defect was **created and found inside the same milestone**.

**4 — The defect this epic shipped.** M2's first CI run cancelled `End-to-end tests (web)` at
30m08s, on a `timeout-minutes: 30` added in the same commit and described there as "a runaway guard,
not a bar". It was a bar, and it fired on a job doing exactly what it was designed to do. The
approved spec says 30 "on each e2e job" and derives it against "a ~11 min projection" — sound for the
**end** state, and silent about the **intermediate** state that milestone creates, where §1.3 of the
same document projects the web job at 35.8 min. **The guard sat below the projection in the document
containing both numbers**, and nobody put them side by side, including me, twice: once writing the
commit that added it and once reading the spec line that specified it. D5 is the correction.

**5 — The approval gate fired, and the re-derivation it produced was wrong in the other direction.**
M2 landed at 29.5 min against 35.8 projected, 17.5 % under. Diagnosed as sampling rather than
modelling: M0's reference put the web total at 2,049 s, near the top of the 1,610–2,096 s range the
pre-split samples imply. Re-deriving from M2's 1,616 s gave a worst shard of 425 s; measured, it ran
**556 s — 31 % above**. So two single-sample estimates, one 17 % high and one 31 % low, from the same
variance. **The conservative budget held (556 < 593) and the re-derivation would have been
exceeded** — an argument for packing from a pessimistic sample rather than tuning to the latest one.
The verdict was PROCEED either way, because both figures sit below `quality`.

**6 — The projection that depended on the disputed number was wrong; the one that did not was
right.** M2's whole-CI projection is a function of the web total, and it was out by 17 %. M3's is a
function of `quality`, which the epic does not touch, and it was out by 3 %. That is a property of
the model's inputs rather than luck, and it is the reason D1's ceiling argument survived a badly
sampled `W`.

**7 — The approved plan's own closing instruction was wrong about this repository.** Task 4.2 said
to keep `docs/TECH_DEBT.md` #301 and mark it `closed`. `docs/TECH_DEBT.md`'s stated rule is that
rows are **deleted** when done, and `check:debt-status` A2's vocabulary is
`open`/`deferred`/`standing`/`unverified` with no `closed` in it — so following the plan would have
failed the gate. The plan's underlying worry is right and is served differently: the ledger entry
points at the measurement document, which carries the corrected ceiling, so a reader following the
number reaches the right place.

**8 — And the spec created a drift finding in the act of flagging one.** §4.9 records, carefully and
as a service to the next reconciliation pass, that ADR-0137 is absent from `CLAUDE.md` §16 — the
ADR-0132 finding (`docs/TECH_DEBT.md` #291) recurring. **It is not absent.** The register entry
landed in `3c4a6161` at 22:50 on 2026-09-11 and the spec's claim was written in `0825fe0a` at 00:30
on 2026-09-12, **100 minutes later, against a tree that already had it.** ADR-0076 Class 3, in a
paragraph whose subject is exactly that class, written by the same hand in the same session. Nobody
would have caught it by reading, because the paragraph reads as diligent; it took one `grep`. The
spec's note is corrected in place rather than deleted, because the corrected version is more
instructive than a clean file.

## Options considered

- **Do nothing.** Rejected: 46 minutes is the cost of every correction on a repository whose merge
  gate is a person reading a check list.
- **Two, three, six or eight web shards.** Two and three leave the web side on the critical path;
  six and eight spend runners to buy nothing, because `quality` is underneath. Four is where the
  constraint changes hands.
- **Merge suites to reduce the step count.** Rejected: it changes what a red check means and takes
  away the per-suite flag pinning the suites exist for. `scripts/e2e-local.sh` and
  `scripts/e2e-sweep.sh` are byte-unchanged across this epic, checked rather than asserted.
- **Concurrency within one runner** (Playwright workers). Rejected: the suites share one database,
  so parallelism inside a job is a data race rather than a speed-up. Sharding gives each job its own
  disposable Postgres, which is what makes the split safe.
- **A computed packer that rewrites `ci.yml`.** Rejected for now: generated workflow YAML would
  destroy the load-bearing per-step comments (D2), and §5.2's 9:1 ratio says the packing is not where
  the remaining seconds are.

## Re-open triggers

Derived, so a future reader checks them rather than re-arguing the shard count: web total above
2,372 s; browser install above 128 s; `quality` below 690 s in two consecutive runs (the API-suite
trigger, D6); or the measured shard spread ceasing to dominate the packed spread.

**The CPM engine is not imported and no migration runs**, so the ADR-0034 recalculation parity gate
is untouched in its honest form: there is nothing here to hold parity for. `apps/` contributes zero
files to this epic's diff.
