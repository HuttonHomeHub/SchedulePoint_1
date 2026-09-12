# CI sharding — Milestone 4: what it actually cost and bought

**Taken:** 2026-09-12 · **Epic:** `docs/specs/ci-sharding/` · **Decision:** ADR-0138

Every figure below is read from the GitHub Actions API (`created_at`, `started_at`,
`completed_at` per job), not from a stopwatch and not from the run list's own summary. The
sample sizes are stated beside each number because the whole reason this epic asserts no
wall-clock bar anywhere is that this repository has been burnt twice by treating one sample as a
distribution (feature-spec §1.4).

---

## 1. Before and after

| Stage                            | Whole-CI wall clock | Bounded by                                      | n   |
| -------------------------------- | ------------------- | ----------------------------------------------- | --- |
| Before the epic (one `e2e` job)  | **40–47 min**       | `e2e`                                           | 4   |
| After M2 (`e2e-api` + `e2e-web`) | **29.6 min**        | `e2e-web`                                       | 1   |
| After M3 (four web shards)       | **12.2–12.3 min**   | **`quality`** — the job this epic never touched | 2   |

The before figures are the four the register recorded: 46 m 32 s (PR #508, run `34613280766`),
40 m 10 s (PR #510), 40 m 15 s (PR #512) and 47 m 00 s (PR #513, run `34654774419`). They span
14.5 % of the largest and contain no outlier worth naming — the slowest of the four changed no
test, no workflow and no application code.

**So a CI round trip went from between forty and forty-seven minutes to twelve and a quarter.**
Against the range rather than against a point, that is between 3.3× and 3.8× faster.

### The M2 run — `34684970451`, 2026-09-12 09:06Z, all green

| job       | duration               | queue |
| --------- | ---------------------- | ----- |
| `e2e-web` | **1,770 s** (29.5 min) | 4 s   |
| `e2e-api` | 684 s                  | 3 s   |
| `quality` | 610 s                  | 4 s   |
| `image`   | 155 s                  | 4 s   |

Wall clock 1,774 s = **29.6 min**.

### The M3 runs, n = 2

Sample 1 — `34686507221`, the PR run, 2026-09-12 09:41Z, all green. Sample 2 — `34687047941`, the
push to `main` of the same commit, 09:54Z, all green. Same code, thirteen minutes apart:

| job               | sample 1             | sample 2             | queue |
| ----------------- | -------------------- | -------------------- | ----- |
| `quality`         | **735 s** (12.2 min) | **731 s**            | 2 s   |
| `e2e-api`         | 618 s                | **677 s**            | 2 s   |
| `e2e-web` shard 1 | 514 s                | 572 s                | 1–2 s |
| `e2e-web` shard 2 | 582 s                | 521 s                | 2 s   |
| `e2e-web` shard 3 | **662 s**            | 590 s                | 2 s   |
| `e2e-web` shard 4 | 602 s                | 476 s                | 2 s   |
| `image`           | 136 s                | 172 s                | 2 s   |
| **wall clock**    | **737 s (12.3 min)** | **733 s (12.2 min)** |       |

`quality` bounds both runs, within four seconds of itself. **Which end-to-end job is slowest changes
between them** — shard 3 in sample 1, `e2e-api` in sample 2 — and that is not noise to be smoothed
over. It is §1.3's prediction landing: at four shards the API job and the worst web shard are neck
and neck, and the constraint has passed to `quality`. Nothing below either of them moves the wall
clock.

---

## 2. Success criteria (feature-spec §1.2)

1. **A green sharded run's slowest end-to-end job is ≤ the same run's `quality` job.** **Met in both
   samples** — 662 s against 735 s, and 677 s against 731 s. Each comparison is inside one run, so
   no amount of between-run variance can move it. The end-to-end work is no longer CI's critical
   path, which is the thing the epic was for.
2. **`check:e2e-roster` verified red against each defect it names before it is armed.** Met — eight
   mutations at M1, four more at M3 when E4/E5 landed, each caught by the assertion written for it.
   Recorded in PR #516 and PR #518 — cited by pull request rather than by commit on purpose,
   because a squash-merge discards the branch commits those mutation sweeps were described in,
   so a SHA here would be a dangling citation the moment git collected it.
3. **`scripts/e2e-local.sh` and `scripts/e2e-sweep.sh` byte-unchanged.** Met, and checked rather
   than asserted: `git diff 97a1236e~1..HEAD -- scripts/e2e-local.sh scripts/e2e-sweep.sh` is empty
   across the whole epic. The local workflow did not change, because no suite was renamed, merged or
   regrouped (§4.6 D9).
4. **The per-shard wall clocks replace the projection in `docs/TECH_DEBT.md` #301.** Met _with a
   deviation_, recorded in §6 below: #301 is deleted rather than rewritten, and the ledger entry
   points here.

---

## 3. The projections, scored

| quantity                   | projected         | measured (n = 2) | error           |
| -------------------------- | ----------------- | ---------------- | --------------- |
| M2 whole-CI wall clock     | 35.8 min          | 29.6 min (n = 1) | −17.3 %         |
| M3 whole-CI wall clock     | 12.7 min          | 12.2–12.3 min    | −4.0 to −3.1 %  |
| `quality`                  | 764 s             | 731–735 s        | −4.3 to −3.8 %  |
| `e2e-api`                  | 690 s             | 618–677 s        | −10.4 to −1.9 % |
| slowest e2e job            | 690 s (`e2e-api`) | 662–677 s        | −4.1 to −1.9 %  |
| web shard, four-shard case | 609 s             | 476–662 s        | −21.8 to +8.7 % |

Two notes on reading that, and both are corrections to how this document first scored itself. **The
"slowest e2e job" row is what the spec actually predicted**, and it predicted the job's _identity_
as well as its duration: 690 s, and `e2e-api`. The duration is right to within 4 %; the identity is
right in one sample of two, which is the honest way to describe two jobs measured 45 s apart. And
**609 s is the spec's four-shard figure** — an earlier draft of this table scored against 618 s, a
number that comes from the M2 timeout commit's own derivation and not from §1.3 at all.

**The structural finding is in the first two rows, and it is not that one number was luckier than
the other.** The M2 projection is a function of `W` — the total web suite time, the one quantity
this epic measured from a single reference run. The M3 projection is a function of `quality`, a job
the epic does not touch and whose duration was never in dispute. The projection that depended on the
contested number was out by 17 %; the projection that did not was out by 3 %.

That is worth stating as a rule rather than as an observation: **§1.3's model was sound and its
worst input was a single sample.** A reader tempted to re-derive a shard count from this document
should re-measure `W` first, and from more than one run.

---

## 4. The approval gate between M2 and M3, and how it was wrong

The plan puts an approval gate after M2: if the two-job split does not land near 35.8 min, the model
is wrong about something and M3's projection inherits the error. It landed at 29.5 min — **17.5 %
under** — so the gate fired as designed.

The diagnosis was **sampling, not modelling**. M0's reference run put `W` at 2,049 s; the M2 run
measured the same 44 suites at 1,616 s of step time. At the time that was argued against a
1,610–2,096 s range _inferred_ by scaling the pre-split job durations; §5.2 has since measured the
web total four times directly and it lands at **1,616–2,049 s**, so the inference was right and the
reference run sits at the very top of the real range. Nothing about the arithmetic was wrong; the
number fed into it was a high draw.

**The re-derivation was then wrong in the other direction, and that is the part worth keeping.**
Re-deriving from M2's 1,616 s gave a worst shard of **425 s** of suite time. Measured — from the
run's own step timestamps, not by subtracting a modelled fixed cost from the job — the worst shard
ran **556 s** of suite time inside a job of 662 s. So:

- the original 593 s budget, packed from the high sample, **held**: 556 < 593;
- the re-derivation, packed from the low sample, would have been **exceeded by 31 %**.

Two single-sample estimates, one 17 % high and one 31 % low, drawn from a spread §5.2 now measures
at **21 % on the web total and up to 27 % on a single shard**. The conservative one is the one that survived contact, which is an argument for keeping a
budget packed from a pessimistic sample rather than for tuning it to the latest one.

The same thing happened to the API job, and nobody had to act on it: §1.3 models `A + P` at 640 s
and the two sharded runs measured that pair at **426 s and 484 s**, 33 % and 24 % under. It changes
no decision, because `e2e-api` is not the critical path either way — but it is independent
confirmation that the reference run was a high draw **across the board** rather than in the web
suites specifically, which is what makes "re-measure `W`" the right instruction rather than
"re-measure the slow suites".

## 5. The two questions the spec left open

### 5.1 Runner queue time (§1.5) — measured, and negligible

§1.5 named this the honest unknown: seven concurrent jobs where there were three, and the stated
lever if it dominated was **fewer** shards, not more. Measured across both sharded runs, every job's
`created_at` → `started_at` gap is **1–4 seconds**. It does not dominate; it does not register.

Three things bound that claim rather than leaving it to be over-read: it is a public repository, so
Actions minutes are free and the concurrency allowance is comfortably above seven; the measurements
were taken with no competing run of this repository in flight; and `cancel-in-progress` already caps
self-contention from repeated pushes. If a second contributor arrives and two PRs run at once, this
is the number to take again.

### 5.2 Does the packing need refining? — no, and the reason is a ratio

The assignment is longest-processing-time-first over M0's durations, and it packs the four shards to
within **17 s** of one another on paper. Measured against what each shard actually did, in both
sharded runs:

| shard      | packed   | suite time (s1) | suite time (s2) | swing        |
| ---------- | -------- | --------------- | --------------- | ------------ |
| 1          | 504 s    | 400 s           | 482 s           | +82 (+21 %)  |
| 2          | 504 s    | 488 s           | 403 s           | −85 (−17 %)  |
| 3          | 521 s    | 556 s           | 495 s           | −61 (−11 %)  |
| 4          | 520 s    | 511 s           | 372 s           | −139 (−27 %) |
| **spread** | **17 s** | **156 s**       | **123 s**       |              |

**The same shard, running the same steps on the same commit thirteen minutes later, varies by up to
27 %.** The packed spread is 17 s. Runner-to-runner and suite-to-suite variation therefore dominate
the assignment by something between seven and nine to one, and that is now measured across two runs
rather than inferred from one.

Refining the bin-packing would be tuning an input contributing roughly an eighth of the observed
spread, in noise several times its own size. **Leave it.** The condition under which that stops
being true is in §7.

The per-shard fixed cost measures **86–112 s** against the 97 s the model assumed — the one term the
model got right, and the reason a shard's job duration and its suite time track each other closely.

**And the web total is now measured four times**: 2,049 s (the M0 reference), 1,616 s (M2, all 44 in
one job), 1,955 s and 1,752 s (the two sharded runs, summed across shards). A range of 1,616–2,049 s,
**21 % of the largest**, with the packing derived from the top of it. That is the same conclusion §4
reaches from a different direction, and it is the single most useful number in this document for
anyone re-deriving a shard count later.

### 5.3 Where the between-run variance lives (§1.4's last bullet, R4) — in both segments

§1.4 named this and left it open in as many words: _"no segment breakdown was captured for any
sample but the reference, so it is not known whether the 410 s between fastest and slowest lands in
the API suite, the web suites, or the setup"_ — and flagged that if the variance were concentrated
in the web suites, the shard budget would have less headroom than it looks.

It is **not** concentrated there. Four measurements of each segment, all from step timestamps:

| segment                       | samples                          | range         | spread   |
| ----------------------------- | -------------------------------- | ------------- | -------- |
| web suites (total, 44 suites) | 2,049 / 1,616 / 1,955 / 1,752 s  | 1,616–2,049 s | **21 %** |
| API suite + pairwise          | 640 / 618 / 426 / 484 s          | 426–640 s     | **33 %** |
| per-shard fixed cost          | 86–112 s across eight shard-runs | 86–112 s      | 23 %     |

So the 410 s is not a web-suite effect that would eat the shard budget; every segment measured
swings by a comparable fraction, and the fixed cost — the term the model predicted best — swings
as much proportionally as the suites do. **The reference run was a high draw across the board**,
which is why §4's instruction is "re-measure `W`" rather than "re-measure the slow suites".

Two things that follow. The shard budget's headroom is as it looked, so nothing about D1 changes.
And the **API-suite trigger in §7 must be read as a range, not a number**: at 426–640 s that suite
is not a stable quantity either, so "`quality` below 690 s in two consecutive runs" is the trigger
precisely because it is the comparison that does not depend on this variance.

## 6. Deviations from the approved plan, and why

**Task 4.2 said to keep #301 and mark it `closed`. It is deleted and ledgered instead.** The plan's
wording predates nothing — it is simply wrong about this register's own rule, which is stated at the
top of `docs/TECH_DEBT.md` ("rows are **deleted** when done") and enforced by `check:debt-status`
A2, whose vocabulary is `open` / `deferred` / `standing` / `unverified` and contains no `closed`.
Following the plan would have failed the gate.

The plan's underlying worry is right and is served: it says the row's arithmetic is what a future
reader will cite, and that leaving a wrong ceiling inside a closed row is how a corrected claim gets
re-inherited. The ledger entry for 301 points at **this file**, which carries the measurement, the
corrected ceiling and the scoring above. A reader following the number reaches the right document.

**Task 4.1 asked for three sharded runs and this document has two.** Stated rather than glossed.
The third is this change's own CI run, which does not exist while the document is being written —
the honest options were to hold M4 open for a run whose only purpose is to be counted, or to ship
n = 2 and say so. The two agree to within 4 s on the number the epic is about (wall clock) and
disagree by up to 27 % on the numbers §5.2 argues are noise, which is exactly the shape a third
sample would have to contradict to change any conclusion here.

**M2 has n = 1 and always will.** It exists in the tree for one commit, so there is no second sample
to take. Every M2 figure above is a single observation.

---

## 7. Re-open triggers

Derived rather than chosen, so a future reader can check them instead of re-arguing the shard count:

- **Web total exceeds 2,372 s.** Four shards then need more than 593 s each, and the worst shard
  starts competing with `quality` for the critical path. Re-measure `W` across three runs before
  acting.
- **Browser install exceeds 128 s.** The per-shard fixed cost is paid four times, so this term is
  the one that makes more shards actively worse.
- **`quality` drops below 690 s in two consecutive runs.** Only then does splitting the 499 s API
  suite buy any whole-CI wall clock at all — today it buys **zero**, because `quality` is underneath
  it. This is the trigger for the API-suite work, and it is a measurement, not an opinion.
- **The measured shard spread stops dominating the packed spread.** §5.2's "leave it" rests on a
  9:1 ratio. If that ratio approaches 1, refining the assignment starts to be worth something.
