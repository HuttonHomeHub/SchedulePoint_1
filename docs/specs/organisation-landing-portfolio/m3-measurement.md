# M3-T4 — FC-2 and FC-3, re-measured with the standing read shipped

**Status:** Approved

|             |                                                                            |
| ----------- | -------------------------------------------------------------------------- |
| **Taken**   | 2026-09-15T11:29:25Z                                                       |
| **Against** | the working tree of M3 (M3-T1 + M3-T2 + M3-T3), API and web dev servers    |
| **Harness** | `apps/web/scripts/measure-overview-endpoint.mjs`                           |
| **Reps**    | 30 after 5 warm-up, per shape, paced at one request per 660 ms             |
| **Bar**     | FC-2 p95 < 200 ms · FC-3 no `JIT:` node and estimated total cost < 100,000 |

---

## 0. The harness was measuring the wrong query, and that is this task's first finding

M0's version of this harness carried the recently-changed SQL as a **hand-copy**, under a docblock
saying "if that file changes, this must be re-copied, and the harness says so in its output rather
than relying on somebody remembering".

It did not say so, and nobody remembered. **M2 added `p.schedule_computed_at` to the real query and
the copy was never updated**, so between M2 and now, FC-3 was grading a query the endpoint no longer
ran — silently, with a green verdict, in the instrument whose own premise is that a paraphrase
measures the paraphrase. It was found by opening the file, not by anything failing.

So the drift class is removed rather than warned about (ADR-0058: replace vigilance with something
computed). `extractSql(methodName)` now reads the tagged template out of
`overview.repository.ts` and **throws** rather than returning something plausible if it cannot find
the method or bound the template. Its first run then failed on
`trailing junk after numeric literal` — because Prisma binds `${organizationId}` and the source
therefore carries no quotes of its own, which the hand-copy had silently owned. That is the detail
an extractor must restate and a copy never has to think about, and it failed loudly, which is the
point.

---

## 1. FC-2 — endpoint latency (bar: p95 < 200 ms)

| Shape                 | Plans | Activities | Rows |  p50 |  **p95** | min–max   | Verdict  |
| --------------------- | ----: | ---------: | ---: | ---: | -------: | --------- | -------- |
| typical installation  |    16 |      2,880 |    8 | 20.4 | **25.7** | 15.1–45.8 | **PASS** |
| scale tier (ADR-0066) |    10 |     20,000 |    8 | 28.5 | **32.3** | 26.9–32.5 | **PASS** |
| breadth               |   459 |     18,360 |    8 | 37.2 | **51.9** | 32.3–64.0 | **PASS** |
| extra-large           | 3,000 |    120,000 |    8 | 45.5 | **59.3** | 41.5–72.8 | **PASS** |

**Every shape passes, with 140.7 ms of headroom at the worst.** That figure replaces M0's 156.8 ms
as the number M4 turns on.

### What the delta against M0 does and does not say

| Shape                 | M0 p95 | M3 p95 |     Δ | M3 spread | Reading           |
| --------------------- | -----: | -----: | ----: | --------: | ----------------- |
| typical installation  |   24.3 |   25.7 |  +1.4 |      30.7 | **INDETERMINATE** |
| scale tier (ADR-0066) |   23.2 |   32.3 |  +9.1 |       5.6 | a real increase   |
| breadth               |   29.6 |   51.9 | +22.3 |      31.7 | **INDETERMINATE** |
| extra-large           |   43.2 |   59.3 | +16.1 |      31.3 | **INDETERMINATE** |

**Three of the four deltas are smaller than this run's own run-to-run spread**, so they are
INDETERMINATE rather than measurements of anything (ADR-0128: an instrument whose spread exceeds the
difference it is being asked about cannot answer). Only the scale tier's +9.1 ms clears its spread
and is a real increase.

**And the comparison is weaker than even that suggests, which is stated rather than glossed.** The
`app` database was emptied between the two runs — a direct `vitest` invocation using
`apps/api/.env` pointed `clearDomainData` at it — so the two runs seeded onto different starting
states. This is **not a controlled before/after**. What it is, and what the milestone is gated on,
is an absolute reading against an absolute bar: **59.3 ms against 200.**

Attributing any of it to the standing read would need a paired same-sitting run with the read
switched off, which is not worth the cost while the worst figure sits at 30% of the bar. If M4
needs the attribution, that is the run to take.

---

## 2. FC-3 — no JIT cliff

### The recently-changed query (bar: no `JIT:` node, estimated cost < 100,000)

| Shape                 | Estimated total cost | `JIT:` node? | Verdict  |
| --------------------- | -------------------: | ------------ | -------- |
| typical installation  |                   88 | no           | **PASS** |
| scale tier (ADR-0066) |                   50 | no           | **PASS** |
| breadth               |                2,155 | no           | **PASS** |
| extra-large           |               13,951 | no           | **PASS** |

### The standing query — M3's addition, same bar

| Shape                 | Plans graded | Estimated total cost | `JIT:` node? | Verdict  |
| --------------------- | -----------: | -------------------: | ------------ | -------- |
| typical installation  |            8 |                3,185 | no           | **PASS** |
| scale tier (ADR-0066) |            8 |                3,853 | no           | **PASS** |
| breadth               |            8 |                2,438 | no           | **PASS** |
| extra-large           |            8 |                1,388 | no           | **PASS** |

**The prediction held and is worth stating because it is the failure this task was told to stop
on.** M3-F1's risk note says R2 "is bounded by ≤ 13 plans and is expected to be cheap — **expected
is not measured** — and if FC-3 shows JIT firing at any shape the milestone stops and M4-T2's
`database-architect` engagement is brought forward."

The cost is **flat across shapes and does not track the plan count at all** — 1,388 at 3,000 plans
against 3,185 at 16 — which is the signature of a query driving off the plan-id filter rather than
scanning the organisation. It is what the bounded design predicted, confirmed rather than assumed.
The ids graded are the ones the endpoint would really pass, taken from the recently-changed query's
own output rather than invented.

**No `database-architect` engagement, and no index.** There is no schema change in M3 — no model, no
column, no constraint, no migration — so there is nothing for that agent to design. Recorded
explicitly so "the agent was not run" cannot later read as an oversight (§19.3's rule is about
changes that exist).

---

## 3. A dead accessibility affordance, caught by reading the hook rather than by anything failing

`WhereWorkStandsSection` was first written calling
`useSettledCountAnnouncement({ pending: false, … })`, so that a screen-reader user would be told how
many programmes had been reported when the payload landed. (It never left the working tree — it was
caught before M3's commit, which is the one respect in which this is a better outcome than the
lint errors in §5.)

**It could never have fired.** That hook announces only if it has previously seen `pending: true` —
its whole discriminator is "was a skeleton on screen?", deliberately, so a warm cached render does
not talk over a reader who has just arrived. A section that mounts only after the data has settled
never passes through a pending state, so `sawPending` is never set and the `announce` call is
unreachable. It looked exactly like a working affordance, every test passed, and no gate in this
repository can see it.

That is the ADR-0081 shape one layer down: not a capability with no entry point, but an **entry
point with no capability behind it**.

It is **removed rather than revived**, because reviving it would have been wrong too. This screen
announces once, from "Recently changed" — neither "Jump back in" nor "Needs your attention"
announces at all — and that sentence already speaks for the same eight plans this section describes.
A second announcement about one list is noise in the one channel a screen-reader user cannot skim
past.

---

## 4. One instruction deliberately not followed, and why

M3's journey line says to "assert the `showing N of M` line is present and correct". **There is no
such line in M3, and building one here would have been wrong twice over.**

`shown`/`total` is **M4-T1's deliverable**, listed there by name — "the org-wide `WHERE`, the cap of
8, and `shown`/`total` always travelling together" — and it needs a count of the organisation's
active plans, which the M3 read does not make and has no reason to. Half-building it here would put
two count implementations in the tree, one of which M4 would then have to reconcile or delete.

And in M3 the number would say nothing a reader needs: the section covers exactly the plans
"Recently changed" covers, which is the list immediately above it on the same screen. "Showing 8 of
8" is noise; "showing 8 of 50" is a claim about a scope this section does not have.

What the section does instead is what its neighbour does: **state its scope in its caption** — "How
each recently-changed programme is tracking against its baseline". That is the same mechanism
"Recently changed" uses for the same limit, and it is honest on the day M4 is withdrawn as well as
on the day it lands.

Recorded rather than silently skipped, because a plan is a claim too (ADR-0133) and stepping over a
noticed discrepancy leaves the plan exactly as wrong as not noticing it (ADR-0071). **M4 inherits the
line**, where the count it describes will exist.

---

## 5. M1 and M2 were pushed with `pnpm prepush` red, and the instrument that hid it was mine

Running the gate before M3's commit turned up **six lint errors in already-pushed code**, all mine:

| Where                                             | Milestone | What                                     |
| ------------------------------------------------- | --------- | ---------------------------------------- |
| `invitations/invitation.repository.ts`            | M1        | missing blank line between import groups |
| `members/components/InvitationsSection.tsx:49`    | M1        | `Date.now()` called during render        |
| `members/components/InvitationsSection.test.tsx`  | M1        | `async` with no `await`                  |
| `overview/freshness-copy.structural.test.ts` (×3) | M2        | import order                             |

They were confirmed pre-existing by stashing the M3 changes and re-running. Most are cosmetic; the
`Date.now()` one is not, and the rule was pointing at something real — a value read during render
makes the output depend on when React happened to run it, so the fix is `dataUpdatedAt`, the instant
the payload actually arrived, which is what `OverviewScreen` already uses one level up for the same
reason.

What the set means is that **`pnpm prepush` was not run before either push**, against CLAUDE.md
§19.8, which names it as one command for exactly this reason.

**The thing that let it go unnoticed for two milestones is a pipeline I wrote.** The check looked
like this:

```
pnpm lint 2>&1 | grep -E "error|warning" | head -15; echo "LINT_EXIT_CHECKED"
```

A pipeline's exit status is its LAST command's, and `echo` always succeeds — so the reassuring
`LINT_EXIT_CHECKED` was reporting on `echo`. The `head -15` then truncated the API's errors out of
view on one run and the web's on another. An instrument that prints a confident line while
measuring nothing is the failure mode this repository keeps recording (ADR-0130's sweep that
"reported nine false greens", ADR-0097 Landing C's `PROCEED` from an `undefined`), and this is that
shape in a shell one-liner.

**And the same session then produced a second, worse instrument failure, twice.** `scripts/prepush.sh`
writes every gate's output to the single path `/tmp/prepush-last.log`, truncating it per gate. Two
concurrent `pnpm prepush` runs therefore interleave into one file — so a run reports `FAIL lint` and
prints, as that failure's evidence, a line of another run's passing test output. It happened, was
diagnosed, and then happened again half an hour later because the second run was started without
first checking that the first had stopped. The final verdict line (`FAILED: lint check:counts`)
directly contradicted the per-gate lines above it (`ok lint`), which is what made it visible at all.

Two rules, both cheap: **never start a sweep without confirming none is running**
(`ps aux | grep -cE "[p]repush|[t]urbo|[v]itest"` must be 0), and **give each run its own log file**
rather than the shared one. The second is also ADR-0099's recorded finding — a sweep measures the
tree it runs against — one layer over: a sweep also measures whatever else is writing where it
writes.

The rule that replaces the pipeline is not "be careful with pipes": it is **run the gate, not its
parts**.
`scripts/prepush.sh` derives its own task list and reports each gate's real status precisely so
nobody has to assemble one — which is what §19.8 says, and what following it would have caught the
day M1 landed.

---

## 6. What this does NOT establish

- **Nothing about M4.** R3 covers every active plan in the organisation rather than eight, so its
  cost is a different question with a different answer, and it is gated on its own re-measurement
  **in one sitting** — which, after this, means with the standing read already present in the
  baseline.
- **Nothing about the calendar resolution at scale.** Every shape here seeds plans with no calendar
  of their own, so `loadCalendarPort` was never called during these timings. The read's cost was
  measured directly instead: on the deployed-shaped database, **7 distinct calendars serve 4,032
  plans**, and one load is an index scan on the primary key (0.06 ms) plus a four-page scan of a
  hundred-row table (0.11 ms), issued in parallel across the deduplicated set. That is the argument
  for the frame; it is not the same thing as having timed the endpoint with calendars attached.
- **Nothing about a cold cache.** These are warm figures after five warm-up requests, by design —
  the reader who waits is the one who has just signed in and is about to sign in again tomorrow.
